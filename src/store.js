import { create } from 'zustand';
import { AcpClient, getApiBase, setApiBase, fetchJson, requestCodeBuddy, setAcpSessionToken, checkAuth as apiCheckAuth, authLogin as apiAuthLogin, authLogout as apiAuthLogout, setAuthToken } from './lib/acp';
import { parseHashRoute, setHashRoute } from './lib/routes';
import { fsList, fsSearchContent, fsSearchFiles, createWatcher, pollWatcher, removeWatcher, downloadFile, fsMkdir, fsMove, fsRemove, fsWrite } from './lib/fs';
import { commit, getLog, getLogDetailed, stash, stashPop, stashList, getUnstagedDiff, getStagedDiff, getRemoteUrl, fetch as gitFetch } from './lib/git';
import { fetchSessionStats, fetchStats as fetchStatsApi, fetchScheduledTasks, createScheduledTask, fetchTraceList, fetchWorkerLogs as fetchWorkerLogsApi, updateSetting as updateSettingApi, updateSettingByKey as updateSettingByKeyApi, deleteSession as apiDeleteSession, renameSession as apiRenameSession, fetchTaskTemplates as apiFetchTaskTemplates, refreshTaskTemplates as apiRefreshTaskTemplates, uninstallPlugin as apiUninstallPlugin, enablePlugin as apiEnablePlugin, disablePlugin as apiDisablePlugin, installPlugin as apiInstallPlugin, addMarketplace as apiAddMarketplace, removeMarketplace as apiRemoveMarketplace, fetchMarketplaces as apiFetchMarketplaces } from './lib/ops';
import {
  closeAssistantStream,
  pushUserMessage,
  reduceAcpEvent,
  resetSeenContent,
} from './lib/timeline';

const acp = new AcpClient();

function normalizeSessions(payload) {
  const data = payload?.data ?? payload ?? {};
  return Array.isArray(data.sessions) ? data.sessions : [];
}

function normalizeWorkers(payload) {
  const data = payload?.data ?? payload ?? [];
  return Array.isArray(data) ? data : [];
}

function normalizePlugins(payload) {
  const data = payload?.data ?? payload ?? [];
  return Array.isArray(data) ? data : [];
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

export const useStore = create((set, get) => ({
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
  info: null,
  settings: null,
  infoLoaded: false,
  settingsLoaded: false,
  sessionTitle: null,
  usage: null,
  availableCommands: [],
  sessions: [],
  workers: [],
  plugins: [],
  marketplaces: [],
  pluginError: null,
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
  stats: null,        // 全局 stats（对照源 GET /api/v1/stats）
  sessionStats: null, // 当前会话 stats（对照源 GET /api/v1/stats/session?sessionId=）
  statsError: null,
  statsLoading: false,
  scheduledTasks: [],
  taskTemplates: [],
  taskTemplatesError: null,
  taskTemplatesLoading: false,
  error: null,
  promptSuggestion: null,
  permissionRequests: [],
  questions: [],
  teamState: null,
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
  filePreviewLoading: false,

  setRoute(route) {
    setHashRoute(route);
    set({ route });
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
  },

  setFileSearchQuery(value) {
    set({ fileSearchQuery: value });
  },

  setFilePreview(value) {
    set({ filePreview: value });
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
      return;
    }

    if (su === 'session_info_update') {
      set({ sessionTitle: update.title || get().sessionTitle });
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

  async changeSession(sessionId) {
    resetSeenContent();
    try {
      set({
        sessionId,
        timeline: [],
        permissionRequests: [],
        questions: [],
        sessionTitle: null,
        usage: null,
        availableCommands: [],
      });
      // cwd 用当前 workspacePath（切工作区后 load 旧会话仍带它，CLI 会尊重 load 的 cwd 用于工具调用）
      const { init, loaded } = await acp.initializeSession(sessionId, get().workspacePath || '.');
      const availableModels = loaded?.models?.availableModels
        || init?.models?.availableModels
        || init?.agentCapabilities?.availableModels
        || get().models;
      const currentModel = loaded?.models?.currentModelId
        || init?.models?.currentModelId
        || get().currentModel;
      const availableModes = loaded?.modes?.availableModes
        || init?.modes?.availableModes
        || get().modes;
      const currentMode = loaded?.modes?.currentModeId
        || init?.modes?.currentModeId
        || get().currentMode;
      const models = normalizeModels(availableModels);
      const modes = normalizeModes(availableModes);
      set({
        sessionId: loaded?.sessionId || sessionId,
        currentModel,
        models,
        modes,
        currentMode,
      });
      await Promise.all([get().refreshStats(), get().refreshTasks()]);
    } catch (error) {
      set({ error: error.message });
    }
  },

  async setModel(modelId) {
    try {
      await acp.request('session/set_model', {
        sessionId: get().sessionId,
        modelId,
      });
      set({ currentModel: modelId });
    } catch (error) {
      set({ error: error.message });
    }
  },

  async setMode(modeId) {
    try {
      await acp.request('session/set_mode', {
        sessionId: get().sessionId,
        modeId,
      });
      set({ currentMode: modeId });
    } catch (error) {
      set({ error: error.message });
    }
  },

  async newSession() {
    return get().changeSession(null);
  },

  // 切工作区：经 IPC 弹目录选择框 → set workspacePath + 持久化 → 用新 cwd 起新会话 + 重定向文件树根
  // cwd 一次性注入到 session/new，agent 工具调用就以此目录为工作根；不动后端进程
  // ⚠ 注意：CLI 协议 cwd 只在 session/new|load 一次性注入，运行中改不了 cwd。
  //   所以切工作区 = 起新会话（旧 sessionId + timeline 丢），UI 要明告知用户。
  async chooseWorkspace() {
    if (!window.electronAPI?.chooseWorkspace) {
      set({ error: '工作区选择不可用（IPC 缺失）' });
      return;
    }
    // 当前会话有对话历史时，弹确认（避免用户误切丢对话）
    const hasHistory = get().timeline.some(it => it.type === 'message' || it.type === 'assistant');
    if (hasHistory && !window.confirm('切换工作区将开启新会话，当前对话历史不会被保留。是否继续？')) {
      return;
    }
    let path = null;
    try {
      path = await window.electronAPI.chooseWorkspace();
    } catch (err) {
      set({ error: '工作区选择失败: ' + err.message });
      return;
    }
    if (!path) return; // 用户取消
    await get().setWorkspace(path);
  },

  async setWorkspace(path) {
    if (!path || path === get().workspacePath) return;
    try { localStorage.setItem('codebuddy-gui-workspace', path); } catch (_) {}
    set({ workspacePath: path, fileCwd: path });
    // 用新 cwd 起新会话（不走 changeSession(sessionId) 路径，要带 cwd 起新）
    try {
      set({
        sessionId: null,
        timeline: [],
        permissionRequests: [],
        questions: [],
        sessionTitle: null,
        usage: null,
        availableCommands: [],
      });
      const { init, loaded } = await acp.initializeSession(null, path);
      const availableModels = loaded?.models?.availableModels
        || init?.models?.availableModels
        || init?.agentCapabilities?.availableModels
        || get().models;
      const currentModel = loaded?.models?.currentModelId
        || init?.models?.currentModelId
        || get().currentModel;
      const availableModes = loaded?.modes?.availableModes
        || init?.modes?.availableModes
        || get().modes;
      const currentMode = loaded?.modes?.currentModeId
        || init?.modes?.currentModeId
        || get().currentMode;
      set({
        sessionId: loaded?.sessionId || null,
        currentModel,
        models: normalizeModels(availableModels),
        modes: normalizeModes(availableModes),
        currentMode,
        connectionState: 'connected',
        error: null,
      });
      // 文件树根切到新工作区
      await get().openDirectory(path);
      await Promise.allSettled([get().refreshStats(), get().refreshTasks(), get().refreshSessions()]);
    } catch (error) {
      set({ error: error.message, connectionState: 'error' });
    }
  },

  async initializeWorkspace() {
    // 启动时若已有持久化的 workspacePath，用它；否则文件树根兜底 '.'
    const persisted = (function () { try { return localStorage.getItem('codebuddy-gui-workspace'); } catch (_) { return null; } })();
    if (persisted && !get().workspacePath) {
      set({ workspacePath: persisted });
    }
    await get().openDirectory(get().workspacePath || '.');
  },

  async openDirectory(path) {
    set({ fileLoading: true, fileCwd: path, selectedFile: null, filePreview: '', filePreviewLoading: false });
    try {
      const entries = await fsList(path, 1);
      set({ fileEntries: entries, fileLoading: false });
    } catch (error) {
      set({ fileEntries: [], fileLoading: false, error: error.message });
    }
  },

  async openFile(path) {
    set({ selectedFile: path, filePreviewLoading: true, filePreview: '' });
    try {
      const content = await downloadFile(path);
      set({ filePreview: content, filePreviewLoading: false });
    } catch (error) {
      set({ filePreview: `读取失败: ${error.message}`, filePreviewLoading: false, error: error.message });
    }
  },

  setSelectedFile(file) {
    set({ selectedFile: file, filePreviewLoading: !!file, filePreview: '' });
  },

  async runFileSearch() {
    const query = get().fileSearchQuery.trim();
    if (!query) return;
    set({ fileSearching: true });
    try {
      const results = await fsSearchContent({ query, cwd: get().fileCwd || '.' });
      set({ fileSearchResults: results, fileSearching: false });
    } catch (error) {
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
    set({ fileNameSearching: true });
    try {
      const items = await fsSearchFiles(query, { limit: 15 });
      set({ fileNameResults: items, fileNameSearching: false });
    } catch (error) {
      set({ fileNameResults: [], fileNameSearching: false, error: error.message });
    }
  },

  async startWatcher(path = null) {
    const target = path || get().fileCwd || '.';
    try {
      const data = await createWatcher(target, true);
      const watcherId = data.watcherId || data.id || null;
      set({ watcherId });
      return watcherId;
    } catch (error) {
      set({ error: error.message });
      return null;
    }
  },

  async pollWatcher() {
    const watcherId = get().watcherId;
    if (!watcherId) return [];
    try {
      return await pollWatcher(watcherId);
    } catch (error) {
      set({ error: error.message });
      return [];
    }
  },

  async stopWatcher() {
    const watcherId = get().watcherId;
    if (!watcherId) return;
    try {
      await removeWatcher(watcherId);
    } catch (_) {}
    set({ watcherId: null });
  },

  initializeTerminal() {
    const panes = get().terminalPanes;
    if (!panes.length) {
      const pane = makePane();
      set({ terminalPanes: [pane], activePaneId: pane.id });
      return;
    }
    if (!get().activePaneId) {
      set({ activePaneId: panes[0].id });
    }
  },

  splitPane(paneId, direction) {
    set((state) => {
      const next = makePane(direction === 'right' ? 'Terminal Split Right' : 'Terminal Split Down');
      return {
        terminalPanes: [...state.terminalPanes, next],
        activePaneId: next.id,
      };
    });
  },

  closePane(paneId) {
    set((state) => {
      if (state.terminalPanes.length === 1) return state;
      const nextPanes = state.terminalPanes.filter((x) => x.id !== paneId);
      return {
        terminalPanes: nextPanes,
        activePaneId: state.activePaneId === paneId ? nextPanes[0]?.id || null : state.activePaneId,
      };
    });
  },

  bindPtyToPane(paneId, sessionId) {
    set((state) => ({
      terminalPanes: state.terminalPanes.map((pane) => pane.id === paneId ? { ...pane, sessionId } : pane),
      ptySessionId: sessionId,
    }));
  },

  setPaneStatus(paneId, status) {
    set((state) => ({
      terminalPanes: state.terminalPanes.map((pane) => pane.id === paneId ? { ...pane, status } : pane),
    }));
  },

  setPaneSession(paneId, sessionId) {
    set((state) => ({
      terminalPanes: state.terminalPanes.map((pane) => pane.id === paneId ? { ...pane, sessionId } : pane),
    }));
  },

  appendPaneOutput(paneId, chunk) {
    set((state) => ({
      terminalPanes: state.terminalPanes.map((pane) => pane.id === paneId ? { ...pane, output: pane.output + chunk } : pane),
    }));
  },

  appendTimelineEvent(eventType, payload) {
    // 收到 agent 真内容/工具事件时清"等响应"态（UI 态已转 streaming，不再需占位）
    const su = payload?.sessionUpdate || eventType;
    if (su === 'agent_message_chunk' || su === 'agent_thought_chunk' ||
        su === 'tool_call' || su === 'tool_call_update' ||
        eventType === 'message' || eventType === 'thinking') {
      set({ isAwaitingResponse: false });
    }
    set((state) => ({ timeline: reduceAcpEvent(state.timeline, eventType, payload) }));
  },

  closeAssistantStream() {
    set((state) => ({ timeline: closeAssistantStream(state.timeline) }));
  },

  async respondToInterruption(interruptionId, decision = 'allow') {
    try {
      await acp.request('_codebuddy.ai/resolveInterruption', {
        sessionId: get().sessionId,
        toolCallId: interruptionId,
        decision,
      });
      set((state) => ({
        permissionRequests: state.permissionRequests.filter((x) => x.interruptionId !== interruptionId),
      }));
    } catch (error) {
      set({ error: error.message });
    }
  },

  async submitQuestionAnswers(toolCallId, answers) {
    try {
      await acp.request('_codebuddy.ai/answerQuestion', {
        sessionId: get().sessionId,
        toolCallId,
        answers,
      });
      set((state) => ({
        questions: state.questions.filter((x) => x.toolCallId !== toolCallId),
      }));
      get().appendTimelineEvent('question_answered', { toolCallId, answers });
    } catch (error) {
      set({ error: error.message });
      get().appendTimelineEvent('error', { message: error.message, type: 'error', source: '_codebuddy.ai/answerQuestion' });
    }
  },

  async bootstrap() {
    window.addEventListener('hashchange', () => {
      set({ route: parseHashRoute() });
    });

    // 1. 从 Electron 主进程获取 CodeBuddy 端口和密码（带降级）
    let cbPassword = null;
    try {
      if (window.electronAPI?.getCodeBuddyPort) {
        const result = await window.electronAPI.getCodeBuddyPort();
        const port = result?.port || result;
        const base = `http://127.0.0.1:${port}`;
        setApiBase(base);
        set({ apiBase: base });
        cbPassword = result?.password || null;
        if (cbPassword) {
          // 通过密码 URL 获取认证 cookie
          try {
            await requestCodeBuddy(`/?password=${encodeURIComponent(cbPassword)}`, {
              headers: { 'X-CodeBuddy-Request': '1' },
              credentials: 'include',
            });
          } catch (_) { /* cookie 认证失败不阻塞 */ }
        }
      }
    } catch (err) {
      console.warn('Failed to get CodeBuddy port, using default:', err.message);
    }

    // 2. 从 localStorage 恢复设置（主题等需要尽早生效）
    get().loadSettingsFromStorage();

    // 2.5. 鉴权态：对照源在连接前先 checkAuth，决定 viewState ∈ login|authenticated
    //      若后端启用鉴权且当前未通过，App.jsx 渲染登录页；通过后才连 AcpClient
    const authState = await apiCheckAuth();
    set({ authViewState: authState });
    if (authState === 'login') {
      // 等登录成功后再继续；App 登录页会调 store.login() 并重触发 bootstrap
      return;
    }

    acp.on('connected', () => {
      set({ connectionState: 'connected', sessionToken: acp.sessionToken, error: null });
      setAcpSessionToken(acp.sessionToken);
    });

    acp.on('reconnecting', () => {
      set({ connectionState: 'reconnecting' });
    });

    acp.on('reconnected', () => {
      set({ connectionState: 'connected', error: null });
      setAcpSessionToken(acp.sessionToken);
    });

    acp.on('reconnect_failed', () => {
      set({ connectionState: 'error', error: '连接断开，重连失败' });
    });

    acp.on('initialized', (detail) => {
      const capabilities = detail?.agentCapabilities || {};
      get().appendTimelineEvent('initialized', capabilities);
    });

    acp.on('session/update', (event) => {
      get().handleSessionUpdate((event.detail || {}).update || {});
    });

    acp.on('message', (event) => {
      get().appendTimelineEvent('message', event.detail);
    });

    acp.on('thinking', (event) => {
      get().appendTimelineEvent('thinking', event.detail);
    });

    acp.on('model_update', (event) => {
      const detail = event.detail || {};
      set({ models: normalizeModels(detail.availableModels || get().models), currentModel: detail.currentModelId || get().currentModel });
      get().appendTimelineEvent('model_update', detail);
    });

    acp.on('mode_update', (event) => {
      const detail = event.detail || {};
      set({ modes: normalizeModes(detail.availableModes || get().modes), currentMode: detail.currentModeId || get().currentMode });
      get().appendTimelineEvent('mode_update', detail);
    });

    acp.on('current_mode_update', (event) => {
      const detail = event.detail || {};
      set({ currentMode: detail.currentModeId || get().currentMode });
      get().appendTimelineEvent('current_mode_update', detail);
    });

    acp.on('status_change', (event) => {
      get().appendTimelineEvent('status_change', event.detail);
    });

    acp.on('promptSuggestion', (event) => {
      set({ promptSuggestion: event.detail });
    });

    acp.on('teamUpdate', (event) => {
      set({ teamState: event.detail });
      get().appendTimelineEvent('teamUpdate', event.detail);
    });

    acp.on('_codebuddy.ai/artifact', (event) => {
      get().appendTimelineEvent('artifact', event.detail);
    });

    acp.on('checkpoint', (event) => {
      get().appendTimelineEvent('checkpoint', event.detail);
    });

    try {
      const querySessionId = new URLSearchParams(window.location.search).get('sessionId');
      set({
        timeline: [],
        permissionRequests: [],
        questions: [],
        sessionTitle: null,
        usage: null,
        availableCommands: [],
      });
      const { init, loaded } = await acp.initializeSession(querySessionId || null);
      // 模型列表可能在 init（initialize 响应）或 loaded（session/new|load 响应）中
      const availableModels = loaded?.models?.availableModels
        || init?.models?.availableModels
        || init?.agentCapabilities?.availableModels
        || [];
      const currentModel = loaded?.models?.currentModelId
        || init?.models?.currentModelId
        || null;
      const availableModes = loaded?.modes?.availableModes
        || init?.modes?.availableModes
        || [];
      const currentMode = loaded?.modes?.currentModeId
        || init?.modes?.currentModeId
        || 'default';
      const models = normalizeModels(availableModels);
      const modes = normalizeModes(availableModes);
      set({ sessionId: loaded?.sessionId || querySessionId || null, currentModel, models, modes, currentMode, connectionState: 'connected', error: null });
      // 非关键数据加载 - 任一个失败不影响会话状态
      await Promise.allSettled([
        get().refreshInfo(),
        get().refreshSettings(),
        get().refreshSessions(),
        get().refreshWorkers(),
        get().refreshPlugins(),
        get().refreshMetrics(),
        get().refreshStats(),
        get().refreshTasks(),
        get().refreshTraces(),
      ]);
    } catch (error) {
      set({ error: error.message, connectionState: 'error' });
    }
  },

  async refreshInfo() {
    const payload = await fetchJson('/api/v1/info');
    set({ info: payload.data || payload, infoLoaded: true });
  },

  async refreshSettings() {
    const payload = await fetchJson('/api/v1/settings');
    const loaded = payload.data || payload;
    try { localStorage.setItem('codebuddy-gui-settings', JSON.stringify(loaded)); } catch (_) {}
    set({ settings: loaded, settingsLoaded: true });
  },

  loadSettingsFromStorage() {
    try {
      const raw = localStorage.getItem('codebuddy-gui-settings');
      if (raw) {
        const parsed = JSON.parse(raw);
        set({ settings: parsed });
      }
    } catch (_) {}
  },

  // 改为异步：前端即时更新 + 后端单项回写（对照源 PUT /settings/{key}?scope=user）
  // 保留同步行为签名，但调方都 await 才能拿到后端结果；非 await 调用仍只更新前端
  async updateSetting(key, value) {
    // 1. 前端即时更新 + localStorage 持久化（保持原同步语义）
    set((state) => {
      const next = { ...(state.settings || {}), [key]: value };
      try { localStorage.setItem('codebuddy-gui-settings', JSON.stringify(next)); } catch (_) {}
      return { settings: next, settingsLoaded: true };
    });
    // 2. 后端单项回写（对照源真实路径，失败不阻塞前端已更新态）
    try {
      await updateSettingByKeyApi(key, value, 'user');
    } catch (err) {
      // 兜底：单项路径失败时退回整体 PUT /settings（旧路径），避免后端无单项端点时静默丢写
      try { await updateSettingApi(key, value); } catch (_) {}
    }
  },

  async refreshSessions() {
    const payload = await fetchJson('/api/v1/sessions');
    set({ sessions: normalizeSessions(payload) });
  },

  async refreshWorkers() {
    const payload = await fetchJson('/api/v1/workers');
    set({ workers: normalizeWorkers(payload) });
  },

  async refreshPlugins() {
    const payload = await fetchJson('/api/v1/plugins');
    set({ plugins: normalizePlugins(payload) });
  },

  async refreshMarketplaces() {
    try {
      const list = await apiFetchMarketplaces();
      set({ marketplaces: Array.isArray(list) ? list : [] });
    } catch (_) {
      set({ marketplaces: [] });
    }
  },

  async installPluginByName(pluginId, marketplace) {
    set({ pluginBusy: `install:${pluginId}`, pluginError: null });
    try {
      await apiInstallPlugin(pluginId, marketplace);
      await get().refreshPlugins();
      set({ pluginBusy: null });
      return true;
    } catch (err) {
      set({ pluginBusy: null, pluginError: err?.message || '安装插件失败' });
      return false;
    }
  },

  async uninstallPluginByName(pluginName) {
    set({ pluginBusy: `uninstall:${pluginName}`, pluginError: null });
    try {
      await apiUninstallPlugin(pluginName);
      await get().refreshPlugins();
      set({ pluginBusy: null });
      return true;
    } catch (err) {
      set({ pluginBusy: null, pluginError: err?.message || '卸载插件失败' });
      return false;
    }
  },

  async togglePluginByName(pluginName, enabled) {
    set({ pluginBusy: `toggle:${pluginName}`, pluginError: null });
    try {
      if (enabled) await apiEnablePlugin(pluginName);
      else await apiDisablePlugin(pluginName);
      await get().refreshPlugins();
      set({ pluginBusy: null });
      return true;
    } catch (err) {
      set({ pluginBusy: null, pluginError: err?.message || (enabled ? '启用插件失败' : '禁用插件失败') });
      return false;
    }
  },

  async addMarketplaceById(id, config) {
    set({ pluginBusy: `addMkt:${id}`, pluginError: null });
    try {
      await apiAddMarketplace(id, config || {});
      await get().refreshMarketplaces();
      set({ pluginBusy: null });
      return true;
    } catch (err) {
      set({ pluginBusy: null, pluginError: err?.message || '新增市场失败' });
      return false;
    }
  },

  async removeMarketplaceById(id) {
    set({ pluginBusy: `rmMkt:${id}`, pluginError: null });
    try {
      await apiRemoveMarketplace(id);
      await get().refreshMarketplaces();
      set({ pluginBusy: null });
      return true;
    } catch (err) {
      set({ pluginBusy: null, pluginError: err?.message || '删除市场失败' });
      return false;
    }
  },

  async refreshMetrics() {
    try {
      const payload = await fetchJson('/api/v1/metrics');
      set({ metrics: payload.data || payload });
    } catch (_) {
      set({ metrics: null });
    }
  },

  async refreshStats() {
    set({ statsLoading: true, statsError: null });
    try {
      const stats = await fetchStatsApi();
      set({ stats, statsLoading: false });
    } catch (err) {
      set({ stats: null, statsLoading: false, statsError: err?.message || '加载全局统计失败' });
    }
    // 同时刷新当前会话的会话级统计（失败不阻塞全局）
    get().refreshSessionStats?.();
  },

  async refreshSessionStats() {
    try {
      const sessionStats = await fetchSessionStats(get().sessionId);
      set({ sessionStats });
    } catch (_) {
      set({ sessionStats: null });
    }
  },

  async refreshTasks() {
    try {
      const tasks = await fetchScheduledTasks(get().sessionId);
      set({ scheduledTasks: tasks });
    } catch (_) {
      set({ scheduledTasks: [] });
    }
    // 同时刷任务模板（失败不阻塞定时任务）
    get().refreshTaskTemplates?.();
  },

  async refreshTaskTemplates() {
    set({ taskTemplatesLoading: true, taskTemplatesError: null });
    try {
      const result = await apiFetchTaskTemplates(get().sessionId);
      set({
        taskTemplates: result.templates || [],
        taskTemplatesError: result.error || null,
        taskTemplatesLoading: false,
      });
    } catch (err) {
      set({ taskTemplates: [], taskTemplatesLoading: false, taskTemplatesError: err?.message || '加载任务模板失败' });
    }
  },

  async refreshTaskTemplatesNow() {
    set({ taskTemplatesLoading: true, taskTemplatesError: null });
    try {
      const result = await apiRefreshTaskTemplates(get().sessionId);
      set({
        taskTemplates: result.templates || [],
        taskTemplatesError: result.error || null,
        taskTemplatesLoading: false,
      });
      return true;
    } catch (err) {
      set({ taskTemplatesLoading: false, taskTemplatesError: err?.message || '刷新任务模板失败' });
      return false;
    }
  },

  async createTask(cron, prompt) {
    try {
      await createScheduledTask(get().sessionId, cron, prompt);
      await get().refreshTasks();
    } catch (error) {
      set({ error: error.message });
    }
  },

  async refreshTraces() {
    try {
      const traces = await fetchTraceList();
      set({ traces });
    } catch (_) {
      set({ traces: [] });
    }
  },

  async loadWorkerLogs(workerPid, type = 'stdout', tail = 200) {
    try {
      return await fetchWorkerLogsApi(workerPid, type, tail);
    } catch (error) {
      set({ error: error.message });
      return '';
    }
  },

  async fsMkdir(path) {
    try {
      await fsMkdir(path);
      await get().refreshFileEntries();
    } catch (error) {
      set({ error: error.message });
    }
  },

  async fsMove(source, destination) {
    try {
      await fsMove(source, destination);
      await get().refreshFileEntries();
    } catch (error) {
      set({ error: error.message });
    }
  },

  async fsRemove(path) {
    try {
      await fsRemove(path);
      await get().refreshFileEntries();
    } catch (error) {
      set({ error: error.message });
    }
  },

  async fsWrite(path, content) {
    try {
      await fsWrite(path, content);
      await get().refreshFileEntries();
    } catch (error) {
      set({ error: error.message });
    }
  },

  async refreshFileEntries() {
    const cwd = get().fileCwd;
    try {
      const entries = await fsList(cwd, 1);
      set({ fileEntries: entries, fileLoading: false });
    } catch (error) {
      set({ fileEntries: [], fileLoading: false, error: error.message });
    }
  },

  async syncSettingToBackend(key, value) {
    try {
      await updateSetting(key, value);
    } catch (_) {
      // 后端同步失败不影响前端状态，静默忽略
    }
  },

  async createPty(cols = 120, rows = 32) {
    try {
      const payload = await fetchJson('/api/v1/pty', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cols, rows }),
      });
      const data = payload.data || payload;
      set((state) => ({
        ptySessionId: data.sessionId,
        terminalSessions: [...state.terminalSessions.filter((x) => x.sessionId !== data.sessionId), data],
      }));
      return data;
    } catch (error) {
      set({ error: error.message });
      return null;
    }
  },

  async releasePty(sessionId) {
    if (!sessionId) return;
    try {
      await fetchJson(`/api/v1/pty/${encodeURIComponent(sessionId)}`, { method: 'DELETE' });
    } catch (_) {}
    set((state) => ({
      terminalSessions: state.terminalSessions.filter((x) => x.sessionId !== sessionId),
      ptySessionId: state.ptySessionId === sessionId ? null : state.ptySessionId,
    }));
  },

  async cancelSession() {
    try {
      await acp.request('session/cancel', {
        sessionId: get().sessionId,
      });
      set({ isAwaitingResponse: false });
      get().closeAssistantStream();
      get().appendTimelineEvent('status_change', { status: 'cancelled', role: 'system' });
    } catch (error) {
      set({ error: error.message });
    }
  },

  async sendPrompt(text) {
    const content = String(text || '').trim();
    if (!content) return;
    set((state) => ({ timeline: pushUserMessage(state.timeline, content), isAwaitingResponse: true }));
    try {
      await acp.request('session/prompt', {
        sessionId: get().sessionId,
        prompt: [{ type: 'text', text: content }],
      });
    } catch (error) {
      set({ isAwaitingResponse: false });
      get().appendTimelineEvent('error', { message: error.message, type: 'error' });
      get().closeAssistantStream();
    }
  },

  // ===== 会话删除/重命名（对照源 DELETE /sessions/{id} + POST /sessions/{id}/rename）=====
  async deleteSession(sessionId) {
    if (!sessionId) return;
    try {
      await apiDeleteSession(sessionId);
      // 本地即时剔除，避免等 refreshSessions 往返
      set((state) => ({ sessions: state.sessions.filter((s) => (s.id || s.sessionId) !== sessionId) }));
      // 若删的是当前会话，起新会话顶替
      if (get().sessionId === sessionId) {
        set({ sessionId: null, sessionTitle: null, timeline: [], permissionRequests: [], questions: [], usage: null });
        get().newSession();
      }
      return true;
    } catch (err) {
      get().appendTimelineEvent('error', { message: err.message || '删除会话失败', type: 'error' });
      return false;
    }
  },

  async renameSession(sessionId, name) {
    if (!sessionId) return false;
    try {
      await apiRenameSession(sessionId, name);
      // 本地即时更新显示名
      set((state) => ({
        sessions: state.sessions.map((s) => {
          if ((s.id || s.sessionId) === sessionId) return { ...s, name: String(name || '').trim() };
          return s;
        }),
        sessionTitle: get().sessionId === sessionId ? String(name || '').trim() : state.sessionTitle,
      }));
      return true;
    } catch (err) {
      get().appendTimelineEvent('error', { message: err.message || '重命名会话失败', type: 'error' });
      return false;
    }
  },

  // ===== 鉴权 action（对照源 viewState/login/logout）=====
  async login(password) {
    set({ authSubmitting: true, authError: null });
    try {
      const result = await apiAuthLogin(String(password || ''));
      if (result?.success) {
        set({ authViewState: 'authenticated', authSubmitting: false, authError: null });
        // 重触发 bootstrap 继续 AcpClient 连接与非关键数据加载
        get().bootstrap().catch((e) => console.error('bootstrap after login failed:', e));
        return true;
      }
      set({ authSubmitting: false, authError: result?.error || 'login.error.incorrect' });
      return false;
    } catch (err) {
      set({ authSubmitting: false, authError: 'app.connectFailed' });
      console.warn('[auth] Login request failed:', err);
      return false;
    }
  },

  async logout() {
    apiAuthLogout();
    set({ authViewState: 'login', authError: null, sessionId: null, sessionToken: null, timeline: [] });
    try { await acp.disconnect(); } catch (_) {}
  },

  async refreshAuth() {
    set({ authViewState: 'loading', authError: null });
    const authState = await apiCheckAuth();
    set({ authViewState: authState });
    if (authState === 'authenticated') {
      get().bootstrap().catch((e) => console.error('bootstrap after refreshAuth failed:', e));
    }
  },
}));

if (typeof window !== "undefined" && import.meta.env.DEV) {
  window.__sendPrompt = (text) => useStore.getState().sendPrompt(text);
  window.__ZUSTAND_STORE = useStore;
}
export { acp };
