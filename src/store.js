import { create } from 'zustand';
import { getApiBase, setApiBase, fetchJson, requestCodeBuddy, getAcpSessionToken, getAuthToken, setAcpSessionToken, checkAuth as apiCheckAuth, authLogin as apiAuthLogin, authLogout as apiAuthLogout, setAuthToken } from './lib/acp';
import { parseHashRoute, setHashRoute } from './lib/routes';
import { fsList, fsSearchContent, fsSearchFiles, createWatcher, pollWatcher, removeWatcher, downloadFile, fsMkdir, fsMove, fsRemove, fsWrite } from './lib/fs';
import { fetchSessionStats, fetchStats as fetchStatsApi, fetchScheduledTasks, createScheduledTask, deleteScheduledTask, fetchTraceList, fetchWorkerLogs as fetchWorkerLogsApi, updateSettingByKey as updateSettingByKeyApi, deleteSession as apiDeleteSession, renameSession as apiRenameSession, fetchTaskTemplates as apiFetchTaskTemplates, refreshTaskTemplates as apiRefreshTaskTemplates, uninstallPlugin as apiUninstallPlugin, enablePlugin as apiEnablePlugin, disablePlugin as apiDisablePlugin, installPlugin as apiInstallPlugin, addMarketplace as apiAddMarketplace, removeMarketplace as apiRemoveMarketplace, fetchMarketplaces as apiFetchMarketplaces } from './lib/ops';
import {
  closeAssistantStream,
  pushUserMessage,
  reduceAcpEvent,
  resetSeenContent,
} from './lib/timeline';
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
import { isGuiSettingKey, loadGuiSettings, saveGuiSettings, stripGuiSettings } from './lib/gui-settings';

const conversations = new ConversationManager();
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

function beginProjectNavigation(set, targetId) {
  const token = { version: ++projectNavigationVersion, targetId };
  set({ projectNavigationBusy: true, projectNavigationTargetId: targetId, projectNavigationError: null, error: null });
  return token;
}

function isProjectNavigationCurrent(token) {
  return token.version === projectNavigationVersion;
}

function finishProjectNavigation(set, token, error = null) {
  if (!isProjectNavigationCurrent(token)) return;
  set({ projectNavigationBusy: false, projectNavigationError: error });
}

function isProjectMutationNavigation(state) {
  return Boolean(
    state.projectNavigationBusy
    && String(state.projectNavigationTargetId || '').startsWith('project-action:'),
  );
}

function beginScopedRequest(key, state, scope = 'project') {
  const version = (scopedRequestVersions.get(key) || 0) + 1;
  scopedRequestVersions.set(key, version);
  return {
    key,
    version,
    scope,
    projectId: state.activeProjectId,
    threadId: state.activeThreadId,
    sessionId: state.sessionId,
  };
}

function isScopedRequestCurrent(token, state) {
  if (scopedRequestVersions.get(token.key) !== token.version) return false;
  if (token.projectId !== state.activeProjectId) return false;
  if (token.scope === 'threadId' || token.scope === 'thread') {
    if (token.threadId !== state.activeThreadId) return false;
  }

  if (token.scope === 'thread' && token.sessionId !== state.sessionId) return false;
  return true;
}

function queueProjectRuntimeOperation(projectId, operation) {
  if (!projectId) return Promise.resolve(null);
  const previous = runtimeOperationChains.get(projectId) || Promise.resolve();
  const next = previous.catch(() => null).then(operation);
  const tracked = next.finally(() => {
    if (runtimeOperationChains.get(projectId) === tracked) runtimeOperationChains.delete(projectId);
  });
  runtimeOperationChains.set(projectId, tracked);
  return tracked;
}
function queueSessionSettingOperation(key, operation) {
  const previous = sessionSettingChains.get(key) || Promise.resolve();
  const next = previous.catch(() => false).then(operation);
  const tracked = next.finally(() => {
    if (sessionSettingChains.get(key) === tracked) sessionSettingChains.delete(key);
  });
  sessionSettingChains.set(key, tracked);
  return tracked;
}
function queueThreadMutation(threadId, operation) {
  const previous = threadMutationChains.get(threadId) || Promise.resolve();
  const next = previous.catch(() => false).then(operation);
  const tracked = next.finally(() => {
    if (threadMutationChains.get(threadId) === tracked) threadMutationChains.delete(threadId);
  });
  threadMutationChains.set(threadId, tracked);
  return tracked;
}

function runUniqueSessionAction(key, operation) {
  const existing = sessionActionOperations.get(key);
  if (existing) return existing;
  const tracked = Promise.resolve().then(operation).finally(() => {
    if (sessionActionOperations.get(key) === tracked) sessionActionOperations.delete(key);
  });
  sessionActionOperations.set(key, tracked);
  return tracked;
}

function queuePromptQueueOperation(threadId, operation) {
  const previous = promptQueueOperationChains.get(threadId) || Promise.resolve();
  const next = previous.catch(() => false).then(operation);
  const tracked = next.finally(() => {
    if (promptQueueOperationChains.get(threadId) === tracked) promptQueueOperationChains.delete(threadId);
  });
  promptQueueOperationChains.set(threadId, tracked);
  return tracked;
}

function sessionActionItemMatches(item, id) {
  if (!id) return false;
  return [
    item?.interruptionId,
    item?.toolCallId,
    item?.meta?.interruptionId,
    item?.meta?.toolCallId,
    item?.raw?.interruptionId,
    item?.raw?.toolCallId,
  ].includes(id);
}

async function connectActiveProjectRuntime(set, get, projectId, runtime) {
  if (projectId !== get().activeProjectId) return false;
  const nextBase = `http://127.0.0.1:${runtime.port}`;
  setApiBase(nextBase);
  set({ apiBase: nextBase });
  setAuthToken(null);
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
    runtime.capabilities?.promptCapabilities?.image
    || runtime.capabilities?.prompt_capabilities?.image,
  );
  const accepted = [];
  const rejected = [];
  for (const attachment of selection || []) {
    if (attachment.kind === 'unsupported') rejected.push(`${attachment.name}: ${attachment.error}`);
    else if (attachment.kind === 'image' && !imageSupported) rejected.push(`${attachment.name}: 当前运行时未声明图片输入能力`);
    else accepted.push(attachment);
  }
  const pendingAttachments = [...runtime.pendingAttachments];
  const added = [];
  for (const attachment of accepted) {
    const duplicate = pendingAttachments.some((item) => (
      item.path === attachment.path && item.kind === attachment.kind
    ));
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
    members: Array.isArray(update.members) ? update.members : (current?.members || []),
  };
}

function emptyThreadRuntime() {
  return {
    connectionState: 'disconnected',
    timeline: [],
    permissionRequests: [],
    questions: [],
    usage: null,
    availableCommands: [],
    isAwaitingResponse: false,
    promptQueue: [],
    pendingAttachments: [],
    promptSuggestion: null,
    teamState: null,
    agentPhase: null,
    progress: null,
    historyReplayActive: false,
    models: [],
    modes: [],
    currentModel: null,
    currentMode: 'default',
    capabilities: {},
  };
}

const ACTIVE_THREAD_RUNTIME_KEYS = [
  'connectionState',
  'timeline',
  'permissionRequests',
  'questions',
  'usage',
  'availableCommands',
  'isAwaitingResponse',
  'promptQueue',
  'pendingAttachments',
  'promptSuggestion',
  'teamState',
  'agentPhase',
  'progress',
  'historyReplayActive',
  'models',
  'modes',
  'currentModel',
  'currentMode',
  'capabilities',
];

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
  return models.map((m) => ({
    id: m.modelId || m.id || m.value,
    name: m.name || m.modelId || m.id || m.value,
  }));
}

function normalizeModes(modes = []) {
  return modes.map((m) => ({
    id: m.modeId || m.id || m.value,
    name: m.name || m.modeId || m.id || m.value,
  }));
}

function readSettingPath(settings, path) {
  return String(path || '').split('.').reduce((value, key) => value?.[key], settings);
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
  try { localStorage.setItem('codebuddy-gui-settings', JSON.stringify(settingsCacheSnapshot(settings))); } catch (_) {}
}

function writeSettingPath(settings, path, value, remove = false) {
  const keys = String(path || '').split('.').filter(Boolean);
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
function makePane(title = 'Terminal') {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title,
    status: 'idle',
    sessionId: null,
    output: '',
    split: 'single',
  };
}

function terminalStateFromProject(project, resetSessions = false) {
  const saved = project?.preferences?.terminalState;
  const panes = Array.isArray(saved?.panes) && saved.panes.length
    ? saved.panes.map((pane) => ({
        ...makePane(pane.title || 'Terminal'),
        ...pane,
        output: String(pane.output || '').slice(-200000),
        sessionId: resetSessions ? null : (pane.sessionId || null),
        status: resetSessions ? 'idle' : (pane.status || 'idle'),
      }))
    : [makePane()];
  const activePaneId = panes.some((pane) => pane.id === saved?.activePaneId)
    ? saved.activePaneId
    : panes[0].id;
  return { panes, activePaneId };
}

function workspaceStateFromProject(project) {
  const saved = project?.preferences?.workspaceState || {};
  const selectedFile = typeof saved.selectedFile === 'string' && saved.selectedFile ? saved.selectedFile : null;
  const fileDirty = Boolean(selectedFile && saved.fileDirty && typeof saved.filePreview === 'string');
  return {
    fileCwd: typeof saved.fileCwd === 'string' && saved.fileCwd ? saved.fileCwd : (project?.workspacePath || '.'),
    selectedFile,
    filePreview: fileDirty ? saved.filePreview : '',
    fileSavedContent: fileDirty && typeof saved.fileSavedContent === 'string' ? saved.fileSavedContent : '',
    fileDirty,
    updatedAt: saved.updatedAt || null,
  };
}

function workspaceStateSnapshot(state, projectId, discardDirty = false) {
  const project = state.projectsById?.[projectId];
  const selectedFile = state.activeProjectId === projectId ? state.selectedFile : null;
  const fileDirty = !discardDirty && Boolean(selectedFile && state.fileDirty);
  return {
    fileCwd: state.activeProjectId === projectId ? (state.fileCwd || project?.workspacePath || '.') : (project?.workspacePath || '.'),
    selectedFile: selectedFile || null,
    fileDirty,
    filePreview: fileDirty ? String(state.filePreview || '') : '',
    fileSavedContent: fileDirty ? String(state.fileSavedContent || '') : '',
    updatedAt: new Date().toISOString(),
  };
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

function resetProjectRuntimeViews() {
  return {
    info: null,
    infoLoaded: false,
    settings: null,
    settingsLoaded: false,
    sessions: [],
    workers: [],
    workersError: null,
    plugins: [],
    marketplaces: [],
    pluginError: null,
    marketplaceError: null,
    pluginBusy: null,
    metrics: null,
    metricsError: null,
    stats: null,
    statsError: null,
    statsLoading: false,
    sessionStats: null,
    scheduledTasks: [],
    scheduledTasksError: null,
    taskTemplates: [],
    taskTemplatesError: null,
    taskTemplatesLoading: false,
    traces: [],
  };
}

export const useStore = create((set, get) => ({
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
  stats: null,        // 全局 stats（对照源 GET /api/v1/stats）
  sessionStats: null, // 当前会话 stats（对照源 GET /api/v1/stats/session?sessionId=）
  statsError: null,
  statsLoading: false,
  scheduledTasks: [],
  scheduledTasksError: null,
  taskTemplates: [],
  taskTemplatesError: null,
  taskTemplatesLoading: false,
  error: null,
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

  async updateThreadRecord(threadId, patch) {
    if (!threadId || !get().threadsById[threadId]) return;
    const pendingDraftTimer = threadDraftPersistTimers.get(threadId);
    if (pendingDraftTimer) {
      clearTimeout(pendingDraftTimer);
      threadDraftPersistTimers.delete(threadId);
    }
    set((state) => ({
      threadsById: {
        ...state.threadsById,
        [threadId]: {
          ...state.threadsById[threadId],
          ...patch,
          updatedAt: new Date().toISOString(),
        },
      },
    }));
    await get().persistProductState();
  },

  appendThreadTimelineEvent(threadId, eventType, payload) {
    const runtime = get().threadRuntimeById[threadId] || emptyThreadRuntime();
    get().patchThreadRuntime(threadId, {
      timeline: reduceAcpEvent(runtime.timeline, eventType, payload),
      isAwaitingResponse: eventType === 'agent_message_chunk'
        || eventType === 'agent_thought_chunk'
        || eventType === 'tool_call'
        ? false
        : runtime.isAwaitingResponse,
    });
    get().scheduleThreadTimelinePersist(threadId);
  },

  scheduleThreadTimelinePersist(threadId) {
    if (!threadId) return;
    const existing = threadTimelinePersistTimers.get(threadId);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(async () => {
      threadTimelinePersistTimers.delete(threadId);
      const runtime = get().threadRuntimeById[threadId] || emptyThreadRuntime();
      const thread = get().threadsById[threadId];
      if (!thread) return;
      set((state) => ({
        threadsById: {
          ...state.threadsById,
          [threadId]: {
            ...state.threadsById[threadId],
            timeline: runtime.timeline.slice(-300),
            updatedAt: new Date().toISOString(),
          },
        },
      }));
      await get().persistProductState();
    }, 600);
    threadTimelinePersistTimers.set(threadId, timer);
  },

  scheduleThreadDraftPersist(threadId) {
    if (!threadId) return;
    const existing = threadDraftPersistTimers.get(threadId);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(async () => {
      threadDraftPersistTimers.delete(threadId);
      if (!get().threadsById[threadId]) return;
      await get().persistProductState();
    }, 350);
    threadDraftPersistTimers.set(threadId, timer);
  },

  async persistProductState() {
    const saveProductState = window.electronAPI?.saveProductState;
    if (!saveProductState) return false;
    const operation = productStateSaveChain.catch(() => false).then(async () => {
      try {
        await saveProductState(productStateSnapshot(get()));
        return true;
      } catch (error) {
        set({ error: `保存项目状态失败: ${error.message}` });
        return false;
      }
    });
    productStateSaveChain = operation;
    return operation;
  },

  flushProductStateSync() {
    const saveSync = window.electronAPI?.saveProductStateSync;
    if (!saveSync) return false;

    const pendingThreadIds = Array.from(threadTimelinePersistTimers.keys());
    for (const timer of threadTimelinePersistTimers.values()) clearTimeout(timer);
    threadTimelinePersistTimers.clear();

    for (const timer of threadDraftPersistTimers.values()) clearTimeout(timer);
    threadDraftPersistTimers.clear();

    const pendingTerminalStates = Array.from(terminalStatePersistTimers.entries());
    for (const [, pending] of pendingTerminalStates) clearTimeout(pending?.timer || pending);
    terminalStatePersistTimers.clear();

    const pendingWorkspaceStates = Array.from(workspaceStatePersistTimers.entries());
    for (const [, pending] of pendingWorkspaceStates) clearTimeout(pending?.timer || pending);
    workspaceStatePersistTimers.clear();

    if (pendingThreadIds.length || pendingTerminalStates.length || pendingWorkspaceStates.length) {
      set((state) => {
        const threadsById = { ...state.threadsById };
        const projectsById = { ...state.projectsById };
        const now = new Date().toISOString();

        for (const threadId of pendingThreadIds) {
          const thread = threadsById[threadId];
          if (!thread) continue;
          const runtime = state.threadRuntimeById[threadId] || emptyThreadRuntime();
          threadsById[threadId] = {
            ...thread,
            timeline: runtime.timeline.slice(-300),
            updatedAt: now,
          };
        }

        for (const [projectId, pending] of pendingTerminalStates) {
          const project = projectsById[projectId];
          const snapshot = pending?.snapshot;
          if (!project || !snapshot) continue;
          projectsById[projectId] = {
            ...project,
            preferences: {
              ...(project.preferences || {}),
              terminalState: {
                activePaneId: snapshot.activePaneId,
                panes: snapshot.panes.map((pane) => ({
                  ...pane,
                  output: String(pane.output || '').slice(-200000),
                })),
              },
            },
            updatedAt: now,
          };
        }

        for (const [projectId, pending] of pendingWorkspaceStates) {
          const project = projectsById[projectId];
          const snapshot = pending?.snapshot;
          if (!project || !snapshot) continue;
          projectsById[projectId] = {
            ...project,
            preferences: { ...(project.preferences || {}), workspaceState: snapshot },
            updatedAt: now,
          };
        }

        return { threadsById, projectsById };
      });
    }

    try {
      const result = saveSync(productStateSnapshot(get()));
      if (!result?.ok) {
        set({ error: `退出前保存项目状态失败: ${result?.error || '未知错误'}` });
        return false;
      }
      return true;
    } catch (error) {
      set({ error: `退出前保存项目状态失败: ${error.message}` });
      return false;
    }
  },

  async hydrateProductState() {
    let loaded = emptyProductState();
    try {
      if (window.electronAPI?.loadProductState) {
        loaded = normalizeProductState(await window.electronAPI.loadProductState());
      }
    } catch (error) {
      set({ error: `加载项目状态失败: ${error.message}` });
    }

    let legacyWorkspace = null;
    if (loaded.projectOrder.length === 0) {
      try { legacyWorkspace = localStorage.getItem('codebuddy-gui-workspace'); } catch (_) {}
      if (legacyWorkspace) {
        const project = createProjectRecord(legacyWorkspace);
        const thread = createThreadRecord(project.id);
        loaded = {
          ...emptyProductState(),
          projectsById: { [project.id]: project },
          projectOrder: [project.id],
          threadsById: { [thread.id]: thread },
          threadOrderByProject: { [project.id]: [thread.id] },
          activeProjectId: project.id,
          activeThreadId: thread.id,
        };
      }
    }

    const project = activeProject(loaded);
    const thread = activeThread(loaded);
    const restoredProjects = Object.fromEntries(Object.entries(loaded.projectsById).map(([id, item]) => {
      const terminalState = terminalStateFromProject(item, true);
      return [id, {
        ...item,
        preferences: {
          ...(item.preferences || {}),
          terminalState,
        },
        runtimeStatus: 'idle',
        runtimePort: null,
        runtimePid: null,
        runtimeError: null,
        runtimeStartedAt: null,
      }];
    }));
    const restoredThreadRuntime = Object.fromEntries(Object.entries(loaded.threadsById).map(([id, item]) => [
      id,
      {
        ...emptyThreadRuntime(),
        timeline: Array.isArray(item.timeline) ? item.timeline : [],
        promptQueue: serializePromptQueue(item.metadata?.promptQueue),
        currentModel: item.modelId || null,
        currentMode: item.modeId || 'default',
      },
    ]));
    const restoredTerminal = terminalStateFromProject(restoredProjects[project?.id], true);
    set({
      projectsById: restoredProjects,
      projectOrder: loaded.projectOrder,
      threadsById: loaded.threadsById,
      threadOrderByProject: loaded.threadOrderByProject,
      activeProjectId: loaded.activeProjectId,
      activeThreadId: loaded.activeThreadId,
      threadRuntimeById: restoredThreadRuntime,
      terminalPanes: restoredTerminal.panes,
      activePaneId: restoredTerminal.activePaneId,
      workspacePath: project?.workspacePath || null,
      fileCwd: project?.workspacePath || '.',
      sessionId: thread?.sessionId || null,
      sessionTitle: thread?.title || null,
      currentModel: thread?.modelId || null,
      currentMode: thread?.modeId || 'default',
      productStateLoaded: true,
    });

    if (legacyWorkspace && window.electronAPI?.saveProductState) {
      await get().persistProductState();
    } else if (loaded.projectOrder.length > 0) {
      await get().persistProductState();
    }
  },

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
      runtime.capabilities?.promptCapabilities?.image
      || runtime.capabilities?.prompt_capabilities?.image,
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

  notifyThreadResult(threadId, outcome) {
    const state = get();
    if (!state.guiSettings?.desktopNotificationsEnabled || !window.electronAPI?.showTaskNotification) return false;
    const thread = state.threadsById[threadId];
    const project = thread ? state.projectsById[thread.projectId] : null;
    if (!thread) return false;
    const failed = outcome === 'error';
    const context = [project?.name, thread.title || '新对话'].filter(Boolean).join(' · ');
    const body = `${context}\n${failed ? '后台任务失败，点击进入应用查看详情。' : '后台任务已完成，点击进入应用查看结果。'}`;
    window.electronAPI.showTaskNotification({
      projectId: thread.projectId,
      threadId,
      title: failed ? 'CodeBuddy 任务失败' : 'CodeBuddy 任务已完成',
      body,
      outcome,
    }).catch(() => null);
    return true;
  },

  getModelDisplayName() {
    const { currentModel, models } = get();
    return models.find(m => m.id === currentModel || m.modelId === currentModel)?.name || currentModel || '';
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

  applySessionConfigUpdate(configOptions = []) {
    const next = {};
    for (const option of configOptions) {
      if (option.id === 'model') next.currentModel = option.currentValue;
      if (option.id === 'mode') next.currentMode = option.currentValue;
      if (option.id === 'thought_level') next.thoughtLevel = option.currentValue;
    }
    return next;
  },

  handleSessionUpdate(update) {
    const su = update.sessionUpdate || update.session_update || update.type;
    if (!su) return;

    if (su === 'config_option_update') {
      const patch = get().applySessionConfigUpdate(update.configOptions || []);
      set(patch);
      get().updateActiveThread({
        ...(patch.currentModel ? { modelId: patch.currentModel } : {}),
        ...(patch.currentMode ? { modeId: patch.currentMode } : {}),
      });
      return;
    }

    if (su === 'session_info_update') {
      const title = update.title || get().sessionTitle;
      set({ sessionTitle: title });
      if (title) get().updateActiveThread({ title });
      return;
    }

    if (su === 'usage_update') {
      set({ usage: { used: update.used, size: update.size, meta: update._meta || null } });
      return;
    }

    if (su === 'available_commands_update') {
      set({ availableCommands: update.availableCommands || [] });
      return;
    }

    if (su === 'interruption_request') {
      set((state) => ({ permissionRequests: [...state.permissionRequests, update] }));
      get().appendTimelineEvent(su, update);
      return;
    }

    if (su === 'question_request') {
      set((state) => ({ questions: [...state.questions, update] }));
      get().appendTimelineEvent(su, update);
      return;
    }

    // 内容事件：agent_message_chunk, agent_thought_chunk, tool_call, tool_call_update, status_change 等
    get().appendTimelineEvent(su || 'session/update', update);
  },

  handleThreadSessionUpdate(threadId, update) {
    const su = update.sessionUpdate || update.session_update || update.type;
    if (!su) return;
    const runtime = get().threadRuntimeById[threadId] || emptyThreadRuntime();
    const metadata = update._meta && typeof update._meta === 'object' ? update._meta : {};
    const runtimePatch = {};
    if (Object.prototype.hasOwnProperty.call(metadata, 'codebuddy.ai/promptSuggestion')) {
      runtimePatch.promptSuggestion = metadata['codebuddy.ai/promptSuggestion'] || null;
    }
    if (metadata['codebuddy.ai/teamUpdate']) {
      runtimePatch.teamState = mergeTeamState(runtime.teamState, metadata['codebuddy.ai/teamUpdate']);
    }
    if (Object.prototype.hasOwnProperty.call(metadata, 'codebuddy.ai/agentPhase')) {
      runtimePatch.agentPhase = metadata['codebuddy.ai/agentPhase'] || null;
    }
    if (Object.prototype.hasOwnProperty.call(metadata, 'codebuddy.ai/progress')) {
      runtimePatch.progress = metadata['codebuddy.ai/progress'] || null;
    }
    if (metadata['codebuddy.ai/historyReplay'] === 'start') runtimePatch.historyReplayActive = true;
    if (metadata['codebuddy.ai/historyReplay'] === 'end') runtimePatch.historyReplayActive = false;
    if (Object.keys(runtimePatch).length) get().patchThreadRuntime(threadId, runtimePatch);

    if (metadata['codebuddy.ai/sessionReset'] && metadata['codebuddy.ai/newSessionId']) {
      get().handleThreadSessionReset(threadId, metadata['codebuddy.ai/newSessionId']).catch((error) => {
        console.warn('Failed to synchronize reset CodeBuddy session:', error);
      });
      return;
    }

    if (metadata['codebuddy.ai/permissionResolved']) {
      const interruptionId = metadata['codebuddy.ai/toolCallId'];
      const decision = metadata['codebuddy.ai/decision'];
      if (interruptionId && decision && get().applyInterruptionResolution(threadId, interruptionId, decision)) {
        get().persistProductState();
      }
    }

    for (const [metadataKey, eventType] of [
      ['codebuddy.ai/goalProgress', 'goal-progress'],
      ['codebuddy.ai/goalStatus', 'goal-status'],
    ]) {
      const goalEvent = metadata[metadataKey];
      if (!goalEvent || typeof goalEvent !== 'object') continue;
      const currentTimeline = get().threadRuntimeById[threadId]?.timeline || runtime.timeline;
      const duplicate = goalEvent.id && currentTimeline.some((item) => (
        item.type === eventType && (item.meta?.id === goalEvent.id || item.raw?.id === goalEvent.id)
      ));
      if (!duplicate) get().appendThreadTimelineEvent(threadId, eventType, { ...goalEvent, type: eventType });
    }

    if (su === 'config_option_update') {
      const patch = get().applySessionConfigUpdate(update.configOptions || []);
      get().patchThreadRuntime(threadId, patch);
      get().updateThreadRecord(threadId, {
        ...(patch.currentModel ? { modelId: patch.currentModel } : {}),
        ...(patch.currentMode ? { modeId: patch.currentMode } : {}),
      });
      return;
    }
    if (su === 'session_info_update') {
      if (update.title) get().updateThreadRecord(threadId, { title: update.title });
      if (get().activeThreadId === threadId) set({ sessionTitle: update.title || get().sessionTitle });
      return;
    }
    if (su === 'usage_update') {
      get().patchThreadRuntime(threadId, { usage: { used: update.used, size: update.size, meta: update._meta || null } });
      return;
    }
    if (su === 'available_commands_update') {
      get().patchThreadRuntime(threadId, { availableCommands: update.availableCommands || [] });
      return;
    }
    if (su === 'interruption_request') {
      const requestId = update.interruptionId || update.toolCallId;
      if (requestId && runtime.permissionRequests.some((item) => sessionActionItemMatches(item, requestId))) return;
      get().patchThreadRuntime(threadId, { permissionRequests: [...runtime.permissionRequests, update] });
      get().appendThreadTimelineEvent(threadId, su, update);
      get().updateThreadRecord(threadId, { status: 'waiting', unread: get().activeThreadId !== threadId });
      return;
    }
    if (su === 'question_request') {
      const requestId = update.toolCallId;
      if (requestId && runtime.questions.some((item) => sessionActionItemMatches(item, requestId))) return;
      get().patchThreadRuntime(threadId, { questions: [...runtime.questions, update] });
      get().appendThreadTimelineEvent(threadId, su, update);
      get().updateThreadRecord(threadId, { status: 'waiting', unread: get().activeThreadId !== threadId });
      return;
    }
    if (su === 'status_change') {
      const rawStatus = update.status || update.state || '';
      const normalizedStatus = ['completed', 'complete', 'idle', 'ready'].includes(rawStatus)
        ? 'idle'
        : ['cancelled', 'canceled'].includes(rawStatus)
          ? 'cancelled'
          : ['error', 'failed'].includes(rawStatus)
            ? 'error'
            : rawStatus || 'running';
      if (['idle', 'error', 'cancelled'].includes(normalizedStatus)) {
        get().patchThreadRuntime(threadId, { agentPhase: null, progress: null, historyReplayActive: false });
      }
      get().updateThreadRecord(threadId, {
        status: normalizedStatus,
        unread: get().activeThreadId !== threadId && ['idle', 'error', 'cancelled'].includes(normalizedStatus),
      });
    }
    get().appendThreadTimelineEvent(threadId, su, update);
  },

  handleConversationEvent({ threadId, type, detail }) {
    const client = conversations.peek(threadId);
    if (type === 'connected') {
      get().patchThreadRuntime(threadId, {
        connectionState: 'connected',
        agentPhase: null,
        progress: null,
        historyReplayActive: false,
      });
      if (get().activeThreadId === threadId) {
        set({ sessionToken: client?.sessionToken || null, error: null });
        setAcpSessionToken(client?.sessionToken || null);
      }
      return;
    }
    if (type === 'reconnecting') {
      get().patchThreadRuntime(threadId, { connectionState: 'reconnecting' });
      return;
    }
    if (type === 'reconnected') {
      get().patchThreadRuntime(threadId, { connectionState: 'connected' });
      return;
    }
    if (type === 'reconnect_failed') {
      get().patchThreadRuntime(threadId, {
        connectionState: 'error',
        agentPhase: null,
        progress: null,
        historyReplayActive: false,
      });
      get().updateThreadRecord(threadId, { status: 'error', unread: get().activeThreadId !== threadId });
      return;
    }
    if (type === 'session/update') {
      get().handleThreadSessionUpdate(threadId, (detail || {}).update || {});
      return;
    }
    if (type === 'initialized') {
      get().patchThreadRuntime(threadId, { capabilities: detail?.agentCapabilities || detail || {} });
      return;
    }
    if (type === 'interruption_request' || type === 'question_request') {
      get().handleThreadSessionUpdate(threadId, { ...(detail || {}), sessionUpdate: type });
      return;
    }
    if (type === 'interaction_requests_invalidated') {
      const interruptionIds = new Set(detail?.interruptionIds || []);
      const questionToolCallIds = new Set(detail?.questionToolCallIds || []);
      const runtime = get().threadRuntimeById[threadId] || emptyThreadRuntime();
      const invalidatedAt = Date.now();
      const invalidates = (item) => (
        (item.type === 'interruption' && Array.from(interruptionIds).some((id) => sessionActionItemMatches(item, id)))
        || (item.type === 'question' && Array.from(questionToolCallIds).some((id) => sessionActionItemMatches(item, id)))
      );
      const timeline = runtime.timeline.map((item) => (
        invalidates(item) && !['resolved', 'answered', 'cancelled', 'expired'].includes(item.status)
          ? {
              ...item,
              status: 'expired',
              meta: { ...(item.meta || {}), invalidatedAt, invalidationReason: detail?.reason || 'connection-replaced' },
            }
          : item
      ));
      const permissionRequests = runtime.permissionRequests.filter((item) => (
        !Array.from(interruptionIds).some((id) => sessionActionItemMatches(item, id))
      ));
      const questions = runtime.questions.filter((item) => (
        !Array.from(questionToolCallIds).some((id) => sessionActionItemMatches(item, id))
      ));
      const changed = permissionRequests.length !== runtime.permissionRequests.length
        || questions.length !== runtime.questions.length
        || timeline.some((item, index) => item !== runtime.timeline[index]);
      if (!changed) return;
      get().patchThreadRuntime(threadId, { permissionRequests, questions, timeline });
      const message = '连接已更换，之前待处理的权限或问题请求已失效。';
      set((state) => {
        const record = state.threadsById[threadId];
        if (!record) return {};
        return {
          threadsById: {
            ...state.threadsById,
            [threadId]: {
              ...record,
              timeline: timeline.slice(-300),
              status: record.status === 'waiting' ? 'error' : record.status,
              metadata: { ...(record.metadata || {}), lastError: message },
              updatedAt: new Date().toISOString(),
            },
          },
          ...(state.activeThreadId === threadId ? { error: message } : {}),
        };
      });
      get().persistProductState();
      return;
    }
    if (type === 'model_update') {
      const runtime = get().threadRuntimeById[threadId] || emptyThreadRuntime();
      get().patchThreadRuntime(threadId, {
        models: normalizeModels(detail?.availableModels || runtime.models),
        currentModel: detail?.currentModelId || runtime.currentModel,
      });
      get().updateThreadRecord(threadId, { modelId: detail?.currentModelId || runtime.currentModel });
      return;
    }
    if (type === 'mode_update' || type === 'current_mode_update') {
      const runtime = get().threadRuntimeById[threadId] || emptyThreadRuntime();
      get().patchThreadRuntime(threadId, {
        ...(type === 'mode_update' ? { modes: normalizeModes(detail?.availableModes || runtime.modes) } : {}),
        currentMode: detail?.currentModeId || runtime.currentMode,
      });
      get().updateThreadRecord(threadId, { modeId: detail?.currentModeId || runtime.currentMode });
      return;
    }
    if (type === 'promptSuggestion') {
      get().patchThreadRuntime(threadId, { promptSuggestion: detail });
      return;
    }
    if (type === 'teamUpdate') {
      const runtime = get().threadRuntimeById[threadId] || emptyThreadRuntime();
      get().patchThreadRuntime(threadId, { teamState: mergeTeamState(runtime.teamState, detail) });
      return;
    }
    get().appendThreadTimelineEvent(threadId, type === '_codebuddy.ai/artifact' ? 'artifact' : type, detail);
  },

  async initializeActiveThread(sessionIdOverride) {
    const project = activeProject(get());
    const thread = activeThread(get());
    if (!project || !thread) {
      set({ connectionState: 'disconnected' });
      return false;
    }
    const request = beginScopedRequest('initializeActiveThread', get(), 'threadId');

    const existingClient = conversations.peek(thread.id);
    if (existingClient?.connected && thread.sessionId) {
      get().activateThreadRuntime(thread.id);
      set({
        sessionId: thread.sessionId,
        sessionTitle: thread.title,
        workspacePath: project.workspacePath,
        connectionState: existingClient.connectionState,
      });
      await get().updateThreadRecord(thread.id, { unread: false, lastOpenedAt: new Date().toISOString() });
      return isScopedRequestCurrent(request, get());
    }

    const client = get().getThreadClient(thread.id);
    if (!client) {
      set({ connectionState: 'error', error: '项目运行时尚未就绪' });
      return false;
    }

    resetSeenContent();
    const requestedSessionId = sessionIdOverride === undefined ? thread.sessionId : sessionIdOverride;
    set({
      sessionId: requestedSessionId || null,
      timeline: Array.isArray(thread.timeline) ? thread.timeline : [],
      permissionRequests: [],
      questions: [],
      sessionTitle: thread.title || null,
      usage: null,
      availableCommands: [],
      workspacePath: project.workspacePath,
      connectionState: 'connecting',
    });
    const preservedRuntime = get().threadRuntimeById[thread.id] || emptyThreadRuntime();
    const preservedPromptQueue = preservedRuntime.promptQueue?.length
      ? preservedRuntime.promptQueue
      : serializePromptQueue(thread.metadata?.promptQueue);
    get().patchThreadRuntime(thread.id, {
      ...emptyThreadRuntime(),
      timeline: (preservedRuntime.timeline || thread.timeline || []).slice(-300),
      promptQueue: preservedPromptQueue,
      pendingAttachments: preservedRuntime.pendingAttachments || [],
      promptSuggestion: preservedRuntime.promptSuggestion || null,
      connectionState: 'connecting',
      currentModel: thread.modelId || null,
      currentMode: thread.modeId || 'default',
    });
    await get().updateActiveThread({ status: 'connecting', lastOpenedAt: new Date().toISOString() });

    const applyInitializedSession = async (init, loaded, recoveryError = null) => {
      const threadRuntime = get().threadRuntimeById[thread.id] || emptyThreadRuntime();
      const availableModels = loaded?.models?.availableModels
        || init?.models?.availableModels
        || init?.agentCapabilities?.availableModels
        || threadRuntime.models;
      const currentModel = loaded?.models?.currentModelId
        || init?.models?.currentModelId
        || thread.modelId
        || threadRuntime.currentModel;
      const availableModes = loaded?.modes?.availableModes
        || init?.modes?.availableModes
        || threadRuntime.modes;
      const currentMode = loaded?.modes?.currentModeId
        || init?.modes?.currentModeId
        || thread.modeId
        || threadRuntime.currentMode;
      const resolvedSessionId = loaded?.sessionId || (recoveryError ? null : requestedSessionId) || null;
      const resolvedTitle = loaded?.title || loaded?.name || thread.title || '新对话';
      const stillActive = isScopedRequestCurrent(request, get());

      if (stillActive) {
        set({
          sessionId: resolvedSessionId,
          sessionTitle: resolvedTitle,
          currentModel,
          models: normalizeModels(availableModels),
          modes: normalizeModes(availableModes),
          currentMode,
          connectionState: 'connected',
          error: null,
        });
      }
      get().patchThreadRuntime(thread.id, {
        sessionId: resolvedSessionId,
        connectionState: 'connected',
        currentModel,
        models: normalizeModels(availableModels),
        modes: normalizeModes(availableModes),
        currentMode,
        capabilities: init?.agentCapabilities || threadRuntime.capabilities || {},
      });
      await get().updateThreadRecord(thread.id, {
        sessionId: resolvedSessionId,
        title: resolvedTitle,
        modelId: currentModel || null,
        modeId: currentMode || 'default',
        status: 'idle',
        unread: false,
        metadata: recoveryError ? {
          ...(thread.metadata || {}),
          previousSessionId: requestedSessionId,
          recoveryError,
          recoveredAt: new Date().toISOString(),
          lastError: null,
        } : { ...(thread.metadata || {}), lastError: null },
      });
      if ((get().threadRuntimeById[thread.id]?.promptQueue || []).length > 0) {
        setTimeout(() => get().drainThreadPromptQueue(thread.id), 0);
      }
      if (recoveryError) {
        const currentTimeline = get().threadRuntimeById[thread.id]?.timeline || [];
        const warning = `原会话恢复失败，已创建新会话继续工作。${recoveryError}`;
        if (!currentTimeline.some((item) => item.content === warning)) get().appendThreadTimelineEvent(thread.id, 'error', {
          type: 'error',
          message: warning,
        });
      }
      return isScopedRequestCurrent(request, get());
    };

    try {
      const knownRecoveryError = thread.metadata?.lastError || thread.metadata?.recoveryError || '';
      if (requestedSessionId && /(timeout|408)/i.test(knownRecoveryError)) {
        await client.connect();
        const init = await client.initialize();
        const loaded = await client.request('session/new', { cwd: project.workspacePath || '.', mcpServers: [] });
        return await applyInitializedSession(init, loaded, knownRecoveryError);
      }
      const { init, loaded } = await client.initializeSession(requestedSessionId || null, project.workspacePath || '.');
      return await applyInitializedSession(init, loaded);
    } catch (error) {
      if (requestedSessionId) {
        try {
          const loaded = await client.request('session/new', { cwd: project.workspacePath || '.', mcpServers: [] });
          return await applyInitializedSession(null, loaded, error.message);
        } catch (_) {}
      }
      const stillActive = isScopedRequestCurrent(request, get());
      if (stillActive) set({ error: error.message, connectionState: 'error' });
      get().patchThreadRuntime(thread.id, { connectionState: 'error' });
      await get().updateThreadRecord(thread.id, {
        status: 'error',
        metadata: { ...(thread.metadata || {}), lastError: error.message },
      });
      return false;
    }
  },

  async activateThread(threadId) {
    if (isProjectMutationNavigation(get())) return false;
    const thread = get().threadsById[threadId];
    const project = thread ? get().projectsById[thread.projectId] : null;
    if (!thread || !project) return false;
    if (threadId === get().activeThreadId) return true;
    const navigation = beginProjectNavigation(set, `thread:${threadId}`);
    try {
      const projectChanged = thread.projectId !== get().activeProjectId;
      if (projectChanged) {
        const confirmed = await requestDirtyFileConfirmation(set, get, '切换项目');
        if (!isProjectNavigationCurrent(navigation) || !confirmed) return false;
        await get().persistActiveProjectWorkspaceState({ discardDirty: true });
        if (!isProjectNavigationCurrent(navigation)) return false;
        await get().persistActiveProjectTerminalState();
        if (!isProjectNavigationCurrent(navigation)) return false;
      }
      const currentThread = get().threadsById[threadId];
      const currentProject = get().projectsById[project.id];
      if (!currentThread || !currentProject || currentThread.projectId !== project.id) return false;
      set({
        activeProjectId: project.id,
        activeThreadId: thread.id,
        workspacePath: project.workspacePath,
        ...(projectChanged ? resetProjectRuntimeViews() : {}),
        ...(projectChanged ? resetFileWorkspace(project.workspacePath) : {}),
      });
      if (projectChanged) get().loadProjectTerminalState(project.id);
      get().activateThreadRuntime(thread.id);
      const persisted = await get().persistProductState();
      if (!isProjectNavigationCurrent(navigation)) return false;
      if (!persisted) throw new Error(get().error || '保存会话状态失败');
      const runtime = await get().ensureProjectRuntime(project.id);
      if (!isProjectNavigationCurrent(navigation)) return false;
      if (!runtime) throw new Error(get().error || '项目运行时启动失败');
      if (projectChanged) {
        const opened = await get().initializeWorkspace();
        if (!isProjectNavigationCurrent(navigation)) return false;
        if (!opened) throw new Error(get().error || '恢复项目工作区失败');
      }
      const initialized = await get().initializeActiveThread(thread.sessionId);
      if (!isProjectNavigationCurrent(navigation)) return false;
      if (!initialized) throw new Error(get().error || '会话连接失败');
      if (projectChanged) await get().refreshProjectViews();
      else await Promise.allSettled([get().refreshStats(), get().refreshTasks()]);
      return true;
    } catch (error) {
      if (isProjectNavigationCurrent(navigation)) {
        const message = error?.message || '切换会话失败';
        set({ error: message });
        finishProjectNavigation(set, navigation, message);
      }
      return false;
    } finally {
      finishProjectNavigation(set, navigation, get().projectNavigationError);
    }
  },

  async renameThread(threadId, name) {
    return queueThreadMutation(threadId, async () => {
      const thread = get().threadsById[threadId];
      const projectId = thread?.projectId;
      const title = String(name || '').trim();
      if (!thread || !title) return false;
      if (thread.sessionId) {
        if (projectId !== get().activeProjectId) return false;
        try {
          await apiRenameSession(thread.sessionId, title);
        } catch (error) {
          if (projectId === get().activeProjectId) set({ error: error.message || '重命名会话失败' });
          return false;
        }
      }
      if (!get().threadsById[threadId]) return false;
      set((state) => ({
        threadsById: {
          ...state.threadsById,
          [threadId]: { ...state.threadsById[threadId], title, updatedAt: new Date().toISOString() },
        },
        sessionTitle: state.activeThreadId === threadId ? title : state.sessionTitle,
        sessions: state.sessions.map((session) => (
          (session.id || session.sessionId) === thread.sessionId ? { ...session, name: title } : session
        )),
      }));
      await get().persistProductState();
      return true;
    });
  },

  async deleteThread(threadId) {
    return queueThreadMutation(threadId, async () => {
      const thread = get().threadsById[threadId];
      const projectId = thread?.projectId;
      if (!thread) return false;
      if (thread.sessionId) {
        if (projectId !== get().activeProjectId) return false;
        try {
          await apiDeleteSession(thread.sessionId);
        } catch (error) {
          if (projectId === get().activeProjectId) set({ error: error.message || '删除会话失败' });
          return false;
        }
      }
      if (!get().threadsById[threadId]) return false;
      await conversations.dispose(threadId);
      const wasActive = get().activeThreadId === threadId;
      set((state) => {
        const threadsById = { ...state.threadsById };
        delete threadsById[threadId];
        const order = (state.threadOrderByProject[thread.projectId] || []).filter((id) => id !== threadId);
        return {
          threadsById,
          threadOrderByProject: { ...state.threadOrderByProject, [thread.projectId]: order },
          sessions: state.sessions.filter((session) => (session.id || session.sessionId) !== thread.sessionId),
          activeThreadId: wasActive ? (order[0] || null) : state.activeThreadId,
        };
      });
      await get().persistProductState();
      if (wasActive) {
        const replacementId = get().activeThreadId;
        if (replacementId) await get().activateThread(replacementId);
        else await get().newSession();
      }
      return true;
    });
  },

  async setModel(modelId) {
    const state = get();
    const threadId = state.activeThreadId;
    const sessionId = state.sessionId;
    if (!threadId || !sessionId || !modelId) return false;
    return queueSessionSettingOperation(`${threadId}:model`, async () => {
      const target = get().threadsById[threadId];
      if (!target || target.sessionId !== sessionId) return false;
      try {
        const client = get().getThreadClient(threadId);
        if (!client) throw new Error('当前会话未连接');
        await client.request('session/set_model', { sessionId, modelId });
        const thread = get().threadsById[threadId];
        if (!thread || thread.sessionId !== sessionId) return false;
        get().patchThreadRuntime(threadId, { currentModel: modelId });
        if (get().activeThreadId === threadId && get().sessionId === sessionId) set({ currentModel: modelId });
        await get().updateThreadRecord(threadId, { modelId });
        return true;
      } catch (error) {
        if (get().activeThreadId === threadId && get().sessionId === sessionId) set({ error: error.message });
        return false;
      }
    });
  },

  async setMode(modeId) {
    const state = get();
    const threadId = state.activeThreadId;
    const sessionId = state.sessionId;
    if (!threadId || !sessionId || !modeId) return false;
    return queueSessionSettingOperation(`${threadId}:mode`, async () => {
      const target = get().threadsById[threadId];
      if (!target || target.sessionId !== sessionId) return false;
      try {
        const client = get().getThreadClient(threadId);
        if (!client) throw new Error('当前会话未连接');
        await client.request('session/set_mode', { sessionId, modeId });
        const thread = get().threadsById[threadId];
        if (!thread || thread.sessionId !== sessionId) return false;
        get().patchThreadRuntime(threadId, { currentMode: modeId });
        if (get().activeThreadId === threadId && get().sessionId === sessionId) set({ currentMode: modeId });
        await get().updateThreadRecord(threadId, { modeId });
        return true;
      } catch (error) {
        if (get().activeThreadId === threadId && get().sessionId === sessionId) set({ error: error.message });
        return false;
      }
    });
  },

  async newSession() {
    if (get().projectNavigationBusy) {
      set({ newSessionError: '请等待项目或会话切换完成' });
      return false;
    }
    if (get().newSessionBusy) return false;
    const projectId = get().activeProjectId;
    const previousThreadId = get().activeThreadId;
    let thread = null;
    set({ newSessionBusy: true, newSessionProjectId: projectId, newSessionError: null, error: null });
    try {
      if (!projectId) {
        await get().chooseWorkspace();
        const created = Boolean(get().activeThreadId);
        if (!created) set({ newSessionError: get().error || '未能创建新会话' });
        return created;
      }

      thread = createThreadRecord(projectId);
      set((state) => ({
        threadsById: { ...state.threadsById, [thread.id]: thread },
        threadOrderByProject: {
          ...state.threadOrderByProject,
          [projectId]: [...(state.threadOrderByProject[projectId] || []), thread.id],
        },
        activeThreadId: thread.id,
      }));

      const persisted = await get().persistProductState();
      if (!persisted) {
        set((state) => {
          const threadsById = { ...state.threadsById };
          delete threadsById[thread.id];
          return {
            threadsById,
            threadOrderByProject: {
              ...state.threadOrderByProject,
              [projectId]: (state.threadOrderByProject[projectId] || []).filter((id) => id !== thread.id),
            },
            activeThreadId: state.activeThreadId === thread.id ? previousThreadId : state.activeThreadId,
            newSessionError: state.error || '保存新会话失败',
          };
        });
        return false;
      }

      if (get().activeProjectId !== projectId || get().activeThreadId !== thread.id) return true;
      const initialized = await get().initializeActiveThread(null);
      if (!initialized && get().activeProjectId === projectId && get().activeThreadId === thread.id) {
        set({ newSessionError: get().error || '新会话连接失败，请重试' });
      }
      return initialized;
    } catch (error) {
      if (get().activeProjectId === projectId) set({ newSessionError: error?.message || '创建新会话失败' });
      return false;
    } finally {
      set({ newSessionBusy: false });
    }
  },

  // 切工作区：经 IPC 弹目录选择框 → set workspacePath + 持久化 → 用新 cwd 起新会话 + 重定向文件树根
  // cwd 一次性注入到 session/new，agent 工具调用就以此目录为工作根；不动后端进程
  // ⚠ 注意：CLI 协议 cwd 只在 session/new|load 一次性注入，运行中改不了 cwd。
  //   所以切工作区 = 起新会话（旧 sessionId + timeline 丢），UI 要明告知用户。
  async chooseWorkspace(options = {}) {
    if (!window.electronAPI?.chooseWorkspace) {
      set({ error: '工作区选择不可用（IPC 缺失）' });
      return false;
    }
    let path = null;
    try {
      path = await window.electronAPI.chooseWorkspace();
    } catch (err) {
      set({ error: '工作区选择失败: ' + err.message });
      return false;
    }
    if (!path) return null; // 用户取消
    return get().setWorkspace(path, options);
  },

  async setWorkspace(path, options = {}) {
    if (!path) return false;
    if (isProjectMutationNavigation(get())) return false;
    const normalizedPath = String(path);
    const navigation = beginProjectNavigation(set, `workspace:${normalizedPath}`);
    try {
      const currentProject = activeProject(get());
      if (currentProject?.workspacePath?.toLowerCase() === normalizedPath.toLowerCase()) return true;
      if (currentProject?.workspacePath?.toLowerCase() !== normalizedPath.toLowerCase()) {
        const confirmed = await requestDirtyFileConfirmation(set, get, '切换工作区');
        if (!isProjectNavigationCurrent(navigation) || !confirmed) return false;
      }
      await get().persistActiveProjectWorkspaceState({ discardDirty: true });
      if (!isProjectNavigationCurrent(navigation)) return false;
      await get().persistActiveProjectTerminalState();
      if (!isProjectNavigationCurrent(navigation)) return false;
      let project = Object.values(get().projectsById).find((item) => (
        item.workspacePath.toLowerCase() === normalizedPath.toLowerCase()
      ));
      let thread = project
        ? get().threadsById[get().threadOrderByProject[project.id]?.[0]]
        : null;
      if (!project) project = createProjectRecord(normalizedPath);
      if (!thread) thread = createThreadRecord(project.id);
      const projectChanged = currentProject?.id !== project.id;

      set((state) => ({
        projectsById: {
          ...state.projectsById,
          [project.id]: { ...project, lastOpenedAt: new Date().toISOString() },
        },
        projectOrder: state.projectOrder.includes(project.id)
          ? state.projectOrder
          : [...state.projectOrder, project.id],
        threadsById: { ...state.threadsById, [thread.id]: thread },
        threadOrderByProject: {
          ...state.threadOrderByProject,
          [project.id]: state.threadOrderByProject[project.id]?.includes(thread.id)
            ? state.threadOrderByProject[project.id]
            : [...(state.threadOrderByProject[project.id] || []), thread.id],
        },
        activeProjectId: project.id,
        activeThreadId: thread.id,
        workspacePath: normalizedPath,
        ...(projectChanged ? resetProjectRuntimeViews() : {}),
        ...resetFileWorkspace(normalizedPath),
      }));
      get().loadProjectTerminalState(project.id);
      try { localStorage.removeItem('codebuddy-gui-workspace'); } catch (_) {}
      const persisted = await get().persistProductState();
      if (!isProjectNavigationCurrent(navigation)) return false;
      if (!persisted) throw new Error(get().error || '保存项目状态失败');
      const runtime = await get().ensureProjectRuntime(project.id);
      if (!isProjectNavigationCurrent(navigation)) return false;
      if (!runtime) throw new Error(get().error || '项目运行时启动失败');
      if (options.deferInitializationUntilAuth) return true;
      const opened = await get().initializeWorkspace();
      if (!isProjectNavigationCurrent(navigation)) return false;
      if (!opened) throw new Error(get().error || '恢复工作区失败');
      const initialized = await get().initializeActiveThread(thread.sessionId);
      if (!isProjectNavigationCurrent(navigation)) return false;
      if (!initialized) throw new Error(get().error || '会话连接失败');
      if (projectChanged) await get().refreshProjectViews();
      else await Promise.allSettled([get().refreshStats(), get().refreshTasks(), get().refreshSessions()]);
      return true;
    } catch (error) {
      if (isProjectNavigationCurrent(navigation)) {
        const message = error?.message || '切换工作区失败';
        set({ error: message });
        finishProjectNavigation(set, navigation, message);
      }
      return false;
    } finally {
      finishProjectNavigation(set, navigation, get().projectNavigationError);
    }
  },

  async activateProject(projectId, options = {}) {
    if (isProjectMutationNavigation(get())) return false;
    const project = get().projectsById[projectId];
    if (!project || projectId === get().activeProjectId) return Boolean(project);
    const navigation = beginProjectNavigation(set, `project:${projectId}`);
    try {
      const confirmed = await requestDirtyFileConfirmation(set, get, '切换项目');
      if (!isProjectNavigationCurrent(navigation) || !confirmed) return false;
      await get().persistActiveProjectWorkspaceState({ discardDirty: true });
      if (!isProjectNavigationCurrent(navigation)) return false;
      await get().persistActiveProjectTerminalState();
      if (!isProjectNavigationCurrent(navigation)) return false;
      let threadId = get().threadOrderByProject[projectId]?.[0] || null;
      let thread = threadId ? get().threadsById[threadId] : null;
      if (!thread) {
        thread = createThreadRecord(projectId);
        threadId = thread.id;
        set((state) => ({
          threadsById: { ...state.threadsById, [thread.id]: thread },
          threadOrderByProject: { ...state.threadOrderByProject, [projectId]: [thread.id] },
        }));
      }
      set({
        activeProjectId: projectId,
        activeThreadId: threadId,
        workspacePath: project.workspacePath,
        ...resetProjectRuntimeViews(),
        ...resetFileWorkspace(project.workspacePath),
      });
      get().loadProjectTerminalState(projectId);
      const persisted = await get().persistProductState();
      if (!isProjectNavigationCurrent(navigation)) return false;
      if (!persisted) throw new Error(get().error || '保存项目状态失败');
      const runtime = await get().ensureProjectRuntime(projectId);
      if (!isProjectNavigationCurrent(navigation)) return false;
      if (!runtime) throw new Error(get().error || '项目运行时启动失败');
      if (options.deferInitializationUntilAuth) return true;
      const opened = await get().initializeWorkspace();
      if (!isProjectNavigationCurrent(navigation)) return false;
      if (!opened) throw new Error(get().error || '恢复项目工作区失败');
      const initialized = await get().initializeActiveThread(thread.sessionId);
      if (!isProjectNavigationCurrent(navigation)) return false;
      if (!initialized) throw new Error(get().error || '会话连接失败');
      await get().refreshProjectViews();
      return true;
    } catch (error) {
      if (isProjectNavigationCurrent(navigation)) {
        const message = error?.message || '切换项目失败';
        set({ error: message });
        finishProjectNavigation(set, navigation, message);
      }
      return false;
    } finally {
      finishProjectNavigation(set, navigation, get().projectNavigationError);
    }
  },

  async renameProject(projectId, name) {
    if (get().projectNavigationBusy) return false;
    const project = get().projectsById[projectId];
    const nextName = String(name || '').trim();
    if (!project || !nextName) return false;
    const navigation = beginProjectNavigation(set, `project-action:rename:${projectId}`);
    try {
      set((state) => ({
        projectsById: {
          ...state.projectsById,
          [projectId]: { ...state.projectsById[projectId], name: nextName, updatedAt: new Date().toISOString() },
        },
      }));
      const persisted = await get().persistProductState();
      if (!isProjectNavigationCurrent(navigation)) return false;
      if (!persisted) {
        set((state) => {
          const current = state.projectsById[projectId];
          if (!current || current.name !== nextName) return {};
          return {
            projectsById: {
              ...state.projectsById,
              [projectId]: { ...current, name: project.name, updatedAt: project.updatedAt },
            },
          };
        });
        throw new Error(get().error || '重命名项目失败');
      }
      return true;
    } catch (error) {
      if (isProjectNavigationCurrent(navigation)) {
        const message = error?.message || '重命名项目失败';
        set({ error: message });
        finishProjectNavigation(set, navigation, message);
      }
      return false;
    } finally {
      finishProjectNavigation(set, navigation, get().projectNavigationError);
    }
  },

  async removeProject(projectId, options = {}) {
    if (get().projectNavigationBusy) return false;
    const initialState = get();
    const project = initialState.projectsById[projectId];
    if (!project) return false;
    const wasActive = initialState.activeProjectId === projectId;
    const navigation = beginProjectNavigation(set, `project-action:remove:${projectId}`);
    let removalPersisted = false;
    try {
      if (wasActive && !options.skipDirtyCheck) {
        const confirmed = await requestDirtyFileConfirmation(set, get, '移除当前项目');
        if (!isProjectNavigationCurrent(navigation) || !confirmed) return false;
      }
      const previousState = get();
      const threadIds = [...(previousState.threadOrderByProject[projectId] || [])];
      await get().stopProjectRuntime(projectId).catch(() => false);
      if (!isProjectNavigationCurrent(navigation)) return false;
      if (!get().projectsById[projectId]) return false;

      let nextProjectId = null;
      let nextThread = null;
      if (wasActive) {
        nextProjectId = previousState.projectOrder.find((id) => id !== projectId && previousState.projectsById[id]) || null;
        const nextThreadId = nextProjectId ? previousState.threadOrderByProject[nextProjectId]?.[0] : null;
        nextThread = nextThreadId ? previousState.threadsById[nextThreadId] : null;
        if (nextProjectId && !nextThread) nextThread = createThreadRecord(nextProjectId);
      }

      set((state) => {
        const projectsById = { ...state.projectsById };
        const threadsById = { ...state.threadsById };
        const threadRuntimeById = { ...state.threadRuntimeById };
        const threadOrderByProject = { ...state.threadOrderByProject };
        delete projectsById[projectId];
        delete threadOrderByProject[projectId];
        for (const threadId of threadIds) {
          delete threadsById[threadId];
          delete threadRuntimeById[threadId];
        }
        if (nextThread) {
          threadsById[nextThread.id] = nextThread;
          threadOrderByProject[nextProjectId] = [
            nextThread.id,
            ...(threadOrderByProject[nextProjectId] || []).filter((id) => id !== nextThread.id),
          ];
        }
        return {
          projectsById,
          projectOrder: state.projectOrder.filter((id) => id !== projectId),
          threadsById,
          threadRuntimeById,
          threadOrderByProject,
          activeProjectId: wasActive ? nextProjectId : state.activeProjectId,
          activeThreadId: wasActive ? (nextThread?.id || null) : state.activeThreadId,
          workspacePath: wasActive ? (projectsById[nextProjectId]?.workspacePath || null) : state.workspacePath,
          ...(wasActive ? resetProjectRuntimeViews() : {}),
          ...(wasActive ? resetFileWorkspace(projectsById[nextProjectId]?.workspacePath || '.') : {}),
        };
      });
      if (wasActive) {
        get().loadProjectTerminalState(nextProjectId);
        get().activateThreadRuntime(nextThread?.id || null);
      }

      const persisted = await get().persistProductState();
      if (!isProjectNavigationCurrent(navigation)) return false;
      if (!persisted) {
        const persistenceError = get().error;
        set({ ...previousState, error: persistenceError });
        if (wasActive || project.runtimeStatus === 'running') {
          const runtime = await get().ensureProjectRuntime(projectId).catch(() => null);
          if (runtime && wasActive) {
            const previousThread = previousState.threadsById[previousState.activeThreadId];
            await get().initializeActiveThread(previousThread?.sessionId).catch(() => false);
          }
        }
        throw new Error(persistenceError || '移除项目失败');
      }
      removalPersisted = true;

      if (wasActive && nextProjectId && nextThread) {
        const nextProject = get().projectsById[nextProjectId];
        const runtime = await get().ensureProjectRuntime(nextProjectId);
        if (!isProjectNavigationCurrent(navigation)) return true;
        if (!runtime || !nextProject) throw new Error(get().error || '替代项目运行时启动失败');
        const opened = await get().initializeWorkspace();
        if (!isProjectNavigationCurrent(navigation)) return true;
        if (!opened) throw new Error(get().error || '替代项目工作区恢复失败');
        const initialized = await get().initializeActiveThread(nextThread.sessionId);
        if (!isProjectNavigationCurrent(navigation)) return true;
        if (!initialized) throw new Error(get().error || '替代项目会话连接失败');
        await get().refreshProjectViews();
      } else if (wasActive) {
        set({ sessionId: null, sessionTitle: null, connectionState: 'disconnected', ...resetProjectRuntimeViews() });
        get().activateThreadRuntime(null);
      }
      return true;
    } catch (error) {
      if (isProjectNavigationCurrent(navigation)) {
        const detail = error?.message || '移除项目失败';
        const message = removalPersisted ? `项目已移除，但${detail}` : detail;
        set({ error: message });
        finishProjectNavigation(set, navigation, message);
      }
      return removalPersisted;
    } finally {
      finishProjectNavigation(set, navigation, get().projectNavigationError);
    }
  },

  applyProjectRuntimeStatus(runtime) {
    if (!runtime?.projectId) return;
    let terminalStateReset = false;
    set((state) => {
      const project = state.projectsById[runtime.projectId];
      if (!project) return {};
      const runtimeStatus = runtime.status || 'idle';
      const runtimeStartedAt = runtime.startedAt || (runtimeStatus === 'starting' ? project.runtimeStartedAt : null);
      const runtimeChanged = runtimeStatus === 'running'
        && Boolean(runtimeStartedAt)
        && runtimeStartedAt !== project.runtimeStartedAt;
      const runtimeUnavailable = ['stopped', 'error'].includes(runtimeStatus);
      const currentTerminalState = terminalStateFromProject(project, false);
      const hasTerminalSessions = currentTerminalState.panes.some((pane) => pane.sessionId)
        || (state.activeProjectId === runtime.projectId && state.terminalPanes.some((pane) => pane.sessionId));
      const resetTerminalSessions = (runtimeChanged || runtimeUnavailable) && hasTerminalSessions;
      terminalStateReset = resetTerminalSessions;
      const terminalState = resetTerminalSessions
        ? terminalStateFromProject(project, true)
        : currentTerminalState;
      const nextProject = {
        ...project,
        runtimeStatus,
        runtimePort: runtime.port || null,
        runtimePid: runtime.pid || null,
        runtimeStartedAt,
        runtimeError: runtime.error || null,
        ...(resetTerminalSessions ? {
          preferences: {
            ...(project.preferences || {}),
            terminalState: {
              activePaneId: terminalState.activePaneId,
              panes: terminalState.panes,
            },
          },
        } : {}),
      };
      return {
        projectsById: { ...state.projectsById, [runtime.projectId]: nextProject },
        ...(resetTerminalSessions && state.activeProjectId === runtime.projectId ? {
          terminalPanes: terminalState.panes,
          activePaneId: terminalState.activePaneId,
          terminalSessions: [],
          ptySessionId: null,
        } : {}),
      };
    });
    const runtimeUnavailable = ['stopped', 'error'].includes(runtime.status || '');
    if (runtimeUnavailable) {
      conversations.disposeProject(get().threadOrderByProject[runtime.projectId] || []);
      if (get().activeProjectId === runtime.projectId) {
        setAcpSessionToken(null);
        setAuthToken(null);
      }
      get().disconnectProjectThreads(runtime.projectId);
    } else if (terminalStateReset) {
      get().persistProductState();
    }
  },

  async disconnectProjectThreads(projectId) {
    if (!projectId) return false;
    const disconnectedAt = new Date().toISOString();
    set((state) => {
      const threadIds = state.threadOrderByProject[projectId] || [];
      const threadsById = { ...state.threadsById };
      const threadRuntimeById = { ...state.threadRuntimeById };
      for (const threadId of threadIds) {
        const record = threadsById[threadId];
        if (record) {
          const status = ['idle', 'connecting', 'running', 'waiting'].includes(record.status)
            ? 'disconnected'
            : record.status;
          threadsById[threadId] = { ...record, status, updatedAt: disconnectedAt };
        }
        const runtime = threadRuntimeById[threadId] || emptyThreadRuntime();
        threadRuntimeById[threadId] = {
          ...runtime,
          connectionState: 'disconnected',
          permissionRequests: [],
          questions: [],
          isAwaitingResponse: false,
          teamState: null,
          agentPhase: null,
          progress: null,
          historyReplayActive: false,
        };
      }
      return { threadsById, threadRuntimeById };
    });
    if (get().activeProjectId === projectId) get().activateThreadRuntime(get().activeThreadId);
    return get().persistProductState();
  },

  async ensureProjectRuntime(projectId = get().activeProjectId) {
    return queueProjectRuntimeOperation(projectId, async () => {
      const project = get().projectsById[projectId];
      if (!project || !window.electronAPI?.ensureProjectRuntime) return null;
      get().applyProjectRuntimeStatus({ projectId, status: 'starting' });
      try {
        const runtime = await window.electronAPI.ensureProjectRuntime({
          projectId,
          cwd: project.workspacePath,
        });
        await connectActiveProjectRuntime(set, get, projectId, runtime);
        get().applyProjectRuntimeStatus(runtime);
        return runtime;
      } catch (error) {
        const stopped = get().projectsById[projectId]?.runtimeStatus === 'stopped';
        if (/start cancelled/i.test(error.message || '') || stopped) return null;
        get().applyProjectRuntimeStatus({ projectId, status: 'error', error: error.message });
        if (projectId === get().activeProjectId) {
          set({ connectionState: 'error', error: `项目运行时启动失败: ${error.message}` });
        }
        return null;
      }
    });
  },

  async startProjectRuntime(projectId = get().activeProjectId) {
    if (projectId === get().activeProjectId) set({ error: null });
    const runtime = await get().ensureProjectRuntime(projectId);
    if (!runtime) return false;
    if (projectId !== get().activeProjectId) return runtime;
    const thread = activeThread(get());
    if (!thread || thread.projectId !== projectId) return runtime;
    const initialized = await get().initializeActiveThread(thread.sessionId);
    if (!initialized) return false;
    await get().refreshProjectViews();
    return runtime;
  },

  async stopProjectRuntime(projectId = get().activeProjectId) {
    return queueProjectRuntimeOperation(projectId, async () => {
      if (!projectId || !window.electronAPI?.stopProjectRuntime) return false;
      await conversations.disposeProject(get().threadOrderByProject[projectId] || []);
      await get().disconnectProjectThreads(projectId);
      if (projectId === get().activeProjectId) {
        setAcpSessionToken(null);
        setAuthToken(null);
        set({ connectionState: 'disconnected' });
      }
      try {
        const runtime = await window.electronAPI.stopProjectRuntime(projectId);
        get().applyProjectRuntimeStatus(runtime || { projectId, status: 'stopped' });
        return true;
      } catch (error) {
        set((state) => {
          const project = state.projectsById[projectId];
          if (!project) return {};
          return {
            projectsById: {
              ...state.projectsById,
              [projectId]: { ...project, runtimeError: error.message || '停止运行时失败' },
            },
          };
        });
        if (projectId === get().activeProjectId) {
          set({ connectionState: 'error', error: `停止项目运行时失败: ${error.message}` });
        }
        return false;
      }
    });
  },

  async restartProjectRuntime(projectId = get().activeProjectId, options = {}) {
    return queueProjectRuntimeOperation(projectId, async () => {
      const project = get().projectsById[projectId];
      if (!project || !window.electronAPI?.restartProjectRuntime) return false;
      await conversations.disposeProject(get().threadOrderByProject[projectId] || []);
      await get().disconnectProjectThreads(projectId);
      if (projectId === get().activeProjectId) {
        setAcpSessionToken(null);
        setAuthToken(null);
      }
      try {
        const runtime = await window.electronAPI.restartProjectRuntime({ projectId, cwd: project.workspacePath });
        get().applyProjectRuntimeStatus(runtime);
        const connected = await connectActiveProjectRuntime(set, get, projectId, runtime);
        if (connected && projectId === get().activeProjectId) {
          if (options.deferInitializationUntilAuth) return true;
          const initialized = await get().initializeActiveThread(undefined);
          if (!initialized) return false;
          await get().refreshProjectViews();
        }
        return true;
      } catch (error) {
        get().applyProjectRuntimeStatus({ projectId, status: 'error', error: error.message });
        if (projectId === get().activeProjectId) set({ error: `重启项目运行时失败: ${error.message}` });
        return false;
      }
    });
  },

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
    if (!query) { set({ fileNameResults: [], fileNameSearching: false }); return; }
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
      try { await removeWatcher(previousWatcherId); } catch (_) {}
    }
    try {
      const data = await createWatcher(target, true);
      const watcherId = data.watcherId || data.id || null;
      if (!watcherId) return null;
      if (requestId !== fileWatcherRequestId || projectId !== get().activeProjectId || target !== get().fileCwd) {
        try { await removeWatcher(watcherId); } catch (_) {}
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
    return get().persistProjectWorkspaceState(projectId, workspaceStateSnapshot(get(), projectId, options.discardDirty === true));
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
      terminalPanes: state.terminalPanes.map((pane) => pane.id === paneId ? { ...pane, sessionId } : pane),
      ptySessionId: sessionId,
    }));
    get().scheduleTerminalStatePersist();
    return true;
  },

  setPaneStatus(paneId, status, projectId = get().activeProjectId) {
    if (projectId !== get().activeProjectId) return false;
    set((state) => ({
      terminalPanes: state.terminalPanes.map((pane) => pane.id === paneId ? { ...pane, status } : pane),
    }));
    get().scheduleTerminalStatePersist();
    return true;
  },

  setPaneSession(paneId, sessionId, projectId = get().activeProjectId) {
    if (projectId !== get().activeProjectId) return false;
    set((state) => ({
      terminalPanes: state.terminalPanes.map((pane) => pane.id === paneId ? { ...pane, sessionId } : pane),
    }));
    get().scheduleTerminalStatePersist();
    return true;
  },

  appendPaneOutput(paneId, chunk, projectId = get().activeProjectId) {
    if (projectId !== get().activeProjectId) return false;
    set((state) => ({
      terminalPanes: state.terminalPanes.map((pane) => pane.id === paneId ? { ...pane, output: `${pane.output || ''}${chunk}`.slice(-200000) } : pane),
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
          ...(state.activeThreadId === threadId ? {
            sessionId: normalizedSessionId,
            sessionTitle: '新对话',
            error: null,
          } : {}),
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
          metadata: { ...(get().threadsById[threadId]?.metadata || {}), sessionResetLoadError: message, lastError: message },
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
        const currentModel = loaded?.models?.currentModelId || configPatch.currentModel || currentRuntime.currentModel;
        const currentMode = loaded?.modes?.currentModeId || configPatch.currentMode || currentRuntime.currentMode || 'default';
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
            ...(state.activeThreadId === threadId ? {
              sessionId: normalizedSessionId,
              sessionTitle: title,
              currentModel,
              currentMode,
              connectionState: 'connected',
              error: null,
            } : {}),
          };
        });
        await get().persistProductState();
        if (get().activeProjectId === project.id) await get().refreshSessions().catch(() => false);
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
            ...(state.activeThreadId === threadId ? {
              sessionId: normalizedSessionId,
              sessionTitle: current.title || '新对话',
              connectionState: 'connected',
              error: message,
            } : {}),
          };
        });
        await get().persistProductState();
        return false;
      }
    });
  },

  applyInterruptionResolution(threadId, interruptionId, decision, resolvedAt = Date.now()) {
    if (!threadId || !interruptionId) return false;
    const runtime = get().threadRuntimeById[threadId] || emptyThreadRuntime();
    let timelineChanged = false;
    const timeline = runtime.timeline.map((item) => {
      if (item.type !== 'interruption' || !sessionActionItemMatches(item, interruptionId)) return item;
      if (item.status === 'resolved' && item.meta?.resolution === decision) return item;
      timelineChanged = true;
      return {
        ...item,
        status: 'resolved',
        meta: { ...(item.meta || {}), resolution: decision, resolvedAt },
      };
    });
    const permissionRequests = runtime.permissionRequests.filter((item) => !sessionActionItemMatches(item, interruptionId));
    if (!timelineChanged && permissionRequests.length === runtime.permissionRequests.length) return false;
    get().patchThreadRuntime(threadId, { permissionRequests, timeline });
    set((state) => {
      const record = state.threadsById[threadId];
      if (!record) return {};
      const stillWaiting = permissionRequests.length > 0 || runtime.questions.length > 0;
      return {
        threadsById: {
          ...state.threadsById,
          [threadId]: {
            ...record,
            timeline: timeline.slice(-300),
            status: record.status === 'waiting' && !stillWaiting ? 'running' : record.status,
            updatedAt: new Date().toISOString(),
          },
        },
      };
    });
    return true;
  },

  async respondToInterruption(interruptionId, decision = 'allow', toolCallId = null) {
    const state = get();
    const projectId = state.activeProjectId;
    const threadId = state.activeThreadId;
    const sessionId = state.sessionId;
    if (!projectId || !threadId || !sessionId || !interruptionId) return false;
    set({ error: null });
    return runUniqueSessionAction(threadId + ':interruption:' + interruptionId, async () => {
      const thread = get().threadsById[threadId];
      if (!thread || thread.projectId !== projectId || thread.sessionId !== sessionId) return false;
      const runtime = get().threadRuntimeById[threadId] || emptyThreadRuntime();
      const target = runtime.timeline.find((item) => item.type === 'interruption' && sessionActionItemMatches(item, interruptionId));
      const resolvedToolCallId = toolCallId || target?.toolCallId || target?.meta?.toolCallId || target?.raw?.toolCallId || null;
      const client = get().getThreadClient(threadId);
      if (!client) {
        set({ error: '当前会话未连接' });
        return false;
      }
      const errors = [];
      let handled = false;
      try {
        handled = await client.respondToPermissionRequest(interruptionId, resolvedToolCallId, decision);
      } catch (error) {
        errors.push(error);
      }
      const extensionToolCallId = resolvedToolCallId || interruptionId;
      if (extensionToolCallId) {
        try {
          await client.request('_codebuddy.ai/resolveInterruption', {
            sessionId,
            toolCallId: extensionToolCallId,
            decision,
          });
          handled = true;
        } catch (error) {
          errors.push(error);
        }
      }
      if (!handled) {
        const error = errors[0] || new Error('权限请求已失效或无法响应');
        if (get().activeThreadId === threadId && get().sessionId === sessionId) set({ error: error.message });
        return false;
      }
      const currentThread = get().threadsById[threadId];
      if (!currentThread || currentThread.sessionId !== sessionId) return true;
      get().applyInterruptionResolution(threadId, interruptionId, decision);
      await get().persistProductState();
      return true;
    });
  },

  applyQuestionResolution(threadId, toolCallId, status, answers = null) {
    const runtime = get().threadRuntimeById[threadId] || emptyThreadRuntime();
    let timelineChanged = false;
    const timeline = runtime.timeline.map((item) => {
      if (item.type !== 'question' || !sessionActionItemMatches(item, toolCallId)) return item;
      timelineChanged = true;
      return {
        ...item,
        status,
        meta: {
          ...(item.meta || {}),
          ...(answers ? { submittedAnswers: answers } : {}),
          [status === 'answered' ? 'answeredAt' : 'cancelledAt']: Date.now(),
        },
      };
    });
    const questions = runtime.questions.filter((item) => !sessionActionItemMatches(item, toolCallId));
    if (!timelineChanged && questions.length === runtime.questions.length) return false;
    get().patchThreadRuntime(threadId, { questions, timeline });
    set((state) => {
      const record = state.threadsById[threadId];
      if (!record) return {};
      const stillWaiting = questions.length > 0 || runtime.permissionRequests.length > 0;
      return {
        threadsById: {
          ...state.threadsById,
          [threadId]: {
            ...record,
            timeline: timeline.slice(-300),
            status: record.status === 'waiting' && !stillWaiting ? 'running' : record.status,
            updatedAt: new Date().toISOString(),
          },
        },
      };
    });
    return true;
  },

  async submitQuestionAnswers(toolCallId, answers) {
    const state = get();
    const projectId = state.activeProjectId;
    const threadId = state.activeThreadId;
    const sessionId = state.sessionId;
    if (!projectId || !threadId || !sessionId || !toolCallId) return false;
    set({ error: null });
    return runUniqueSessionAction(threadId + ':question:' + toolCallId, async () => {
      const thread = get().threadsById[threadId];
      if (!thread || thread.projectId !== projectId || thread.sessionId !== sessionId) return false;
      try {
        const client = get().getThreadClient(threadId);
        if (!client) throw new Error('当前会话未连接');
        const responded = await client.submitQuestionAnswers(toolCallId, answers);
        if (!responded) {
          await client.request('_codebuddy.ai/answerQuestion', { sessionId, toolCallId, answers });
        }
        const currentThread = get().threadsById[threadId];
        if (!currentThread || currentThread.sessionId !== sessionId) return true;
        get().applyQuestionResolution(threadId, toolCallId, 'answered', answers);
        await get().persistProductState();
        return true;
      } catch (error) {
        if (get().activeThreadId === threadId && get().sessionId === sessionId) set({ error: error.message });
        return false;
      }
    });
  },

  async cancelQuestionAnswers(toolCallId) {
    const state = get();
    const projectId = state.activeProjectId;
    const threadId = state.activeThreadId;
    const sessionId = state.sessionId;
    if (!projectId || !threadId || !sessionId || !toolCallId) return false;
    set({ error: null });
    return runUniqueSessionAction(threadId + ':question:' + toolCallId, async () => {
      const thread = get().threadsById[threadId];
      if (!thread || thread.projectId !== projectId || thread.sessionId !== sessionId) return false;
      try {
        const client = get().getThreadClient(threadId);
        if (!client) throw new Error('当前会话未连接');
        const cancelled = await client.cancelQuestionAnswers(toolCallId);
        if (!cancelled) throw new Error('当前问题不支持取消，请提交答案');
        const currentThread = get().threadsById[threadId];
        if (!currentThread || currentThread.sessionId !== sessionId) return true;
        get().applyQuestionResolution(threadId, toolCallId, 'cancelled');
        await get().persistProductState();
        return true;
      } catch (error) {
        if (get().activeThreadId === threadId && get().sessionId === sessionId) set({ error: error.message });
        return false;
      }
    });
  },

  async bootstrap() {
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
        set({ authViewState: 'error', authError: error?.message || '无法检查 CodeBuddy 登录状态', connectionState: 'error' });
      }
      return false;
    }
    if (authRequest !== authRequestVersion || get().activeProjectId !== projectId) return false;
    set({ authViewState: authState, authError: null });
    if (authState === 'login') {
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
      return isCurrent();
    } catch (error) {
      if (authRequest === authRequestVersion && get().activeProjectId === projectId) {
        set({ error: error.message, connectionState: 'error' });
      }
      return false;
    }
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

  async refreshInfo() {
    const request = beginScopedRequest('info', get());
    const payload = await fetchJson('/api/v1/info');
    if (!isScopedRequestCurrent(request, get())) return false;
    set({ info: payload.data || payload, infoLoaded: true });
    return true;
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
      const raw = localStorage.getItem('codebuddy-gui-settings');
      if (raw) {
        const parsed = settingsCacheSnapshot(JSON.parse(raw));
        persistSettingsCache(parsed);
        set({ settings: parsed });
      }
    } catch (_) {}
  },

  updateGuiSetting(key, value) {
    if (!isGuiSettingKey(key)) return false;
    try {
      const next = saveGuiSettings({ ...get().guiSettings, [key]: value });
      set({ guiSettings: next });
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
    const operation = previousWrite.catch(() => {}).then(async () => {
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
      const threadsById = { ...state.threadsById };
      const order = [...(state.threadOrderByProject[projectId] || [])];
      for (const session of sessions) {
        const sessionId = session.id || session.sessionId;
        if (!sessionId) continue;
        let thread = Object.values(threadsById).find((item) => (
          item.projectId === projectId && item.sessionId === sessionId
        ));
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
        sessions,
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

  async uninstallPluginByName(pluginName) {
    const projectId = get().activeProjectId;
    const busyKey = `uninstall:${pluginName}`;
    set({ pluginBusy: busyKey, pluginError: null });
    try {
      await apiUninstallPlugin(pluginName);
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

  async togglePluginByName(pluginName, enabled) {
    const projectId = get().activeProjectId;
    const busyKey = `toggle:${pluginName}`;
    set({ pluginBusy: busyKey, pluginError: null });
    try {
      if (enabled) await apiEnablePlugin(pluginName);
      else await apiDisablePlugin(pluginName);
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
      if (requestId !== fileDiskSyncRequestId || projectId !== get().activeProjectId || path !== get().selectedFile) return false;
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
      if (requestId !== fileDiskSyncRequestId || projectId !== get().activeProjectId || path !== get().selectedFile) return false;
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
      fileDirty: typeof change.content === 'string'
        ? current.filePreview !== change.content
        : Boolean(current.selectedFile),
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
      if (projectId === get().activeProjectId && apiBase === get().apiBase) set({ error: error.message || 'PTY 释放失败' });
      return false;
    }
    if (projectId !== get().activeProjectId || apiBase !== get().apiBase) return true;
    set((current) => ({
      terminalSessions: current.terminalSessions.filter((item) => item.sessionId !== sessionId),
      ptySessionId: current.ptySessionId === sessionId ? null : current.ptySessionId,
    }));
    return true;
  },

  async cancelSession() {
    const state = get();
    const projectId = state.activeProjectId;
    const threadId = state.activeThreadId;
    const sessionId = state.sessionId;
    if (!projectId || !threadId || !sessionId) return false;
    set({ error: null });
    return runUniqueSessionAction(`${threadId}:cancel:${sessionId}`, async () => {
      const thread = get().threadsById[threadId];
      if (!thread || thread.projectId !== projectId || thread.sessionId !== sessionId) return false;
      try {
        const client = get().getThreadClient(threadId);
        if (!client) throw new Error('当前会话未连接');
        await client.request('session/cancel', { sessionId });
        const currentThread = get().threadsById[threadId];
        if (!currentThread || currentThread.sessionId !== sessionId) return true;
        const runtime = get().threadRuntimeById[threadId] || emptyThreadRuntime();
        const timeline = reduceAcpEvent(closeAssistantStream(runtime.timeline), 'status_change', { status: 'cancelled', role: 'system' });
        get().patchThreadRuntime(threadId, { isAwaitingResponse: false, timeline });
        await get().updateThreadRecord(threadId, { status: 'cancelled', timeline: timeline.slice(-300) });
        return true;
      } catch (error) {
        if (get().activeThreadId === threadId && get().sessionId === sessionId) set({ error: error.message });
        return false;
      }
    });
  },

  setThreadPromptQueue(threadId, promptQueue, patch = {}) {
    const serializedQueue = serializePromptQueue(promptQueue);
    set((state) => {
      const thread = state.threadsById[threadId];
      if (!thread) return {};
      return {
        threadsById: {
          ...state.threadsById,
          [threadId]: {
            ...thread,
            ...patch,
            metadata: { ...(thread.metadata || {}), promptQueue: serializedQueue },
            updatedAt: new Date().toISOString(),
          },
        },
      };
    });
  },

  async persistThreadPromptQueue(threadId, promptQueue, patch = {}) {
    if (!get().threadsById[threadId]) return false;
    get().setThreadPromptQueue(threadId, promptQueue, patch);
    return get().persistProductState();
  },

  async sendPrompt(text) {
    const threadId = get().activeThreadId;
    const thread = get().threadsById[threadId];
    const client = get().getThreadClient(threadId);
    if (!thread || !client) {
      set({ error: '当前会话未连接' });
      return false;
    }
    const runtime = get().threadRuntimeById[threadId] || emptyThreadRuntime();
    const attachments = runtime.pendingAttachments || [];
    const draftText = String(text || '');
    const content = String(text || '').trim() || (attachments.length ? '请查看附件。' : '');
    if (!content) return false;
    if (thread.status === 'running' || runtime.isAwaitingResponse || runtime.promptQueue.length > 0) {
      return queuePromptQueueOperation(threadId, async () => {
        const latestThread = get().threadsById[threadId];
        const latestRuntime = get().threadRuntimeById[threadId] || emptyThreadRuntime();
        if (!latestThread) return false;
        const queuedPrompt = {
          id: `prompt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          text: content,
          attachments,
          draftText,
          createdAt: Date.now(),
        };
        const promptQueue = [...latestRuntime.promptQueue, queuedPrompt];
        get().patchThreadRuntime(threadId, { promptQueue, pendingAttachments: [], promptSuggestion: null });
        const persisted = await get().persistThreadPromptQueue(threadId, promptQueue, { draft: '' });
        if (!persisted) {
          get().patchThreadRuntime(threadId, {
            promptQueue: latestRuntime.promptQueue,
            pendingAttachments: attachments,
            promptSuggestion: latestRuntime.promptSuggestion,
          });
          get().setThreadPromptQueue(threadId, latestRuntime.promptQueue, { draft: draftText });
          return false;
        }
        if (latestThread.status !== 'running' && !latestRuntime.isAwaitingResponse) {
          setTimeout(() => get().drainThreadPromptQueue(threadId), 0);
        }
        return { queued: true, id: queuedPrompt.id };
      });
    }
    get().patchThreadRuntime(threadId, { pendingAttachments: [], promptSuggestion: null });
    return get().runThreadPrompt(threadId, content, attachments, draftText);
  },

  async runThreadPrompt(threadId, content, attachments = [], draftText = content) {
    const thread = get().threadsById[threadId];
    const client = get().getThreadClient(threadId);
    if (!thread || !client) {
      const currentRuntime = get().threadRuntimeById[threadId] || emptyThreadRuntime();
      const restoredAttachments = [...attachments, ...(currentRuntime.pendingAttachments || [])].filter((item, index, items) => (
        items.findIndex((candidate) => candidate.path === item.path && candidate.name === item.name && candidate.kind === item.kind) === index
      ));
      get().patchThreadRuntime(threadId, { pendingAttachments: restoredAttachments });
      set({ error: '当前会话未连接' });
      return false;
    }
    const runtime = get().threadRuntimeById[threadId] || emptyThreadRuntime();
    const attachmentLabel = attachments.length ? `\n\n[附件: ${attachments.map((item) => item.name).join(', ')}]` : '';
    const timeline = pushUserMessage(runtime.timeline, `${content}${attachmentLabel}`);
    get().patchThreadRuntime(threadId, {
      timeline,
      isAwaitingResponse: true,
    });
    await get().updateThreadRecord(threadId, { status: 'running', draft: '', unread: false, timeline: timeline.slice(-300) });
    try {
      const prompt = [{ type: 'text', text: content }];
      for (const attachment of attachments) {
        if (attachment.kind === 'image') {
          prompt.push({ type: 'image', data: attachment.data, mimeType: attachment.mimeType });
        } else if (attachment.kind === 'text') {
          const text = String(attachment.text || '');
          const clipped = text.length > 500000 ? `${text.slice(0, 500000)}\n\n[文件内容已截断]` : text;
          prompt.push({ type: 'text', text: `文件: ${attachment.name}\n路径: ${attachment.path}\n\n${clipped}` });
        }
      }
      await client.request('session/prompt', {
        sessionId: thread.sessionId,
        prompt,
      });
      const completedRuntime = get().threadRuntimeById[threadId] || emptyThreadRuntime();
      if (get().threadsById[threadId]?.status === 'cancelled') {
        get().patchThreadRuntime(threadId, {
          timeline: closeAssistantStream(completedRuntime.timeline),
          isAwaitingResponse: false,
        });
        return false;
      }
      get().patchThreadRuntime(threadId, {
        timeline: closeAssistantStream(completedRuntime.timeline),
        isAwaitingResponse: false,
      });
      await get().updateThreadRecord(threadId, {
        status: 'idle',
        unread: get().activeThreadId !== threadId,
      });
      if ((get().threadRuntimeById[threadId]?.promptQueue || []).length > 0) {
        setTimeout(() => get().drainThreadPromptQueue(threadId), 0);
      } else {
        get().notifyThreadResult(threadId, 'success');
      }
      return true;
    } catch (error) {
      const failedRuntime = get().threadRuntimeById[threadId] || emptyThreadRuntime();
      const currentThread = get().threadsById[threadId] || thread;
      const userCancelled = currentThread.status === 'cancelled'
        || /cancelled|canceled|aborted by user|用户取消|已取消/i.test(error.message || '');
      if (userCancelled) {
        get().patchThreadRuntime(threadId, {
          timeline: closeAssistantStream(failedRuntime.timeline),
          isAwaitingResponse: false,
        });
        return false;
      }
      const failedDraft = String(draftText || '').trim();
      const currentDraft = String(currentThread.draft || '').trim();
      const restoredDraft = failedDraft && currentDraft ? `${failedDraft}\n\n${currentDraft}` : failedDraft || currentDraft;
      const restoredAttachments = [...attachments, ...(failedRuntime.pendingAttachments || [])].filter((item, index, items) => (
        items.findIndex((candidate) => candidate.path === item.path && candidate.name === item.name && candidate.kind === item.kind) === index
      ));

      get().patchThreadRuntime(threadId, {
        timeline: closeAssistantStream(reduceAcpEvent(failedRuntime.timeline, 'error', { message: error.message, type: 'error' })),
        isAwaitingResponse: false,
        pendingAttachments: restoredAttachments,
      });
      await get().updateThreadRecord(threadId, {
        status: 'error',
        unread: get().activeThreadId !== threadId,
        draft: restoredDraft,
        metadata: { ...(currentThread.metadata || {}), lastError: error.message },
      });
      get().notifyThreadResult(threadId, 'error');
      return false;
    }
  },

  async drainThreadPromptQueue(threadId) {
    const prepared = await queuePromptQueueOperation(threadId, async () => {
      const thread = get().threadsById[threadId];
      const client = get().getThreadClient(threadId);
      const runtime = get().threadRuntimeById[threadId] || emptyThreadRuntime();
      const [next, ...rest] = runtime.promptQueue;
      if (!thread || !client || !next) return null;
      if (thread.status === 'running' || runtime.isAwaitingResponse) return null;

      let attachments = Array.isArray(next.attachments) ? next.attachments : [];
      const requiresReload = attachments.some((attachment) => (
        (attachment.kind === 'image' && !attachment.data)
        || (attachment.kind === 'text' && typeof attachment.text !== 'string')
      ));
      if (requiresReload) {
        if (!window.electronAPI?.readAttachments) {
          set({ error: '无法恢复待发送附件：桌面文件读取接口不可用' });
          return null;
        }
        const loaded = await window.electronAPI.readAttachments(attachments.map((attachment) => attachment.path));
        const currentThread = get().threadsById[threadId];
        if (!currentThread || currentThread.sessionId !== thread.sessionId) return null;
        const rejected = (loaded || []).filter((attachment) => attachment.kind === 'unsupported');
        if (rejected.length) {
          set({ error: `无法恢复待发送附件：${rejected.map((attachment) => `${attachment.name}: ${attachment.error}`).join('；')}` });
          return null;
        }
        const loadedByPath = new Map((loaded || []).map((attachment) => [attachment.path, attachment]));
        attachments = attachments.map((attachment) => loadedByPath.get(attachment.path)).filter(Boolean);
        if (attachments.length !== next.attachments.length) {
          set({ error: '无法恢复全部待发送附件，请确认文件仍在原位置' });
          return null;
        }
        const imageSupported = Boolean(
          runtime.capabilities?.promptCapabilities?.image
          || runtime.capabilities?.prompt_capabilities?.image,
        );
        if (!imageSupported && attachments.some((attachment) => attachment.kind === 'image')) {
          set({ error: '当前运行时未声明图片输入能力，无法继续发送队列中的图片' });
          return null;
        }
      }

      get().patchThreadRuntime(threadId, { promptQueue: rest });
      const persisted = await get().persistThreadPromptQueue(threadId, rest);
      if (!persisted) {
        get().patchThreadRuntime(threadId, { promptQueue: runtime.promptQueue });
        get().setThreadPromptQueue(threadId, runtime.promptQueue);
        return null;
      }
      return { next, attachments };
    });
    if (!prepared) return false;
    return get().runThreadPrompt(threadId, prepared.next.text, prepared.attachments, prepared.next.draftText ?? prepared.next.text);
  },

  async moveQueuedPrompt(threadId, promptId, direction) {
    if (!threadId || !promptId || !['up', 'down'].includes(direction)) return false;
    return queuePromptQueueOperation(threadId, async () => {
      const runtime = get().threadRuntimeById[threadId] || emptyThreadRuntime();
      const index = runtime.promptQueue.findIndex((item) => item.id === promptId);
      if (index < 0) return false;
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= runtime.promptQueue.length) return true;
      const promptQueue = [...runtime.promptQueue];
      [promptQueue[index], promptQueue[targetIndex]] = [promptQueue[targetIndex], promptQueue[index]];
      get().patchThreadRuntime(threadId, { promptQueue });
      const persisted = await get().persistThreadPromptQueue(threadId, promptQueue);
      if (!persisted) {
        get().patchThreadRuntime(threadId, { promptQueue: runtime.promptQueue });
        get().setThreadPromptQueue(threadId, runtime.promptQueue);
      }
      return persisted;
    });
  },

  async removeQueuedPrompt(threadId, promptId) {
    return queuePromptQueueOperation(threadId, async () => {
      const runtime = get().threadRuntimeById[threadId] || emptyThreadRuntime();
      const promptQueue = runtime.promptQueue.filter((item) => item.id !== promptId);
      if (promptQueue.length === runtime.promptQueue.length) return true;
      get().patchThreadRuntime(threadId, { promptQueue });
      const persisted = await get().persistThreadPromptQueue(threadId, promptQueue);
      if (!persisted) {
        get().patchThreadRuntime(threadId, { promptQueue: runtime.promptQueue });
        get().setThreadPromptQueue(threadId, runtime.promptQueue);
      }
      return persisted;
    });
  },

  // ===== 鉴权 action（对照源 viewState/login/logout）=====
  async login(password) {
    if (get().authSubmitting) return false;
    const authRequest = ++authRequestVersion;
    const projectId = get().activeProjectId;
    const apiBase = getApiBase();
    const isCurrent = () => (
      authRequest === authRequestVersion
      && get().activeProjectId === projectId
      && getApiBase() === apiBase
    );
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
        get().bootstrap().catch((error) => console.error('bootstrap after login failed:', error));
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
    set({ authViewState: 'login', authSubmitting: false, authError: null, sessionId: null, sessionToken: null, timeline: [] });
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
      if (
        authRequest === authRequestVersion
        && get().activeProjectId === projectId
        && getApiBase() === apiBase
      ) {
        set({ authViewState: 'error', authError: error?.message || '无法检查 CodeBuddy 登录状态' });
      }
      return false;
    }
    if (
      authRequest !== authRequestVersion
      || get().activeProjectId !== projectId
      || getApiBase() !== apiBase
    ) return false;
    set({ authViewState: authState, authError: null });
    if (authState === 'authenticated') {
      get().bootstrap().catch((error) => console.error('bootstrap after refreshAuth failed:', error));
    }
    return true;
  },

}));

if (typeof window !== "undefined" && import.meta.env.DEV) {
  window.__sendPrompt = (text) => useStore.getState().sendPrompt(text);
  window.__ZUSTAND_STORE = useStore;
}
export { conversations };
