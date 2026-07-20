import { create } from 'zustand';
import {
  getApiBase,
  setApiBase,
  fetchJson,
  requestCodeBuddy,
  getAcpSessionToken,
  getAuthToken,
  setAcpSessionToken,
  checkAuth as apiCheckAuth,
  authLogin as apiAuthLogin,
  authLogout as apiAuthLogout,
  setAuthToken,
  isAcpAuthenticationError,
} from './lib/acp';
import { parseHashRoute, setHashRoute } from './lib/routes';
import {
  fsList,
  fsSearchContent,
  fsSearchFiles,
  createWatcher,
  pollWatcher,
  removeWatcher,
  downloadFile,
  fsMkdir,
  fsMove,
  fsRemove,
  fsWrite,
} from './lib/fs';
import {
  fetchSessionStats,
  fetchStats as fetchStatsApi,
  fetchScheduledTasks,
  createScheduledTask,
  deleteScheduledTask,
  fetchTraceList,
  fetchWorkerLogs as fetchWorkerLogsApi,
  updateSettingByKey as updateSettingByKeyApi,
  deleteSession as apiDeleteSession,
  renameSession as apiRenameSession,
  fetchTaskTemplates as apiFetchTaskTemplates,
  refreshTaskTemplates as apiRefreshTaskTemplates,
  uninstallPlugin as apiUninstallPlugin,
  enablePlugin as apiEnablePlugin,
  disablePlugin as apiDisablePlugin,
  installPlugin as apiInstallPlugin,
  addMarketplace as apiAddMarketplace,
  removeMarketplace as apiRemoveMarketplace,
  fetchMarketplaces as apiFetchMarketplaces,
} from './lib/ops';
import { closeAssistantStream, pushUserMessage, reduceAcpEvent, resetSeenContent } from './lib/timeline';
import {
  activeProject,
  activeThread,
  createProjectRecord,
  createThreadRecord,
  emptyProductState,
  normalizeProductState,
  productStateSnapshot,
} from './lib/product-state';
import { ConversationManager } from './lib/conversation-manager';
import {
  isGuiSettingKey,
  loadGuiSettings,
  normalizeGuiSettings,
  saveGuiSettings,
  SETTINGS_CACHE_KEY,
  stripGuiSettings,
} from './lib/gui-settings';
import { visibleProjectThreads } from './lib/session-sidebar';
import { hasCompletePromptResponse, hasPromptRunActivity } from './store/helpers/prompt-completion';
import { runtimeAuthScopeChanged } from './store/helpers/runtime-auth';
import {
  ACTIVE_THREAD_RUNTIME_KEYS,
  emptyThreadRuntime,
  responseTerminalRuntimePatch,
  sessionActionItemMatches,
} from './store/helpers/thread-runtime';
import { createQueueHelpers } from './store/helpers/queues';
import {
  makePane,
  terminalStateFromProject,
  workspaceStateFromProject,
  workspaceStateSnapshot,
  resetProjectRuntimeViews,
} from './store/helpers/terminal-workspace-state';
import { createProductPersistSlice } from './store/slices/product-persist';
import { createProjectsRuntimeSlice } from './store/slices/projects-runtime';
import { createSessionsChatSlice } from './store/slices/sessions-chat';

export { hasCompletePromptResponse } from './store/helpers/prompt-completion';
export { runtimeAuthScopeChanged } from './store/helpers/runtime-auth';

const conversations = new ConversationManager();
let bootstrapOperation = null;
let routeListenerBound = false;
let conversationEventsBound = false;
let runtimeListenerBound = false;
let authFailureListenerBound = false;
const threadTimelinePersistTimers = new Map();
const threadDraftPersistTimers = new Map();
const terminalStatePersistTimers = new Map();
const workspaceStatePersistTimers = new Map();
let fileDirectoryRequestId = 0;
let filePreviewRequestId = 0;
let fileSearchRequestId = 0;
let fileNameSearchRequestId = 0;
let fileSaveRequestId = 0;
let fileDiskSyncRequestId = 0;
let fileWatcherRequestId = 0;
let projectNavigationVersion = 0;
let authRequestVersion = 0;
let productStateSaveChain = Promise.resolve(true);
const scopedRequestVersions = new Map();
const settingWriteVersions = new Map();
const settingWriteChains = new Map();
const confirmedSettingValues = new Map();
const runtimeOperationChains = new Map();
const sessionSettingChains = new Map();
const threadMutationChains = new Map();
const sessionActionOperations = new Map();
const promptQueueOperationChains = new Map();
let dirtyFileConfirmationResolve = null;
const DELETED_SESSION_HISTORY_LIMIT = 200;

const {
  beginProjectNavigation,
  isProjectNavigationCurrent,
  finishProjectNavigation,
  isProjectMutationNavigation,
  beginScopedRequest,
  isScopedRequestCurrent,
  queueProjectRuntimeOperation,
  queueSessionSettingOperation,
  queueThreadMutation,
  runUniqueSessionAction,
  queuePromptQueueOperation,
} = createQueueHelpers({
  runtimeOperationChains,
  sessionSettingChains,
  threadMutationChains,
  sessionActionOperations,
  promptQueueOperationChains,
  scopedRequestVersions,
  getProjectNavigationVersion: () => projectNavigationVersion,
  incrementProjectNavigationVersion: () => {
    projectNavigationVersion += 1;
    return projectNavigationVersion;
  },
});

function deletedSessionIdsForProject(project) {
  const ids = project?.preferences?.deletedSessionIds;
  return Array.isArray(ids) ? ids.filter((id) => typeof id === 'string' && id) : [];
}

function projectWithDeletedSession(project, sessionId) {
  if (!project || !sessionId) return project;
  const deletedSessionIds = deletedSessionIdsForProject(project).filter((id) => id !== sessionId);
  deletedSessionIds.push(sessionId);
  return {
    ...project,
    preferences: {
      ...(project.preferences || {}),
      deletedSessionIds: deletedSessionIds.slice(-DELETED_SESSION_HISTORY_LIMIT),
    },
    updatedAt: new Date().toISOString(),
  };
}

async function connectActiveProjectRuntime(set, get, projectId, runtime) {
  if (projectId !== get().activeProjectId) return false;
  const nextBase = `http://127.0.0.1:${runtime.port}`;
  const previousBase = get().apiBase;
  setApiBase(nextBase);
  set({ apiBase: nextBase });
  if (runtimeAuthScopeChanged(previousBase, nextBase)) {
    setAcpSessionToken(null);
    setAuthToken(null);
  }
  if (!runtime.password) return true;

  try {
    await requestCodeBuddy(`${nextBase}/?password=${encodeURIComponent(runtime.password)}`, {
      headers: { 'X-CodeBuddy-Request': '1' },
      credentials: 'include',
    });
    const loginResult = await apiAuthLogin(runtime.password, {
      baseUrl: nextBase,
      persistToken: false,
    });
    if (projectId !== get().activeProjectId) return false;
    if (!loginResult?.success) throw new Error(loginResult?.error || '运行时登录失败');
    setAuthToken(loginResult.token || null);
    set({ authViewState: 'authenticated', authError: null });
    return true;
  } catch (error) {
    if (projectId !== get().activeProjectId) return false;
    throw error;
  }
}

function serializePromptQueue(queue) {
  return (Array.isArray(queue) ? queue : [])
    .filter((item) => item && typeof item.text === 'string')
    .map((item) => ({
      id: item.id || `prompt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      text: item.text,
      draftText: typeof item.draftText === 'string' ? item.draftText : item.text,
      createdAt: Number(item.createdAt) || Date.now(),
      attachments: (Array.isArray(item.attachments) ? item.attachments : [])
        .filter((attachment) => attachment && typeof attachment.path === 'string')
        .map((attachment) => ({
          name: attachment.name || attachment.path,
          path: attachment.path,
          size: Number(attachment.size) || 0,
          kind: attachment.kind === 'image' ? 'image' : 'text',
          mimeType: attachment.mimeType || null,
        })),
    }));
}

function mergeAttachmentSelection(runtime, selection) {
  const imageSupported = Boolean(
    runtime.capabilities?.promptCapabilities?.image || runtime.capabilities?.prompt_capabilities?.image,
  );
  const accepted = [];
  const rejected = [];
  for (const attachment of selection || []) {
    if (attachment.kind === 'unsupported') rejected.push(`${attachment.name}: ${attachment.error}`);
    else if (attachment.kind === 'image' && !imageSupported)
      rejected.push(`${attachment.name}: 当前运行时未声明图片输入能力`);
    else accepted.push(attachment);
  }
  const pendingAttachments = [...runtime.pendingAttachments];
  const added = [];
  for (const attachment of accepted) {
    const duplicate = pendingAttachments.some((item) => item.path === attachment.path && item.kind === attachment.kind);
    if (duplicate) continue;
    pendingAttachments.push(attachment);
    added.push(attachment);
  }
  return { pendingAttachments, added, rejected };
}

function mergeTeamState(current, update) {
  if (!update || typeof update !== 'object') return current || null;
  if (update.type === 'team_deleted') return null;
  return {
    ...(current || {}),
    ...update,
    members: Array.isArray(update.members) ? update.members : current?.members || [],
  };
}

const RESPONSE_BUSY_STATUSES = new Set(['running', 'waiting', 'cancelling']);
const PROMPT_CONTENT_SESSION_UPDATES = new Set([
  'agent_message_chunk',
  'agent_thought_chunk',
  'tool_call',
  'tool_call_update',
]);
const FINAL_RESPONSE_GRACE_MS = 250;

function threadResponseInProgress(state, threadId) {
  const thread = state.threadsById[threadId];
  const runtime = state.threadRuntimeById[threadId] || emptyThreadRuntime();
  return Boolean(RESPONSE_BUSY_STATUSES.has(thread?.status) || runtime.isAwaitingResponse || runtime.activePromptRunId);
}

function threadSelectionProtection(state, threadId) {
  const runtime = threadId ? state.threadRuntimeById[threadId] || emptyThreadRuntime() : null;
  const preserveReplaySelection = Boolean(runtime?.historyReplayActive);
  // ultracode 是 UI 侧复合模式（/effort ultracode 写的是 session.meta.workflowEffortLevel，
  // 服务端 thought_level 字段仍是进入前的档位）。任何 config_option_update（切模式/模型触发）
  // 都会把本地 ultracode 覆盖回旧档位，因此当前为 ultracode 时保护 thoughtLevel。
  const preserveThoughtLevel = runtime?.thoughtLevel === 'ultracode';
  return {
    preserveModel: preserveReplaySelection,
    preserveMode: preserveReplaySelection,
    preserveThoughtLevel,
  };
}

function selectionMatchKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^custom-local:/, '');
}

function resolveAvailableSelection(choices, selectionId) {
  if (!selectionId) return null;
  const normalized = Array.isArray(choices) ? choices : [];
  if (normalized.length === 0) return selectionId;
  const exact = normalized.find((item) => (item.id || item.modelId || item.modeId) === selectionId);
  if (exact) return exact.id || exact.modelId || exact.modeId;
  const selectionKey = selectionMatchKey(selectionId);
  const alias = normalized.find((item) => {
    const id = item.id || item.modelId || item.modeId;
    return selectionMatchKey(id) === selectionKey || selectionMatchKey(item.name || item.label) === selectionKey;
  });
  return alias ? alias.id || alias.modelId || alias.modeId : null;
}


function waitForMilliseconds(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function isMethodNotFoundError(error) {
  return error?.code === -32601 || /method not found/i.test(String(error?.message || ''));
}

function cancelPendingTimelineActions(timeline) {
  const cancelledAt = Date.now();
  return (Array.isArray(timeline) ? timeline : []).map((item) => {
    const pendingInterruption = item?.type === 'interruption' && !['resolved', 'expired', 'cancelled'].includes(item.status);
    const pendingQuestion = item?.type === 'question' && !['answered', 'expired', 'cancelled'].includes(item.status);
    if (!pendingInterruption && !pendingQuestion) return item;
    return {
      ...item,
      status: 'cancelled',
      meta: { ...(item.meta || {}), cancelledAt },
    };
  });
}
function promptResultErrorMessage(result) {
  const candidates = [
    result?.errorMessage,
    result?.error?.message,
    result?.message,
    result?.error,
    result?.data?.message,
    result?.data?.errorMessage,
  ];
  let raw = '';
  for (const item of candidates) {
    if (typeof item === 'string' && item.trim()) {
      raw = item.trim();
      break;
    }
    if (item && typeof item === 'object') {
      const nested = item.message || item.errorMessage || item.error?.message;
      if (typeof nested === 'string' && nested.trim()) {
        raw = nested.trim();
        break;
      }
    }
  }
  const stopReason = String(result?.stopReason || '').toLowerCase();
  const looksLikeAuth =
    result?.category === 'auth' ||
    /authentication required|401|请.*登录|sign in|auth-type|token-type/i.test(raw || '');
  const isAuthRefusal = result?.category === 'auth' || (stopReason === 'refusal' && (!raw || looksLikeAuth));
  if (!raw) {
    // CodeBuddy CLI 在鉴权失败时常只回 stopReason=refusal，不带 errorMessage
    if (isAuthRefusal || stopReason === 'refusal') {
      return 'CodeBuddy 云端账号未登录或登录已失效。请在应用内完成一次登录（浏览器授权），完成后会话会自动恢复。';
    }
    return '模型未能完成本轮回复';
  }
  try {
    const parsed = JSON.parse(raw);
    raw = parsed?.message || parsed?.error?.message || raw;
  } catch (_) {
    /* keep raw */
  }
  if (/authentication required|401|请.*登录|sign in|auth-type|token-type/i.test(raw) || result?.category === 'auth') {
    return 'CodeBuddy 云端账号未登录或登录已失效。请在应用内完成一次登录（浏览器授权），完成后会话会自动恢复。';
  }
  return raw;
}

function normalizeSessions(payload) {
  const data = payload?.data ?? payload ?? {};
  return Array.isArray(data.sessions) ? data.sessions : [];
}

function normalizeWorkers(payload) {
  const data = payload?.data ?? payload ?? [];
  return Array.isArray(data) ? data : [];
}

function settingScopeKey(projectId, key) {
  return `${projectId || 'global'}:${key}`;
}

function normalizePlugins(payload) {
  const data = payload?.data ?? payload ?? [];
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.plugins)) return data.plugins;
  if (data && typeof data === 'object' && data.name) return [data];
  return [];
}

function normalizeModels(models = []) {
  return (Array.isArray(models) ? models : [])
    .map((model) => {
      if (typeof model === 'string') return { id: model, name: model };
      const id = model?.modelId || model?.id || model?.value;
      return id ? { id, name: model?.name || model?.label || id } : null;
    })
    .filter(Boolean);
}

function normalizeModes(modes = []) {
  return (Array.isArray(modes) ? modes : [])
    .map((mode) => {
      if (typeof mode === 'string') return { id: mode, name: mode };
      const id = mode?.modeId || mode?.id || mode?.value;
      return id ? { id, name: mode?.name || mode?.label || id } : null;
    })
    .filter(Boolean);
}

function configOptionChoices(option) {
  for (const value of [option?.options, option?.values, option?.availableValues, option?.choices, option?.enum]) {
    if (Array.isArray(value)) return value;
  }
  return [];
}

function readSettingPath(settings, path) {
  return String(path || '')
    .split('.')
    .reduce((value, key) => value?.[key], settings);
}

function settingsCacheSnapshot(settings) {
  const next = stripGuiSettings(settings);
  delete next['gateway.auth'];
  if (next.gateway && typeof next.gateway === 'object' && !Array.isArray(next.gateway)) {
    const gateway = { ...next.gateway };
    delete gateway.auth;
    next.gateway = gateway;
  }
  return next;
}

function persistSettingsCache(settings) {
  try {
    localStorage.setItem(SETTINGS_CACHE_KEY, JSON.stringify(settingsCacheSnapshot(settings)));
  } catch (_) {}
}

function writeSettingPath(settings, path, value, remove = false) {
  const keys = String(path || '')
    .split('.')
    .filter(Boolean);
  const next = { ...(settings || {}) };
  if (!keys.length) return next;
  let cursor = next;
  for (const key of keys.slice(0, -1)) {
    const current = cursor[key];
    cursor[key] = current && typeof current === 'object' && !Array.isArray(current) ? { ...current } : {};
    cursor = cursor[key];
  }
  const leaf = keys[keys.length - 1];
  if (remove) delete cursor[leaf];
  else cursor[leaf] = value;
  return next;
}
function requestDirtyFileConfirmation(set, get, actionLabel = '继续操作') {
  const state = get();
  if (!state.fileDirty || !state.selectedFile) return Promise.resolve(true);

  if (dirtyFileConfirmationResolve) dirtyFileConfirmationResolve(false);

  return new Promise((resolve) => {
    dirtyFileConfirmationResolve = resolve;
    set({
      dirtyFileConfirmation: { filePath: state.selectedFile, actionLabel },
    });
  });
}

function resetFileWorkspace(path) {
  fileDirectoryRequestId += 1;
  filePreviewRequestId += 1;
  fileSearchRequestId += 1;
  fileNameSearchRequestId += 1;
  fileSaveRequestId += 1;
  fileDiskSyncRequestId += 1;
  return {
    fileCwd: path || '.',
    fileEntries: [],
    fileLoading: false,
    selectedFile: null,
    filePreview: '',
    fileSavedContent: '',
    fileDirty: false,
    fileSaving: false,
    fileExternalChange: null,
    filePreviewLoading: false,
    fileSearchQuery: '',
    fileSearchResults: [],
    fileSearching: false,
    fileNameQuery: '',
    fileNameResults: [],
    fileNameSearching: false,
  };
}

export const useStore = create((set, get) => {
  const productPersist = createProductPersistSlice(set, get, {
    threadTimelinePersistTimers,
    threadDraftPersistTimers,
    terminalStatePersistTimers,
    workspaceStatePersistTimers,
    getProductStateSaveChain: () => productStateSaveChain,
    setProductStateSaveChain: (value) => {
      productStateSaveChain = value;
    },
    serializePromptQueue,
  });

  const projectsRuntime = createProjectsRuntimeSlice(set, get, {
    conversations,
    connectActiveProjectRuntime,
    beginProjectNavigation,
    isProjectNavigationCurrent,
    finishProjectNavigation,
    isProjectMutationNavigation,
    queueProjectRuntimeOperation,
    requestDirtyFileConfirmation,
    resetFileWorkspace,
  });

  const sessionsChat = createSessionsChatSlice(set, get, {
    conversations,
    queueThreadMutation,
    queueSessionSettingOperation,
    runUniqueSessionAction,
    queuePromptQueueOperation,
    beginScopedRequest,
    isScopedRequestCurrent,
    beginProjectNavigation,
    isProjectNavigationCurrent,
    finishProjectNavigation,
    isProjectMutationNavigation,
    requestDirtyFileConfirmation,
    resetFileWorkspace,
    serializePromptQueue,
    mergeAttachmentSelection,
    mergeTeamState,
    normalizeModels,
    normalizeModes,
    configOptionChoices,
    resolveAvailableSelection,
    threadResponseInProgress,
    threadSelectionProtection,
    cancelPendingTimelineActions,
    promptResultErrorMessage,
    waitForMilliseconds,
    isMethodNotFoundError,
    projectWithDeletedSession,
    RESPONSE_BUSY_STATUSES,
    PROMPT_CONTENT_SESSION_UPDATES,
    FINAL_RESPONSE_GRACE_MS,
  });

  return {
  ...emptyProductState(),
  productStateLoaded: false,
  threadRuntimeById: {},
  apiBase: getApiBase(),
  route: typeof window === 'undefined' ? 'chat' : parseHashRoute(),
  connectionState: 'connecting',
  // 鉴权态：对照源 viewState ∈ loading|login|authenticated
  authViewState: 'loading',
  authError: null,
  authSubmitting: false,
  codeBuddyAccountAuthState: 'unknown',
  codeBuddyAccountAuthUrl: null,
  codeBuddyAccountAuthError: null,
  codeBuddyAccountUser: null,
  codeBuddyAccountAuthMethods: [],
  sessionId: null,
  sessionToken: null,
  currentModel: null,
  models: [],
  modes: [],
  currentMode: 'default',
  newSessionBusy: false,
  newSessionProjectId: null,
  newSessionError: null,
  projectNavigationBusy: false,
  projectNavigationTargetId: null,
  projectNavigationError: null,
  info: null,
  settings: null,
  guiSettings: loadGuiSettings(),
  infoLoaded: false,
  settingsLoaded: false,
  sessionTitle: null,
  usage: null,
  availableCommands: [],
  sessions: [],
  workers: [],
  workersError: null,
  plugins: [],
  marketplaces: [],
  pluginError: null,
  marketplaceError: null,
  pluginBusy: null, // 当前操作中的插件名/动作，避免 UI 重入
  timeline: [],
  // 发消息后等 agent 首 SSE 块期间：UI 需立即显"思考中"态（发送键变终止键）
  // 收到 agent_message_chunk/agent_thought_chunk/tool_call 等真内容事件时清
  isAwaitingResponse: false,
  promptStartedAt: null,
  activePromptRunId: null,
  sidebarCollapsed: false,
  changesCount: 0,
  leftTab: 'chat',
  terminalSessions: [],
  ptySessionId: null,
  terminalPanes: [makePane()],
  activePaneId: null,
  traces: [],
  metrics: null,
  metricsError: null,
  stats: null, // 全局 stats（对照源 GET /api/v1/stats）
  sessionStats: null, // 当前会话 stats（对照源 GET /api/v1/stats/session?sessionId=）
  statsError: null,
  statsLoading: false,
  scheduledTasks: [],
  scheduledTasksError: null,
  taskTemplates: [],
  taskTemplatesError: null,
  taskTemplatesLoading: false,
  error: null,
  toasts: [],
  promptSuggestion: null,
  permissionRequests: [],
  questions: [],
  teamState: null,
  agentPhase: null,
  progress: null,
  historyReplayActive: false,
  fileCwd: '.',
  // 工作区路径：决定 ACP 会话 agent 工具调用目录、Git cwd、文件树根的统一来源
  // 通过 setWorkspace(path) 切换 = 用新 cwd 起新会话；持久化在 localStorage
  workspacePath: null,
  fileEntries: [],
  fileLoading: false,
  fileSearchQuery: '',
  fileSearchResults: [],
  fileSearching: false,
  // 文件名搜索（对照源 GET /api/v1/fs/search?query&limit，补全/打开文件面板）
  fileNameQuery: '',
  fileNameResults: [],
  fileNameSearching: false,
  watcherId: null,
  selectedFile: null,
  filePreview: '',
  fileSavedContent: '',
  fileDirty: false,
  fileSaving: false,
  fileExternalChange: null,
  filePreviewLoading: false,
  dirtyFileConfirmation: null,

  getThreadClient(threadId = get().activeThreadId) {
    const thread = get().threadsById[threadId];
    const project = thread ? get().projectsById[thread.projectId] : null;
    if (!thread || !project?.runtimePort) return null;
    return conversations.getClient(threadId, `http://127.0.0.1:${project.runtimePort}`);
  },

  resolveDirtyFileConfirmation(confirmed) {
    const resolve = dirtyFileConfirmationResolve;
    dirtyFileConfirmationResolve = null;
    set({ dirtyFileConfirmation: null });
    resolve?.(Boolean(confirmed));
  },

  confirmDirtyFileAction(actionLabel) {
    return requestDirtyFileConfirmation(set, get, actionLabel);
  },

  patchThreadRuntime(threadId, patch) {
    if (!threadId) return;
    set((state) => {
      const nextRuntime = {
        ...emptyThreadRuntime(),
        ...(state.threadRuntimeById[threadId] || {}),
        ...patch,
      };
      const result = {
        threadRuntimeById: { ...state.threadRuntimeById, [threadId]: nextRuntime },
      };
      if (state.activeThreadId === threadId) {
        for (const key of ACTIVE_THREAD_RUNTIME_KEYS) result[key] = nextRuntime[key];
      }
      return result;
    });
  },

  activateThreadRuntime(threadId) {
    const runtime = { ...emptyThreadRuntime(), ...(get().threadRuntimeById[threadId] || {}) };
    const patch = {};
    for (const key of ACTIVE_THREAD_RUNTIME_KEYS) patch[key] = runtime[key];
    const client = conversations.peek(threadId);
    patch.sessionToken = client?.sessionToken || null;
    setAcpSessionToken(patch.sessionToken);
    set(patch);
  },

  ...productPersist,

  async updateActiveThread(patch) {
    return get().updateThreadRecord(get().activeThreadId, patch);
  },

  setThreadDraft(value) {
    const threadId = get().activeThreadId;
    if (!threadId) return;
    set((state) => ({
      threadsById: {
        ...state.threadsById,
        [threadId]: {
          ...state.threadsById[threadId],
          draft: String(value || ''),
          updatedAt: new Date().toISOString(),
        },
      },
    }));
    get().scheduleThreadDraftPersist(threadId);
  },

  clearPromptSuggestion(threadId = get().activeThreadId) {
    if (!threadId || !get().threadsById[threadId]) return false;
    get().patchThreadRuntime(threadId, { promptSuggestion: null });
    return true;
  },

  async chooseAttachments() {
    const state = get();
    const projectId = state.activeProjectId;
    const threadId = state.activeThreadId;
    if (!threadId || !state.threadsById[threadId]) {
      set({ error: '请先创建或选择一个会话' });
      return [];
    }
    if (!window.electronAPI?.chooseAttachments) {
      set({ error: '附件选择不可用' });
      return [];
    }
    set({ error: null });
    try {
      const selected = await window.electronAPI.chooseAttachments();
      const thread = get().threadsById[threadId];
      if (!thread || thread.projectId !== projectId) return [];
      const runtime = get().threadRuntimeById[threadId] || emptyThreadRuntime();
      const { pendingAttachments, added, rejected } = mergeAttachmentSelection(runtime, selected);
      get().patchThreadRuntime(threadId, { pendingAttachments });
      if (rejected.length && get().activeProjectId === projectId && get().activeThreadId === threadId) {
        set({ error: rejected.join('\n') });
      }
      return added;
    } catch (error) {
      if (get().activeProjectId === projectId && get().activeThreadId === threadId) {
        set({ error: error.message || '选择附件失败' });
      }
      return [];
    }
  },

  async addDroppedAttachments(files) {
    const state = get();
    const projectId = state.activeProjectId;
    const threadId = state.activeThreadId;
    if (!threadId || !state.threadsById[threadId]) {
      const message = '请先创建或选择一个会话';
      set({ error: message });
      return { added: [], error: message };
    }
    if (!window.electronAPI?.readDroppedAttachments) {
      const message = '附件拖放接口不可用';
      set({ error: message });
      return { added: [], error: message };
    }
    set({ error: null });
    try {
      const selected = await window.electronAPI.readDroppedAttachments(files);
      const thread = get().threadsById[threadId];
      if (!thread || thread.projectId !== projectId) return { added: [], error: null };
      const runtime = get().threadRuntimeById[threadId] || emptyThreadRuntime();
      const { pendingAttachments, added, rejected } = mergeAttachmentSelection(runtime, selected);
      get().patchThreadRuntime(threadId, { pendingAttachments });
      const message = rejected.length ? rejected.join('\n') : null;
      if (message && get().activeProjectId === projectId && get().activeThreadId === threadId) {
        set({ error: message });
      }
      return { added, error: message };
    } catch (error) {
      const message = error.message || '读取拖放附件失败';
      if (get().activeProjectId === projectId && get().activeThreadId === threadId) {
        set({ error: message });
      }
      return { added: [], error: message };
    }
  },

  async addClipboardImageAttachment(payload) {
    const state = get();
    const projectId = state.activeProjectId;
    const threadId = state.activeThreadId;
    if (!threadId || !state.threadsById[threadId]) {
      set({ error: '请先创建或选择一个会话' });
      return [];
    }
    if (!state.guiSettings?.enablePasteImageFromClipboard) {
      set({ error: '剪贴板贴图未启用，请先在设置中开启' });
      return [];
    }
    const runtime = state.threadRuntimeById[threadId] || emptyThreadRuntime();
    const imageSupported = Boolean(
      runtime.capabilities?.promptCapabilities?.image || runtime.capabilities?.prompt_capabilities?.image,
    );
    if (!imageSupported) {
      set({ error: '当前运行时未声明图片输入能力' });
      return [];
    }
    if (!window.electronAPI?.saveClipboardImage) {
      set({ error: '剪贴板图片保存接口不可用' });
      return [];
    }
    set({ error: null });
    try {
      const attachment = await window.electronAPI.saveClipboardImage(payload);
      const thread = get().threadsById[threadId];
      if (!thread || thread.projectId !== projectId || get().activeThreadId !== threadId) return [];
      if (!attachment || attachment.kind === 'unsupported') {
        set({ error: attachment?.error || '剪贴板图片读取失败' });
        return [];
      }
      const currentRuntime = get().threadRuntimeById[threadId] || emptyThreadRuntime();
      const pendingAttachments = [...currentRuntime.pendingAttachments, attachment];
      get().patchThreadRuntime(threadId, { pendingAttachments });
      return [attachment];
    } catch (error) {
      if (get().activeProjectId === projectId && get().activeThreadId === threadId) {
        set({ error: error.message || '粘贴图片失败' });
      }
      return [];
    }
  },

  removePendingAttachment(attachmentPath) {
    const threadId = get().activeThreadId;
    const runtime = get().threadRuntimeById[threadId] || emptyThreadRuntime();
    get().patchThreadRuntime(threadId, {
      pendingAttachments: runtime.pendingAttachments.filter((item) => item.path !== attachmentPath),
    });
  },

  setRoute(route) {
    setHashRoute(route);
    set({ route });
  },

  clearError() {
    set({ error: null });
  },

  pushToast(toast) {
    const message = String(toast?.message || '').trim();
    if (!message) return null;
    const id = toast?.id || `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const type = ['success', 'error', 'info'].includes(toast?.type) ? toast.type : 'info';
    const durationMs = Number.isFinite(Number(toast?.durationMs)) ? Number(toast.durationMs) : 4200;
    const entry = { id, type, message, createdAt: Date.now() };
    set((state) => ({
      toasts: [...(Array.isArray(state.toasts) ? state.toasts : []), entry].slice(-5),
    }));
    if (durationMs > 0 && typeof window !== 'undefined') {
      window.setTimeout(() => {
        const dismiss = useStore.getState().dismissToast;
        if (typeof dismiss === 'function') dismiss(id);
      }, durationMs);
    }
    return id;
  },

  dismissToast(id) {
    if (!id) return;
    set((state) => ({
      toasts: (Array.isArray(state.toasts) ? state.toasts : []).filter((item) => item.id !== id),
    }));
  },

  notifyThreadResult(threadId, outcome) {
    const state = get();
    if (!state.guiSettings?.desktopNotificationsEnabled || !window.electronAPI?.showTaskNotification) return false;
    const thread = state.threadsById[threadId];
    const project = thread ? state.projectsById[thread.projectId] : null;
    if (!thread) return false;
    const failed = outcome === 'error';
    const context = [project?.name, thread.title || '新对话'].filter(Boolean).join(' · ');
    const body = `${context}\n${failed ? '后台任务失败，点击进入应用查看详情。' : '后台任务已完成，点击进入应用查看结果。'}`;
    window.electronAPI
      .showTaskNotification({
        projectId: thread.projectId,
        threadId,
        title: failed ? 'CodeBuddy 任务失败' : 'CodeBuddy 任务已完成',
        body,
        outcome,
      })
      .catch(() => null);
    return true;
  },

  getModelDisplayName() {
    const { currentModel, models } = get();
    return models.find((m) => m.id === currentModel || m.modelId === currentModel)?.name || currentModel || '';
  },

  setSidebarCollapsed(value) {
    set({ sidebarCollapsed: value });
  },

  setActivePane(paneId) {
    set({ activePaneId: paneId });
    get().scheduleTerminalStatePersist();
  },

  setFileSearchQuery(value) {
    set({ fileSearchQuery: value });
  },

  setFilePreview(value) {
    set((state) => ({
      filePreview: value,
      fileDirty: Boolean(state.selectedFile) && value !== state.fileSavedContent,
    }));
    get().scheduleWorkspaceStatePersist();
  },

  ...sessionsChat,

  ...projectsRuntime,

  async initializeWorkspace() {
    const project = activeProject(get());
    if (!project?.workspacePath) return false;
    const saved = workspaceStateFromProject(project);
    let opened = await get().openDirectory(saved.fileCwd, { skipDirtyCheck: true, skipWorkspacePersist: true });
    if (!opened && saved.fileCwd !== project.workspacePath) {
      opened = await get().openDirectory(project.workspacePath, { skipDirtyCheck: true, skipWorkspacePersist: true });
    }
    if (!opened) return false;
    if (!saved.selectedFile) {
      get().scheduleWorkspaceStatePersist();
      return true;
    }
    if (saved.fileDirty) {
      set({
        selectedFile: saved.selectedFile,
        filePreview: saved.filePreview,
        fileSavedContent: saved.fileSavedContent,
        fileDirty: true,
        fileSaving: false,
        fileExternalChange: null,
        filePreviewLoading: false,
      });
      get().scheduleWorkspaceStatePersist();
      return true;
    }
    const restored = await get().openFile(saved.selectedFile, { skipDirtyCheck: true, skipWorkspacePersist: true });
    if (!restored) {
      get().setSelectedFile(null);
      return true;
    }
    get().scheduleWorkspaceStatePersist();
    return true;
  },

  async openDirectory(path, options = {}) {
    if (!options.skipDirtyCheck && get().fileDirty) {
      const confirmed = await requestDirtyFileConfirmation(set, get, '打开其他目录');
      if (!confirmed) return false;
      await get().persistActiveProjectWorkspaceState({ discardDirty: true });
    }
    const requestId = ++fileDirectoryRequestId;
    fileSaveRequestId += 1;
    fileDiskSyncRequestId += 1;
    const projectId = get().activeProjectId;
    set({
      fileLoading: true,
      fileCwd: path,
      selectedFile: null,
      filePreview: '',
      fileSavedContent: '',
      fileDirty: false,
      fileSaving: false,
      fileExternalChange: null,
      filePreviewLoading: false,
    });
    try {
      const entries = await fsList(path, 1);
      if (requestId !== fileDirectoryRequestId || projectId !== get().activeProjectId) return false;
      set({ fileEntries: entries, fileLoading: false });
      if (!options.skipWorkspacePersist) get().scheduleWorkspaceStatePersist();
      return true;
    } catch (error) {
      if (requestId !== fileDirectoryRequestId || projectId !== get().activeProjectId) return false;
      set({ fileEntries: [], fileLoading: false, error: error.message });
      return false;
    }
  },

  async openFile(path, options = {}) {
    if (!options.skipDirtyCheck && path !== get().selectedFile && get().fileDirty) {
      const confirmed = await requestDirtyFileConfirmation(set, get, '打开其他文件');
      if (!confirmed) return false;
      await get().persistActiveProjectWorkspaceState({ discardDirty: true });
    }
    const requestId = ++filePreviewRequestId;
    fileSaveRequestId += 1;
    fileDiskSyncRequestId += 1;
    const projectId = get().activeProjectId;
    set({
      selectedFile: path,
      filePreviewLoading: true,
      filePreview: '',
      fileSavedContent: '',
      fileDirty: false,
      fileSaving: false,
      fileExternalChange: null,
    });
    try {
      const content = await downloadFile(path);
      if (requestId !== filePreviewRequestId || projectId !== get().activeProjectId) return false;
      set({ filePreview: content, fileSavedContent: content, fileDirty: false, filePreviewLoading: false });
      if (!options.skipWorkspacePersist) get().scheduleWorkspaceStatePersist();
      return true;
    } catch (error) {
      if (requestId !== filePreviewRequestId || projectId !== get().activeProjectId) return false;
      set({ filePreview: `读取失败: ${error.message}`, filePreviewLoading: false, error: error.message });
      return false;
    }
  },

  setSelectedFile(file) {
    fileSaveRequestId += 1;
    fileDiskSyncRequestId += 1;
    set({
      selectedFile: file,
      filePreviewLoading: !!file,
      filePreview: '',
      fileSavedContent: '',
      fileDirty: false,
      fileSaving: false,
      fileExternalChange: null,
    });
    get().scheduleWorkspaceStatePersist();
  },

  async runFileSearch() {
    const query = get().fileSearchQuery.trim();
    if (!query) return;
    const requestId = ++fileSearchRequestId;
    const projectId = get().activeProjectId;
    set({ fileSearching: true });
    try {
      const results = await fsSearchContent({ query, cwd: get().fileCwd || '.' });
      if (requestId !== fileSearchRequestId || projectId !== get().activeProjectId) return;
      set({ fileSearchResults: results, fileSearching: false });
    } catch (error) {
      if (requestId !== fileSearchRequestId || projectId !== get().activeProjectId) return;
      set({ fileSearchResults: [], fileSearching: false, error: error.message });
    }
  },

  setFileNameQuery(value) {
    set({ fileNameQuery: String(value || '') });
    // 轻输入：清空即清结果，非空时由调用方决定何时触发（避免每键都打后端）
    if (!String(value || '').trim()) set({ fileNameResults: [], fileNameSearching: false });
  },

  // 文件名搜索（对照源 GET /api/v1/fs/search?query&limit=15）
  // 用途：打开文件面板的实时名匹配补全；不同于 runFileSearch 的内容搜索
  async runFileNameSearch() {
    const query = get().fileNameQuery.trim();
    if (!query) {
      set({ fileNameResults: [], fileNameSearching: false });
      return;
    }
    const requestId = ++fileNameSearchRequestId;
    const projectId = get().activeProjectId;
    set({ fileNameSearching: true });
    try {
      const items = await fsSearchFiles(query, { limit: 15 });
      if (requestId !== fileNameSearchRequestId || projectId !== get().activeProjectId) return;
      set({ fileNameResults: items, fileNameSearching: false });
    } catch (error) {
      if (requestId !== fileNameSearchRequestId || projectId !== get().activeProjectId) return;
      set({ fileNameResults: [], fileNameSearching: false, error: error.message });
    }
  },

  async startWatcher(path = null) {
    const target = path || get().fileCwd || '.';
    const requestId = ++fileWatcherRequestId;
    const projectId = get().activeProjectId;
    const previousWatcherId = get().watcherId;
    if (previousWatcherId) {
      set({ watcherId: null });
      try {
        await removeWatcher(previousWatcherId);
      } catch (_) {}
    }
    try {
      const data = await createWatcher(target, true);
      const watcherId = data.watcherId || data.id || null;
      if (!watcherId) return null;
      if (requestId !== fileWatcherRequestId || projectId !== get().activeProjectId || target !== get().fileCwd) {
        try {
          await removeWatcher(watcherId);
        } catch (_) {}
        return null;
      }
      set({ watcherId });
      return watcherId;
    } catch (_) {
      if (requestId === fileWatcherRequestId && projectId === get().activeProjectId) set({ watcherId: null });
      return null;
    }
  },

  async pollWatcher() {
    const watcherId = get().watcherId;
    const projectId = get().activeProjectId;
    if (!watcherId) return [];
    try {
      const events = await pollWatcher(watcherId);
      if (watcherId !== get().watcherId || projectId !== get().activeProjectId) return [];
      return Array.isArray(events) ? events : [];
    } catch (_) {
      if (watcherId === get().watcherId) set({ watcherId: null });
      return [];
    }
  },

  async stopWatcher() {
    fileWatcherRequestId += 1;
    const watcherId = get().watcherId;
    if (!watcherId) return;
    set((state) => (state.watcherId === watcherId ? { watcherId: null } : {}));
    try {
      await removeWatcher(watcherId);
    } catch (_) {}
  },

  async persistProjectWorkspaceState(projectId, snapshot) {
    const project = get().projectsById[projectId];
    if (!project || !snapshot) return false;
    set((state) => ({
      projectsById: {
        ...state.projectsById,
        [projectId]: {
          ...state.projectsById[projectId],
          preferences: { ...(state.projectsById[projectId].preferences || {}), workspaceState: snapshot },
          updatedAt: new Date().toISOString(),
        },
      },
    }));
    return get().persistProductState();
  },

  scheduleWorkspaceStatePersist() {
    const projectId = get().activeProjectId;
    if (!projectId) return;
    const previous = workspaceStatePersistTimers.get(projectId);
    if (previous) clearTimeout(previous.timer || previous);
    const snapshot = workspaceStateSnapshot(get(), projectId, false);
    const timer = setTimeout(() => {
      workspaceStatePersistTimers.delete(projectId);
      get().persistProjectWorkspaceState(projectId, snapshot);
    }, 500);
    workspaceStatePersistTimers.set(projectId, { timer, snapshot });
  },

  async persistActiveProjectWorkspaceState(options = {}) {
    const projectId = get().activeProjectId;
    if (!projectId) return true;
    const pending = workspaceStatePersistTimers.get(projectId);
    if (pending) {
      clearTimeout(pending.timer || pending);
      workspaceStatePersistTimers.delete(projectId);
    }
    return get().persistProjectWorkspaceState(
      projectId,
      workspaceStateSnapshot(get(), projectId, options.discardDirty === true),
    );
  },

  loadProjectTerminalState(projectId) {
    const project = get().projectsById[projectId];
    const terminalState = terminalStateFromProject(project, false);
    set({
      terminalPanes: terminalState.panes,
      activePaneId: terminalState.activePaneId,
      terminalSessions: [],
      ptySessionId: null,
    });
  },

  async persistProjectTerminalState(projectId, snapshot) {
    const project = get().projectsById[projectId];
    if (!project) return;
    const terminalState = snapshot || {
      panes: get().terminalPanes,
      activePaneId: get().activePaneId,
    };
    set((state) => ({
      projectsById: {
        ...state.projectsById,
        [projectId]: {
          ...state.projectsById[projectId],
          preferences: {
            ...(state.projectsById[projectId].preferences || {}),
            terminalState: {
              activePaneId: terminalState.activePaneId,
              panes: terminalState.panes.map((pane) => ({
                ...pane,
                output: String(pane.output || '').slice(-200000),
              })),
            },
          },
          updatedAt: new Date().toISOString(),
        },
      },
    }));
    await get().persistProductState();
  },

  scheduleTerminalStatePersist() {
    const projectId = get().activeProjectId;
    if (!projectId) return;
    const previous = terminalStatePersistTimers.get(projectId);
    if (previous) clearTimeout(previous.timer || previous);
    const snapshot = {
      panes: get().terminalPanes.map((pane) => ({ ...pane, output: String(pane.output || '').slice(-200000) })),
      activePaneId: get().activePaneId,
    };
    const timer = setTimeout(() => {
      terminalStatePersistTimers.delete(projectId);
      get().persistProjectTerminalState(projectId, snapshot);
    }, 500);
    terminalStatePersistTimers.set(projectId, { timer, snapshot });
  },

  async persistActiveProjectTerminalState() {
    const projectId = get().activeProjectId;
    if (!projectId) return;
    const pending = terminalStatePersistTimers.get(projectId);
    if (pending) {
      clearTimeout(pending.timer || pending);
      terminalStatePersistTimers.delete(projectId);
    }
    await get().persistProjectTerminalState(projectId, {
      panes: get().terminalPanes.map((pane) => ({ ...pane, output: String(pane.output || '').slice(-200000) })),
      activePaneId: get().activePaneId,
    });
  },

  initializeTerminal() {
    const panes = get().terminalPanes;
    if (!panes.length) {
      const pane = makePane();
      set({ terminalPanes: [pane], activePaneId: pane.id });
      get().scheduleTerminalStatePersist();
      return;
    }
    if (!get().activePaneId) {
      set({ activePaneId: panes[0].id });
      get().scheduleTerminalStatePersist();
    }
  },

  splitPane(paneId, direction) {
    if (get().terminalPanes.length >= 2) return false;
    set((state) => {
      const next = {
        ...makePane(direction === 'right' ? 'Terminal Split Right' : 'Terminal Split Down'),
        split: direction === 'down' ? 'down' : 'right',
      };
      return {
        terminalPanes: [...state.terminalPanes, next],
        activePaneId: next.id,
      };
    });
    get().scheduleTerminalStatePersist();
    return true;
  },

  closePane(paneId) {
    if (get().terminalPanes.length === 1) return false;
    if (!get().terminalPanes.some((pane) => pane.id === paneId)) return false;
    set((state) => {
      const nextPanes = state.terminalPanes.filter((pane) => pane.id !== paneId);
      return {
        terminalPanes: nextPanes,
        activePaneId: state.activePaneId === paneId ? nextPanes[0]?.id || null : state.activePaneId,
      };
    });
    get().scheduleTerminalStatePersist();
    return true;
  },

  bindPtyToPane(paneId, sessionId, projectId = get().activeProjectId) {
    if (projectId !== get().activeProjectId) return false;
    set((state) => ({
      terminalPanes: state.terminalPanes.map((pane) => (pane.id === paneId ? { ...pane, sessionId } : pane)),
      ptySessionId: sessionId,
    }));
    get().scheduleTerminalStatePersist();
    return true;
  },

  setPaneStatus(paneId, status, projectId = get().activeProjectId) {
    if (projectId !== get().activeProjectId) return false;
    set((state) => ({
      terminalPanes: state.terminalPanes.map((pane) => (pane.id === paneId ? { ...pane, status } : pane)),
    }));
    get().scheduleTerminalStatePersist();
    return true;
  },

  setPaneSession(paneId, sessionId, projectId = get().activeProjectId) {
    if (projectId !== get().activeProjectId) return false;
    set((state) => ({
      terminalPanes: state.terminalPanes.map((pane) => (pane.id === paneId ? { ...pane, sessionId } : pane)),
    }));
    get().scheduleTerminalStatePersist();
    return true;
  },

  appendPaneOutput(paneId, chunk, projectId = get().activeProjectId) {
    if (projectId !== get().activeProjectId) return false;
    set((state) => ({
      terminalPanes: state.terminalPanes.map((pane) =>
        pane.id === paneId ? { ...pane, output: `${pane.output || ''}${chunk}`.slice(-200000) } : pane,
      ),
    }));
    get().scheduleTerminalStatePersist();
    return true;
  },

  appendTimelineEvent(eventType, payload) {
    get().appendThreadTimelineEvent(get().activeThreadId, eventType, payload);
  },

  closeAssistantStream() {
    const threadId = get().activeThreadId;
    const runtime = get().threadRuntimeById[threadId] || emptyThreadRuntime();
    get().patchThreadRuntime(threadId, { timeline: closeAssistantStream(runtime.timeline) });
  },

  handleThreadSessionReset(threadId, newSessionId) {
    const normalizedSessionId = String(newSessionId || '').trim();
    if (!threadId || !normalizedSessionId) return Promise.resolve(false);
    return queueThreadMutation(threadId, async () => {
      const initialState = get();
      const thread = initialState.threadsById[threadId];
      const project = thread ? initialState.projectsById[thread.projectId] : null;
      if (!thread || !project) return false;
      const existingRuntime = initialState.threadRuntimeById[threadId] || emptyThreadRuntime();
      if (thread.sessionId === normalizedSessionId && existingRuntime.connectionState === 'connected') return true;

      const previousSessionId = thread.sessionId || null;
      const resetAt = new Date().toISOString();
      const resetRuntime = {
        ...emptyThreadRuntime(),
        sessionId: normalizedSessionId,
        connectionState: 'connecting',
        availableCommands: existingRuntime.availableCommands,
        models: existingRuntime.models,
        modes: existingRuntime.modes,
        currentModel: existingRuntime.currentModel || thread.modelId || null,
        currentMode: existingRuntime.currentMode || thread.modeId || 'default',
        capabilities: existingRuntime.capabilities,
        historyReplayActive: true,
      };

      set((state) => {
        const current = state.threadsById[threadId];
        if (!current || current.projectId !== project.id) return {};
        return {
          threadsById: {
            ...state.threadsById,
            [threadId]: {
              ...current,
              sessionId: normalizedSessionId,
              title: '新对话',
              draft: '',
              timeline: [],
              status: 'connecting',
              unread: false,
              metadata: {
                ...(current.metadata || {}),
                promptQueue: [],
                previousSessionId,
                sessionResetAt: resetAt,
                sessionResetLoadError: null,
                lastError: null,
              },
              updatedAt: resetAt,
            },
          },
          ...(state.activeThreadId === threadId
            ? {
                sessionId: normalizedSessionId,
                sessionTitle: '新对话',
                error: null,
              }
            : {}),
        };
      });
      get().patchThreadRuntime(threadId, resetRuntime);
      await get().persistProductState();

      const client = conversations.peek(threadId) || get().getThreadClient(threadId);
      if (!client?.connected) {
        const message = 'CodeBuddy 已重置会话，但 ACP 连接不可用，请重新连接。';
        get().patchThreadRuntime(threadId, { connectionState: 'error', historyReplayActive: false });
        await get().updateThreadRecord(threadId, {
          status: 'error',
          metadata: {
            ...(get().threadsById[threadId]?.metadata || {}),
            sessionResetLoadError: message,
            lastError: message,
          },
        });
        if (get().activeThreadId === threadId) set({ connectionState: 'error', error: message });
        return false;
      }

      try {
        const loaded = await client.request('session/load', {
          sessionId: normalizedSessionId,
          cwd: project.workspacePath || '.',
          mcpServers: [],
        });
        const currentThread = get().threadsById[threadId];
        if (!currentThread || currentThread.sessionId !== normalizedSessionId) return true;
        const currentRuntime = get().threadRuntimeById[threadId] || resetRuntime;
        const configPatch = get().applySessionConfigUpdate(loaded?.configOptions || []);
        const models = normalizeModels(loaded?.models?.availableModels || currentRuntime.models);
        const modes = normalizeModes(loaded?.modes?.availableModes || currentRuntime.modes);
        const persistedModel = currentRuntime.currentModel || currentThread.modelId;
        const currentModel =
          resolveAvailableSelection(models, persistedModel) ||
          loaded?.models?.currentModelId ||
          configPatch.currentModel;
        const persistedMode = currentRuntime.currentMode || currentThread.modeId;
        const currentMode =
          resolveAvailableSelection(modes, persistedMode) ||
          loaded?.modes?.currentModeId ||
          configPatch.currentMode ||
          'default';
        const title = loaded?.title || loaded?.name || '新对话';
        get().patchThreadRuntime(threadId, {
          connectionState: 'connected',
          models,
          modes,
          currentModel,
          currentMode,
          historyReplayActive: false,
          agentPhase: null,
          progress: null,
        });
        set((state) => {
          const current = state.threadsById[threadId];
          if (!current || current.sessionId !== normalizedSessionId) return {};
          return {
            threadsById: {
              ...state.threadsById,
              [threadId]: {
                ...current,
                title,
                modelId: currentModel || null,
                modeId: currentMode,
                status: 'idle',
                metadata: { ...(current.metadata || {}), sessionResetLoadError: null, lastError: null },
                updatedAt: new Date().toISOString(),
              },
            },
            ...(state.activeThreadId === threadId
              ? {
                  sessionId: normalizedSessionId,
                  sessionTitle: title,
                  currentModel,
                  currentMode,
                  connectionState: 'connected',
                  error: null,
                }
              : {}),
          };
        });
        await get().persistProductState();
        if (get().activeProjectId === project.id)
          await get()
            .refreshSessions()
            .catch(() => false);
        return true;
      } catch (error) {
        const currentThread = get().threadsById[threadId];
        if (!currentThread || currentThread.sessionId !== normalizedSessionId) return false;
        const message = 'CodeBuddy 会话已重置，但刷新新会话信息失败: ' + (error?.message || '未知错误');
        get().patchThreadRuntime(threadId, {
          connectionState: 'connected',
          historyReplayActive: false,
          agentPhase: null,
          progress: null,
        });
        get().appendThreadTimelineEvent(threadId, 'error', { type: 'error', message });
        set((state) => {
          const current = state.threadsById[threadId];
          if (!current || current.sessionId !== normalizedSessionId) return {};
          return {
            threadsById: {
              ...state.threadsById,
              [threadId]: {
                ...current,
                status: 'idle',
                metadata: { ...(current.metadata || {}), sessionResetLoadError: message, lastError: message },
                updatedAt: new Date().toISOString(),
              },
            },
            ...(state.activeThreadId === threadId
              ? {
                  sessionId: normalizedSessionId,
                  sessionTitle: current.title || '新对话',
                  connectionState: 'connected',
                  error: message,
                }
              : {}),
          };
        });
        await get().persistProductState();
        return false;
      }
    });
  },

  bootstrap() {
    if (bootstrapOperation) return bootstrapOperation;
    const operation = (async () => {
      const authRequest = ++authRequestVersion;
      if (!routeListenerBound) {
        routeListenerBound = true;
        window.addEventListener('hashchange', () => {
          set({ route: parseHashRoute() });
        });
      }
      if (!authFailureListenerBound) {
        authFailureListenerBound = true;
        window.addEventListener('codebuddy:auth-required', () => {
          authRequestVersion += 1;
          setAcpSessionToken(null);
          setAuthToken(null);
          conversations.disposeAll().catch(() => null);
          set({
            authViewState: 'login',
            authSubmitting: false,
            authError: '登录已失效，请重新登录',
            sessionId: null,
            sessionToken: null,
            connectionState: 'disconnected',
          });
          const projectId = get().activeProjectId;
          if (projectId)
            get()
              .disconnectProjectThreads(projectId)
              .catch(() => null);
        });
      }

      // 1. 先恢复本地产品状态，再按活动项目惰性启动对应运行时。
      get().loadSettingsFromStorage();
      if (!get().productStateLoaded) await get().hydrateProductState();
      if (authRequest !== authRequestVersion) return false;
      if (!runtimeListenerBound && window.electronAPI?.onProjectRuntimeStatus) {
        runtimeListenerBound = true;
        window.electronAPI.onProjectRuntimeStatus((runtime) => get().applyProjectRuntimeStatus(runtime));
      }
      const projectId = get().activeProjectId;
      if (projectId) {
        const runtime = await get().ensureProjectRuntime(projectId);
        if (authRequest !== authRequestVersion || get().activeProjectId !== projectId) return false;
        if (!runtime) {
          set({ authViewState: 'authenticated' });
          return false;
        }
      } else {
        set({ authViewState: 'authenticated', connectionState: 'disconnected' });
        return true;
      }

      // 2. 鉴权态：运行时就绪后再检查当前项目服务。
      //      若后端启用鉴权且当前未通过，App.jsx 渲染登录页；通过后才连 AcpClient
      let authState;
      try {
        authState = await apiCheckAuth();
      } catch (error) {
        if (authRequest === authRequestVersion && get().activeProjectId === projectId) {
          set({
            authViewState: 'error',
            authError: error?.message || '无法检查 CodeBuddy 登录状态',
            connectionState: 'error',
          });
        }
        return false;
      }
      if (authRequest !== authRequestVersion || get().activeProjectId !== projectId) return false;
      set({ authViewState: authState, authError: null });
      if (authState === 'login') {
        await get()
          .refreshInfo()
          .catch(() => false);
        // 等登录成功后再继续；App 登录页会调 store.login() 并重触发 bootstrap
        return false;
      }

      if (!conversationEventsBound) {
        conversationEventsBound = true;
        conversations.onEvent((event) => get().handleConversationEvent(event));
      }

      try {
        const isCurrent = () => authRequest === authRequestVersion && get().activeProjectId === projectId;
        const querySessionId = new URLSearchParams(window.location.search).get('sessionId');
        if (!get().activeProjectId || !get().activeThreadId) {
          set({ connectionState: 'disconnected', sessionId: null });
          await Promise.allSettled([
            get().refreshInfo(),
            get().refreshSettings(),
            get().refreshPlugins(),
            get().refreshMetrics(),
            get().refreshStats(),
            get().refreshTraces(),
          ]);
          return isCurrent();
        }
        if (querySessionId) {
          await get().updateActiveThread({ sessionId: querySessionId });
          if (!isCurrent()) return false;
        }
        const initialized = await get().initializeActiveThread(querySessionId || undefined);
        if (!isCurrent() || !initialized) return false;
        await get().initializeWorkspace();
        if (!isCurrent()) return false;
        await get().refreshProjectViews();
        const readyState = get();
        console.info(
          `[bootstrap] connected project=${projectId} thread=${readyState.activeThreadId || ''} models=${readyState.models.length} currentModel=${readyState.currentModel || ''}`,
        );
        return isCurrent();
      } catch (error) {
        if (authRequest === authRequestVersion && get().activeProjectId === projectId) {
          set({ error: error.message, connectionState: 'error' });
        }
        console.warn(`[bootstrap] failed project=${projectId || ''}: ${error?.message || error}`);
        return false;
      }
    })();
    const tracked = operation.finally(() => {
      if (bootstrapOperation === tracked) bootstrapOperation = null;
    });
    bootstrapOperation = tracked;
    return tracked;
  },

  async refreshProjectViews() {
    await Promise.allSettled([
      get().refreshInfo(),
      get().refreshSettings(),
      get().refreshSessions(),
      get().refreshWorkers(),
      get().refreshPlugins(),
      get().refreshMarketplaces(),
      get().refreshMetrics(),
      get().refreshStats(),
      get().refreshTasks(),
      get().refreshTraces(),
    ]);
  },

  async authenticateCodeBuddyAccount() {
    if (get().codeBuddyAccountAuthState === 'authenticating') return false;
    const projectId = get().activeProjectId;
    const threadId = get().activeThreadId;
    set({
      codeBuddyAccountAuthState: 'authenticating',
      codeBuddyAccountAuthUrl: null,
      codeBuddyAccountAuthError: null,
      error: null,
    });
    try {
      if (!projectId || !threadId) throw new Error('请先选择一个项目和会话');
      const client = conversations.peek(threadId) || get().getThreadClient(threadId);
      if (!client) throw new Error('内置 CodeBuddy CLI 尚未就绪');
      if (!client.connected) await client.connect();
      if (!client.initialized) await client.initialize();
      if (projectId !== get().activeProjectId || threadId !== get().activeThreadId) return false;

      const authMethods = Array.isArray(client.authMethods) ? client.authMethods : [];
      // 公有云默认 cli-external-link → methodId=external；勿优先 iOA，否则企业内网登录页对公有云用户无效
      const preferredMethodIds = ['external', 'cli-external-link', 'iOA', 'internal', 'selfhosted'];
      const methodId =
        preferredMethodIds.find((id) => authMethods.some((method) => method?.id === id)) ||
        authMethods[0]?.id ||
        'external';
      const result = await client.authenticate(methodId);
      if (projectId !== get().activeProjectId || threadId !== get().activeThreadId) return false;
      const userinfo = result?._meta?.['codebuddy.ai/userinfo'] || result?.userinfo || null;
      set({
        codeBuddyAccountAuthState: 'authenticated',
        codeBuddyAccountAuthUrl: null,
        codeBuddyAccountAuthError: null,
        codeBuddyAccountUser: userinfo,
        codeBuddyAccountAuthMethods: authMethods,
      });
      // 清掉会话上的鉴权失败标记，避免恢复后仍显示旧 lastError
      const thread = get().threadsById[threadId];
      if (thread?.metadata?.authRequired || thread?.metadata?.lastError) {
        await get().updateThreadRecord(threadId, {
          metadata: {
            ...(thread.metadata || {}),
            authRequired: false,
            lastError: null,
          },
        });
      }
      await conversations.disposeAll();
      const restarted = projectId
        ? await get().restartProjectRuntime(projectId, { deferInitializationUntilAuth: true })
        : true;
      if (!restarted) throw new Error(get().error || 'CodeBuddy 运行时重启失败');
      const connected = await get().bootstrap();
      if (!connected) {
        const state = get();
        if (state.codeBuddyAccountAuthState === 'required') return false;
        throw new Error(state.error || 'CodeBuddy 登录成功，但会话恢复失败');
      }
      return true;
    } catch (error) {
      if (projectId !== get().activeProjectId) return false;
      const message =
        error?.type === 'timeout'
          ? 'CodeBuddy 登录等待超时，请重新发起登录'
          : error?.message || 'CodeBuddy 登录失败';
      set({
        codeBuddyAccountAuthState: 'error',
        codeBuddyAccountAuthError: message,
        codeBuddyAccountAuthUrl: null,
      });
      return false;
    }
  },

  async refreshInfo() {
    const request = beginScopedRequest('info', get());
    try {
      const payload = await fetchJson('/api/v1/info');
      if (!isScopedRequestCurrent(request, get())) return false;
      set({ info: payload.data || payload, infoLoaded: true });
      return true;
    } catch (error) {
      if (!window.electronAPI?.getCliMaintenanceInfo) throw error;
      const cliInfo = await window.electronAPI.getCliMaintenanceInfo();
      if (!isScopedRequestCurrent(request, get())) return false;
      set((state) => ({
        info: { ...(state.info || {}), version: cliInfo?.version || state.info?.version || null },
        infoLoaded: true,
      }));
      return true;
    }
  },

  async refreshSettings() {
    const request = beginScopedRequest('settings', get());
    const payload = await fetchJson('/api/v1/settings');
    if (!isScopedRequestCurrent(request, get())) return false;
    const loaded = stripGuiSettings(payload.data || payload);
    const projectPrefix = `${request.projectId || 'global'}:`;
    for (const storedKey of confirmedSettingValues.keys()) {
      if (storedKey.startsWith(projectPrefix)) confirmedSettingValues.delete(storedKey);
    }
    for (const [key, value] of Object.entries(loaded || {})) {
      confirmedSettingValues.set(settingScopeKey(request.projectId, key), value);
    }
    persistSettingsCache(loaded);
    set({ settings: loaded, settingsLoaded: true });
    return true;
  },

  loadSettingsFromStorage() {
    try {
      const raw = localStorage.getItem(SETTINGS_CACHE_KEY);
      if (raw) {
        const parsed = settingsCacheSnapshot(JSON.parse(raw));
        persistSettingsCache(parsed);
        set({ settings: parsed });
      }
    } catch (_) {}
  },

  async updateGuiSetting(key, value) {
    if (!isGuiSettingKey(key)) return false;
    try {
      const next = saveGuiSettings({ ...get().guiSettings, [key]: value });
      set({ guiSettings: next });
      if (window.electronAPI?.saveProductState) {
        const persisted = await get().persistProductState();
        if (!persisted) throw new Error(get().error || '产品状态保存失败');
      }
      return true;
    } catch (error) {
      set({ error: `GUI 设置保存失败: ${error.message}` });
      return false;
    }
  },

  // 乐观更新 UI，后端失败时回滚到最后一次确认值。版本号避免迟到响应覆盖更新的操作。
  async updateSetting(key, value) {
    if (isGuiSettingKey(key)) return get().updateGuiSetting(key, value);
    const state = get();
    const projectId = state.activeProjectId;
    const apiBase = state.apiBase;
    const requestContext = {
      authToken: getAuthToken(),
      acpSessionToken: getAcpSessionToken(),
    };
    const writeKey = settingScopeKey(projectId, key);
    const version = (settingWriteVersions.get(writeKey) || 0) + 1;
    settingWriteVersions.set(writeKey, version);
    if (!confirmedSettingValues.has(writeKey)) {
      confirmedSettingValues.set(writeKey, readSettingPath(state.settings, key));
    }

    set((state) => {
      const next = writeSettingPath(state.settings, key, value);
      persistSettingsCache(next);
      return { settings: next, settingsLoaded: true };
    });

    const previousWrite = settingWriteChains.get(writeKey) || Promise.resolve();
    const operation = previousWrite
      .catch(() => {})
      .then(async () => {
        try {
          await updateSettingByKeyApi(key, value, 'user', apiBase, requestContext);
          confirmedSettingValues.set(writeKey, value);
          if (settingWriteVersions.get(writeKey) === version && projectId === get().activeProjectId) {
            set((current) => {
              const next = writeSettingPath(current.settings, key, value);
              persistSettingsCache(next);
              return { settings: next, settingsLoaded: true };
            });
          }
          return true;
        } catch (err) {
          if (settingWriteVersions.get(writeKey) === version && projectId === get().activeProjectId) {
            const confirmedValue = confirmedSettingValues.get(writeKey);
            set((state) => {
              const next = writeSettingPath(state.settings, key, confirmedValue, confirmedValue === undefined);
              persistSettingsCache(next);
              return {
                settings: next,
                settingsLoaded: true,
                error: `设置保存失败，已恢复原值: ${err.message}`,
              };
            });
          }
          return false;
        }
      });
    settingWriteChains.set(writeKey, operation);

    try {
      return await operation;
    } finally {
      if (settingWriteChains.get(writeKey) === operation) settingWriteChains.delete(writeKey);
      if (settingWriteVersions.get(writeKey) === version) settingWriteVersions.delete(writeKey);
    }
  },

  async refreshSessions() {
    const request = beginScopedRequest('sessions', get());
    const projectId = request.projectId;
    const payload = await fetchJson('/api/v1/sessions');
    if (!isScopedRequestCurrent(request, get())) return false;
    const sessions = normalizeSessions(payload);
    if (!projectId) {
      set({ sessions });
      return true;
    }
    set((state) => {
      const deletedSessionIds = new Set(deletedSessionIdsForProject(state.projectsById[projectId]));
      const visibleSessions = sessions.filter((session) => !deletedSessionIds.has(session.id || session.sessionId));
      const threadsById = { ...state.threadsById };
      const order = [...(state.threadOrderByProject[projectId] || [])];
      for (const session of visibleSessions) {
        const sessionId = session.id || session.sessionId;
        if (!sessionId) continue;
        let thread = Object.values(threadsById).find(
          (item) => item.projectId === projectId && item.sessionId === sessionId,
        );
        if (!thread) {
          thread = createThreadRecord(projectId, {
            sessionId,
            title: session.name || session.title || sessionId,
          });
          threadsById[thread.id] = thread;
          order.push(thread.id);
        } else if ((session.name || session.title) && thread.title !== (session.name || session.title)) {
          threadsById[thread.id] = {
            ...thread,
            title: session.name || session.title,
            updatedAt: new Date().toISOString(),
          };
        }
      }
      return {
        sessions: visibleSessions,
        threadsById,
        threadOrderByProject: { ...state.threadOrderByProject, [projectId]: order },
      };
    });
    get().persistProductState();
    return true;
  },

  async refreshWorkers() {
    const request = beginScopedRequest('workers', get());
    try {
      const payload = await fetchJson('/api/v1/workers');
      if (!isScopedRequestCurrent(request, get())) return false;
      set({ workers: normalizeWorkers(payload), workersError: null });
      return true;
    } catch (error) {
      if (!isScopedRequestCurrent(request, get())) return false;
      set({ workersError: error.message || '加载 Worker 失败' });
      return false;
    }
  },

  async refreshPlugins() {
    const request = beginScopedRequest('plugins', get());
    try {
      const payload = await fetchJson('/api/v1/plugins');
      if (!isScopedRequestCurrent(request, get())) return false;
      set({ plugins: normalizePlugins(payload), pluginError: null });
      return true;
    } catch (error) {
      if (!isScopedRequestCurrent(request, get())) return false;
      set({ pluginError: error?.message || '加载插件失败' });
      return false;
    }
  },

  async refreshMarketplaces() {
    const request = beginScopedRequest('marketplaces', get());
    try {
      const list = await apiFetchMarketplaces();
      if (!isScopedRequestCurrent(request, get())) return false;
      set({ marketplaces: Array.isArray(list) ? list : [], marketplaceError: null });
      return true;
    } catch (error) {
      if (!isScopedRequestCurrent(request, get())) return false;
      set({ marketplaceError: error?.message || '加载插件市场失败' });
      return false;
    }
  },

  async installPluginByName(pluginId, marketplace) {
    const projectId = get().activeProjectId;
    const busyKey = `install:${pluginId}`;
    set({ pluginBusy: busyKey, pluginError: null });
    try {
      await apiInstallPlugin(pluginId, marketplace);
      if (projectId === get().activeProjectId) await get().refreshPlugins();
      if (projectId === get().activeProjectId && get().pluginBusy === busyKey) set({ pluginBusy: null });
      return true;
    } catch (err) {
      if (projectId === get().activeProjectId && get().pluginBusy === busyKey) {
        set({ pluginBusy: null, pluginError: err?.message || '安装插件失败' });
      }
      return false;
    }
  },

  async uninstallPluginByName(pluginName, marketplace) {
    const projectId = get().activeProjectId;
    const busyKey = `uninstall:${pluginName}`;
    set({ pluginBusy: busyKey, pluginError: null });
    try {
      await apiUninstallPlugin(pluginName, marketplace);
      if (projectId === get().activeProjectId) await get().refreshPlugins();
      if (projectId === get().activeProjectId && get().pluginBusy === busyKey) set({ pluginBusy: null });
      return true;
    } catch (err) {
      if (projectId === get().activeProjectId && get().pluginBusy === busyKey) {
        set({ pluginBusy: null, pluginError: err?.message || '卸载插件失败' });
      }
      return false;
    }
  },

  async togglePluginByName(pluginName, enabled, marketplace) {
    const projectId = get().activeProjectId;
    const busyKey = `toggle:${pluginName}`;
    set({ pluginBusy: busyKey, pluginError: null });
    try {
      if (enabled) await apiEnablePlugin(pluginName, marketplace);
      else await apiDisablePlugin(pluginName, marketplace);
      if (projectId === get().activeProjectId) await get().refreshPlugins();
      if (projectId === get().activeProjectId && get().pluginBusy === busyKey) set({ pluginBusy: null });
      return true;
    } catch (err) {
      if (projectId === get().activeProjectId && get().pluginBusy === busyKey) {
        set({ pluginBusy: null, pluginError: err?.message || (enabled ? '启用插件失败' : '禁用插件失败') });
      }
      return false;
    }
  },

  async addMarketplaceById(id, config) {
    const projectId = get().activeProjectId;
    const busyKey = `addMkt:${id}`;
    set({ pluginBusy: busyKey, marketplaceError: null });
    try {
      await apiAddMarketplace(id, config || {});
      if (projectId === get().activeProjectId) await get().refreshMarketplaces();
      if (projectId === get().activeProjectId && get().pluginBusy === busyKey) set({ pluginBusy: null });
      return true;
    } catch (err) {
      if (projectId === get().activeProjectId && get().pluginBusy === busyKey) {
        set({ pluginBusy: null, marketplaceError: err?.message || '新增市场失败' });
      }
      return false;
    }
  },

  async removeMarketplaceById(id) {
    const projectId = get().activeProjectId;
    const busyKey = `rmMkt:${id}`;
    set({ pluginBusy: busyKey, marketplaceError: null });
    try {
      await apiRemoveMarketplace(id);
      if (projectId === get().activeProjectId) await get().refreshMarketplaces();
      if (projectId === get().activeProjectId && get().pluginBusy === busyKey) set({ pluginBusy: null });
      return true;
    } catch (err) {
      if (projectId === get().activeProjectId && get().pluginBusy === busyKey) {
        set({ pluginBusy: null, marketplaceError: err?.message || '删除市场失败' });
      }
      return false;
    }
  },

  async refreshMetrics() {
    const request = beginScopedRequest('metrics', get());
    try {
      const payload = await fetchJson('/api/v1/metrics');
      if (!isScopedRequestCurrent(request, get())) return false;
      set({ metrics: payload.data || payload, metricsError: null });
      return true;
    } catch (error) {
      if (!isScopedRequestCurrent(request, get())) return false;
      set({ metricsError: error?.message || '加载监控数据失败' });
      return false;
    }
  },

  async refreshStats() {
    const request = beginScopedRequest('stats', get());
    set({ statsLoading: true, statsError: null });
    try {
      const stats = await fetchStatsApi();
      if (!isScopedRequestCurrent(request, get())) return false;
      set({ stats, statsLoading: false });
    } catch (err) {
      if (!isScopedRequestCurrent(request, get())) return false;
      set({ statsLoading: false, statsError: err?.message || '加载全局统计失败' });
    }
    // 同时刷新当前会话的会话级统计（失败不阻塞全局）
    get().refreshSessionStats?.();
    return true;
  },

  async refreshSessionStats() {
    const request = beginScopedRequest('sessionStats', get(), 'thread');
    try {
      const sessionStats = await fetchSessionStats(request.sessionId);
      if (!isScopedRequestCurrent(request, get())) return false;
      set({ sessionStats });
    } catch (_) {
      if (!isScopedRequestCurrent(request, get())) return false;
      set({ sessionStats: null });
    }
    return true;
  },

  async refreshTasks() {
    const request = beginScopedRequest('tasks', get(), 'thread');
    try {
      const tasks = await fetchScheduledTasks(request.sessionId);
      if (!isScopedRequestCurrent(request, get())) return false;
      set({ scheduledTasks: tasks, scheduledTasksError: null });
    } catch (error) {
      if (!isScopedRequestCurrent(request, get())) return false;
      set({ scheduledTasksError: error.message || '加载定时任务失败' });
    }
    // 同时刷任务模板（失败不阻塞定时任务）
    get().refreshTaskTemplates?.();
    return true;
  },

  async refreshTaskTemplates() {
    const request = beginScopedRequest('taskTemplates', get(), 'thread');
    set({ taskTemplatesLoading: true, taskTemplatesError: null });
    try {
      const result = await apiFetchTaskTemplates(request.sessionId);
      if (!isScopedRequestCurrent(request, get())) return false;
      set({
        taskTemplates: result.templates || [],
        taskTemplatesError: result.error || null,
        taskTemplatesLoading: false,
      });
    } catch (err) {
      if (!isScopedRequestCurrent(request, get())) return false;
      set({ taskTemplatesLoading: false, taskTemplatesError: err?.message || '加载任务模板失败' });
    }
    return true;
  },

  async refreshTaskTemplatesNow() {
    const request = beginScopedRequest('taskTemplates', get(), 'thread');
    set({ taskTemplatesLoading: true, taskTemplatesError: null });
    try {
      const result = await apiRefreshTaskTemplates(request.sessionId);
      if (!isScopedRequestCurrent(request, get())) return false;
      set({
        taskTemplates: result.templates || [],
        taskTemplatesError: result.error || null,
        taskTemplatesLoading: false,
      });
      return true;
    } catch (err) {
      if (!isScopedRequestCurrent(request, get())) return false;
      set({ taskTemplatesLoading: false, taskTemplatesError: err?.message || '刷新任务模板失败' });
      return false;
    }
  },

  async createTask(cron, prompt) {
    const state = get();
    const projectId = state.activeProjectId;
    const threadId = state.activeThreadId;
    const sessionId = state.sessionId;
    if (!sessionId) throw new Error('当前会话尚未连接');
    if (!String(cron || '').trim()) throw new Error('Cron 表达式不能为空');
    if (!String(prompt || '').trim()) throw new Error('提示词不能为空');
    try {
      set({ error: null });
      await createScheduledTask(sessionId, cron, prompt);
      if (projectId === get().activeProjectId && threadId === get().activeThreadId && sessionId === get().sessionId) {
        await get().refreshTasks();
      }
      return true;
    } catch (error) {
      if (projectId === get().activeProjectId && threadId === get().activeThreadId && sessionId === get().sessionId) {
        set({ error: error.message });
      }
      throw error;
    }
  },

  async deleteTask(taskId) {
    if (!taskId) throw new Error('任务 ID 缺失');
    const state = get();
    const projectId = state.activeProjectId;
    const threadId = state.activeThreadId;
    const sessionId = state.sessionId;
    if (!sessionId) throw new Error('当前会话尚未连接');
    try {
      set({ error: null });
      await deleteScheduledTask(taskId, sessionId);
      if (projectId === get().activeProjectId && threadId === get().activeThreadId && sessionId === get().sessionId) {
        await get().refreshTasks();
      }
      return true;
    } catch (error) {
      if (projectId === get().activeProjectId && threadId === get().activeThreadId && sessionId === get().sessionId) {
        set({ error: error.message });
      }
      throw error;
    }
  },

  async refreshTraces() {
    const request = beginScopedRequest('traces', get());
    try {
      const traces = await fetchTraceList();
      if (!isScopedRequestCurrent(request, get())) return false;
      set({ traces });
      return true;
    } catch (_) {
      if (!isScopedRequestCurrent(request, get())) return false;
      return false;
    }
  },

  async loadWorkerLogs(workerPid, type = 'stdout', tail = 200) {
    const projectId = get().activeProjectId;
    try {
      return await fetchWorkerLogsApi(workerPid, type, tail);
    } catch (error) {
      if (projectId === get().activeProjectId) set({ error: error.message });
      throw error;
    }
  },

  async fsMkdir(path) {
    const projectId = get().activeProjectId;
    const cwd = get().fileCwd;
    try {
      await fsMkdir(path);
      if (projectId === get().activeProjectId && cwd === get().fileCwd) await get().refreshFileEntries();
      return true;
    } catch (error) {
      if (projectId === get().activeProjectId && cwd === get().fileCwd) set({ error: error.message });
      return false;
    }
  },

  async fsMove(source, destination) {
    const projectId = get().activeProjectId;
    const cwd = get().fileCwd;
    try {
      await fsMove(source, destination);
      if (projectId === get().activeProjectId && cwd === get().fileCwd) await get().refreshFileEntries();
      return true;
    } catch (error) {
      if (projectId === get().activeProjectId && cwd === get().fileCwd) set({ error: error.message });
      return false;
    }
  },

  async fsRemove(path) {
    const projectId = get().activeProjectId;
    const cwd = get().fileCwd;
    try {
      await fsRemove(path);
      if (projectId === get().activeProjectId && cwd === get().fileCwd) await get().refreshFileEntries();
      return true;
    } catch (error) {
      if (projectId === get().activeProjectId && cwd === get().fileCwd) set({ error: error.message });
      return false;
    }
  },

  async fsWrite(path, content) {
    const projectId = get().activeProjectId;
    const cwd = get().fileCwd;
    try {
      await fsWrite(path, content);
      if (projectId === get().activeProjectId && cwd === get().fileCwd) await get().refreshFileEntries();
      return true;
    } catch (error) {
      if (projectId === get().activeProjectId && cwd === get().fileCwd) set({ error: error.message });
      return false;
    }
  },

  async saveSelectedFile() {
    const state = get();
    const path = state.selectedFile;
    if (!path || !state.fileDirty || state.fileSaving) return false;
    const projectId = state.activeProjectId;
    const content = state.filePreview;
    const requestId = ++fileSaveRequestId;
    set({ fileSaving: true, fileExternalChange: null });
    try {
      await fsWrite(path, content);
    } catch (error) {
      if (requestId === fileSaveRequestId && projectId === get().activeProjectId && path === get().selectedFile) {
        set({ fileSaving: false, error: error.message });
      }
      return false;
    }

    if (requestId === fileSaveRequestId && projectId === get().activeProjectId && path === get().selectedFile) {
      set((current) => ({
        fileSavedContent: content,
        fileDirty: current.filePreview !== content,
        fileSaving: false,
        fileExternalChange: null,
      }));
      await get().refreshFileEntries();
      get().scheduleWorkspaceStatePersist();
    }
    return true;
  },

  async checkSelectedFileForExternalChanges() {
    const state = get();
    const path = state.selectedFile;
    if (!path || state.filePreviewLoading || state.fileSaving) return false;
    const projectId = state.activeProjectId;
    const requestId = ++fileDiskSyncRequestId;
    try {
      const content = await downloadFile(path);
      if (requestId !== fileDiskSyncRequestId || projectId !== get().activeProjectId || path !== get().selectedFile)
        return false;
      set((current) => {
        if (content === current.fileSavedContent) {
          return current.fileExternalChange?.path === path ? { fileExternalChange: null } : {};
        }
        if (current.fileDirty) {
          return { fileExternalChange: { path, content, error: null } };
        }
        return {
          filePreview: content,
          fileSavedContent: content,
          fileDirty: false,
          fileExternalChange: null,
        };
      });
      get().scheduleWorkspaceStatePersist();
      return true;
    } catch (error) {
      if (requestId !== fileDiskSyncRequestId || projectId !== get().activeProjectId || path !== get().selectedFile)
        return false;
      set({
        fileExternalChange: {
          path,
          content: null,
          error: error.message || '无法读取磁盘上的文件',
        },
      });
      return false;
    }
  },

  reloadExternalFileContent() {
    const change = get().fileExternalChange;
    if (!change || change.path !== get().selectedFile || typeof change.content !== 'string') return false;
    fileDiskSyncRequestId += 1;
    set({
      filePreview: change.content,
      fileSavedContent: change.content,
      fileDirty: false,
      fileExternalChange: null,
    });
    get().scheduleWorkspaceStatePersist();
    return true;
  },

  keepCurrentFileContent() {
    const change = get().fileExternalChange;
    if (!change || change.path !== get().selectedFile) return false;
    fileDiskSyncRequestId += 1;
    set((current) => ({
      fileSavedContent: typeof change.content === 'string' ? change.content : current.fileSavedContent,
      fileDirty:
        typeof change.content === 'string' ? current.filePreview !== change.content : Boolean(current.selectedFile),
      fileExternalChange: null,
    }));
    get().scheduleWorkspaceStatePersist();
    return true;
  },

  async refreshFileEntries(options = {}) {
    const cwd = get().fileCwd;
    const requestId = ++fileDirectoryRequestId;
    const projectId = get().activeProjectId;
    if (!options.silent) set({ fileLoading: true });
    try {
      const entries = await fsList(cwd, 1);
      if (requestId !== fileDirectoryRequestId || projectId !== get().activeProjectId) return false;
      set({ fileEntries: entries, fileLoading: false });
      return true;
    } catch (error) {
      if (requestId !== fileDirectoryRequestId || projectId !== get().activeProjectId) return false;
      if (options.silent) return false;
      set({ fileEntries: [], fileLoading: false, error: error.message });
      return false;
    }
  },

  async createPty(cols = 120, rows = 32) {
    const state = get();
    const projectId = state.activeProjectId;
    const apiBase = state.apiBase;
    const authToken = getAuthToken();
    const acpSessionToken = getAcpSessionToken();
    const headers = {
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      ...(acpSessionToken ? { 'acp-session-token': acpSessionToken } : {}),
    };
    try {
      const payload = await fetchJson(`${apiBase}/api/v1/pty`, {
        method: 'POST',
        headers,
        omitAuthToken: true,
        omitAcpSessionToken: true,
        body: JSON.stringify({ cols, rows }),
      });
      const data = payload.data || payload;
      if (projectId !== get().activeProjectId || apiBase !== get().apiBase) {
        if (data?.sessionId) {
          await requestCodeBuddy(`${apiBase}/api/v1/pty/${encodeURIComponent(data.sessionId)}`, {
            method: 'DELETE',
            headers,
            omitAuthToken: true,
            omitAcpSessionToken: true,
            timeoutMs: 10000,
          }).catch(() => null);
        }
        return null;
      }
      set((current) => ({
        ptySessionId: data.sessionId,
        terminalSessions: [...current.terminalSessions.filter((item) => item.sessionId !== data.sessionId), data],
      }));
      return data;
    } catch (error) {
      if (projectId === get().activeProjectId && apiBase === get().apiBase) set({ error: error.message });
      return null;
    }
  },

  async releasePty(sessionId) {
    if (!sessionId) return false;
    const state = get();
    const projectId = state.activeProjectId;
    const apiBase = state.apiBase;
    const authToken = getAuthToken();
    const acpSessionToken = getAcpSessionToken();
    const headers = {
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      ...(acpSessionToken ? { 'acp-session-token': acpSessionToken } : {}),
    };
    try {
      const response = await requestCodeBuddy(`${apiBase}/api/v1/pty/${encodeURIComponent(sessionId)}`, {
        method: 'DELETE',
        headers,
        omitAuthToken: true,
        omitAcpSessionToken: true,
        timeoutMs: 10000,
      });
      if (!response.ok && response.status !== 404) {
        throw new Error(`PTY 释放失败: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      if (projectId === get().activeProjectId && apiBase === get().apiBase)
        set({ error: error.message || 'PTY 释放失败' });
      return false;
    }
    if (projectId !== get().activeProjectId || apiBase !== get().apiBase) return true;
    set((current) => ({
      terminalSessions: current.terminalSessions.filter((item) => item.sessionId !== sessionId),
      ptySessionId: current.ptySessionId === sessionId ? null : current.ptySessionId,
    }));
    return true;
  },

  async login(password) {
    if (get().authSubmitting) return false;
    const authRequest = ++authRequestVersion;
    const projectId = get().activeProjectId;
    const apiBase = getApiBase();
    const isCurrent = () =>
      authRequest === authRequestVersion && get().activeProjectId === projectId && getApiBase() === apiBase;
    set({ authSubmitting: true, authError: null });
    try {
      const result = await apiAuthLogin(String(password || ''), { baseUrl: apiBase, persistToken: false });
      if (!isCurrent()) {
        if (authRequest === authRequestVersion) set({ authSubmitting: false });
        return false;
      }
      if (result?.success) {
        setAuthToken(result.token || null);
        set({ authViewState: 'authenticated', authSubmitting: false, authError: null });
        // 重触发 bootstrap 继续 AcpClient 连接与非关键数据加载
        get()
          .bootstrap()
          .catch((error) => console.error('bootstrap after login failed:', error));
        return true;
      }
      set({ authSubmitting: false, authError: result?.error || 'login.error.incorrect' });
      return false;
    } catch (error) {
      if (!isCurrent()) {
        if (authRequest === authRequestVersion) set({ authSubmitting: false });
        return false;
      }
      set({ authSubmitting: false, authError: 'app.connectFailed' });
      console.warn('[auth] Login request failed:', error);
      return false;
    }
  },

  async logout() {
    authRequestVersion += 1;
    beginScopedRequest('initializeActiveThread', get(), 'threadId');
    setAcpSessionToken(null);
    apiAuthLogout();
    set({
      authViewState: 'login',
      authSubmitting: false,
      authError: null,
      sessionId: null,
      sessionToken: null,
      timeline: [],
    });
    await conversations.disposeAll();
  },

  async refreshAuth() {
    const authRequest = ++authRequestVersion;
    const projectId = get().activeProjectId;
    const apiBase = getApiBase();
    set({ authViewState: 'loading', authError: null });
    let authState;
    try {
      authState = await apiCheckAuth();
    } catch (error) {
      if (authRequest === authRequestVersion && get().activeProjectId === projectId && getApiBase() === apiBase) {
        set({ authViewState: 'error', authError: error?.message || '无法检查 CodeBuddy 登录状态' });
      }
      return false;
    }
    if (authRequest !== authRequestVersion || get().activeProjectId !== projectId || getApiBase() !== apiBase)
      return false;
    set({ authViewState: authState, authError: null });
    if (authState === 'authenticated') {
      get()
        .bootstrap()
        .catch((error) => console.error('bootstrap after refreshAuth failed:', error));
    }
    return true;
  },
  };
});

if (typeof window !== 'undefined' && import.meta.env.DEV) {
  window.__sendPrompt = (text) => useStore.getState().sendPrompt(text);
  window.__ZUSTAND_STORE = useStore;
}
export { conversations };
