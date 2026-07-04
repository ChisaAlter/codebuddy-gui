import { create } from 'zustand';
import { AcpClient, getApiBase, setApiBase, fetchJson } from './lib/acp';
import { parseHashRoute, setHashRoute } from './lib/routes';
import { fsList, fsSearchContent, createWatcher, pollWatcher, removeWatcher, downloadFile, fsMkdir, fsMove, fsRemove, fsWrite } from './lib/fs';
import { commit, getLog, getLogDetailed, stash, stashPop, stashList, getUnstagedDiff, getStagedDiff, getRemoteUrl, fetch as gitFetch } from './lib/git';
import { fetchSessionStats, fetchScheduledTasks, createScheduledTask, fetchTraceList, fetchWorkerLogs, updateSetting, updateSettingsBatch, fetchChannels, fetchWorkerDetail, stopWorker, restartWorker, enablePlugin, disablePlugin, searchTraces, fetchTraceDetail } from './lib/ops';
import { PtySocket } from './lib/pty';
import {
  closeAssistantStream,
  pushUserMessage,
  reduceAcpEvent,
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
  sessionId: null,
  sessionToken: null,
  currentModel: null,
  models: [],
  modes: [],
  currentMode: 'default',
  info: null,
  settings: null,
  sessionTitle: null,
  usage: null,
  availableCommands: [],
  sessions: [],
  workers: [],
  plugins: [],
  timeline: [],
  sidebarCollapsed: false,
  changesCount: 0,
  leftTab: 'chat',
  terminalSessions: [],
  ptySessionId: null,
  terminalPanes: [makePane()],
  activePaneId: null,
  traces: [],
  metrics: null,
  stats: null,
  scheduledTasks: [],
  error: null,
  promptSuggestion: null,
  permissionRequests: [],
  questions: [],
  teamState: null,
  fileCwd: '.',
  fileEntries: [],
  fileLoading: false,
  fileSearchQuery: '',
  fileSearchResults: [],
  fileSearching: false,
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
    if (update === null || !update || typeof update !== 'object') return;

    if (update.sessionUpdate === 'config_option_update') {
      const patch = get().applySessionConfigUpdate(update.configOptions || []);
      set(patch);
    }

    if (update.sessionUpdate === 'session_info_update') {
      set({
        sessionTitle: update.title || get().sessionTitle,
      });
    }

    if (update.sessionUpdate === 'usage_update') {
      set({
        usage: {
          used: update.used,
          size: update.size,
          meta: update._meta || null,
        },
      });
    }

    if (update.sessionUpdate === 'available_commands_update') {
      set({
        availableCommands: update.availableCommands || [],
      });
    }

    if (update.sessionUpdate === 'interruption_request') {
      set((state) => ({ permissionRequests: [...state.permissionRequests, update] }));
    }

    if (update.sessionUpdate === 'question_request') {
      set((state) => ({ questions: [...state.questions, update] }));
    }

    get().appendTimelineEvent(update.sessionUpdate || 'session/update', update);
  },

  async changeSession(sessionId) {
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
      const { init, loaded } = await acp.initializeSession(sessionId);
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
  async initializeWorkspace() {
    await get().openDirectory('.');
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
      const closedPane = state.terminalPanes.find((x) => x.id === paneId);
      if (closedPane?.sessionId && window.__ptySockets && window.__ptySockets[closedPane.sessionId]) {
        try { window.__ptySockets[closedPane.sessionId].close(); } catch (_) {}
        delete window.__ptySockets[closedPane.sessionId];
      }
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
    set((state) => ({
      questions: state.questions.filter((x) => x.toolCallId !== toolCallId),
    }));
    get().appendTimelineEvent('question_answered', { toolCallId, answers });
    try {
      // NOTE: _codebuddy.ai/answerQuestion 在真实 webui-js.js 中未找到，可能真实 UI 使用不同机制
      // 保留此方法直到确认正确的 question 应答流程
      await acp.request('_codebuddy.ai/answerQuestion', {
        sessionId: get().sessionId,
        toolCallId,
        answers,
      });
    } catch (error) {
      set({ error: error.message });
    }
  },

  async bootstrap() {
    window.addEventListener('hashchange', () => {
      set({ route: parseHashRoute() });
    });

    // 1. 从 Electron 主进程获取 CodeBuddy 端口（带降级）
    try {
      if (window.electronAPI?.getCodeBuddyPort) {
        const port = await window.electronAPI.getCodeBuddyPort();
        const base = `http://127.0.0.1:${port}`;
        setApiBase(base);
        set({ apiBase: base });
      }
    } catch (err) {
      console.warn('Failed to get CodeBuddy port, using default:', err.message);
    }

    // 2. 从 localStorage 恢复设置（主题等需要尽早生效）
    get().loadSettingsFromStorage();

    acp.on('connected', () => {
      set({ connectionState: 'connected', sessionToken: acp.sessionToken, error: null });
    });

    acp.on('reconnecting', () => {
      set({ connectionState: 'reconnecting' });
    });

    acp.on('reconnected', () => {
      set({ connectionState: 'connected', error: null });
    });

    acp.on('reconnect_failed', () => {
      set({ connectionState: 'error', error: '连接断开，重连失败' });
    });

    acp.on('initialized', (detail) => {
      const capabilities = detail?.agentCapabilities || {};
      get().appendTimelineEvent('initialized', capabilities);
    });

    acp.on('session/update', (params) => {
      get().handleSessionUpdate(params.update || {});
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
    set({ info: payload.data || payload });
  },

  async refreshSettings() {
    const payload = await fetchJson('/api/v1/settings');
    const loaded = payload.data || payload;
    try { localStorage.setItem('codebuddy-gui-settings', JSON.stringify(loaded)); } catch (_) {}
    set({ settings: loaded });
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

  updateSetting(key, value) {
    set((state) => {
      const next = { ...(state.settings || {}), [key]: value };
      try { localStorage.setItem('codebuddy-gui-settings', JSON.stringify(next)); } catch (_) {}
      return { settings: next };
    });
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

  async refreshMetrics() {
    try {
      const payload = await fetchJson('/api/v1/metrics');
      set({ metrics: payload.data || payload });
    } catch (_) {
      set({ metrics: null });
    }
  },

  async refreshStats() {
    try {
      const stats = await fetchSessionStats(get().sessionId);
      set({ stats });
    } catch (_) {
      set({ stats: null });
    }
  },

  async refreshTasks() {
    try {
      const tasks = await fetchScheduledTasks(get().sessionId);
      set({ scheduledTasks: tasks });
    } catch (_) {
      set({ scheduledTasks: [] });
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

  async fetchWorkerLogs(workerPid, type = 'stdout', tail = 200) {
    try {
      return await fetchWorkerLogs(workerPid, type, tail);
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
      // 自动创建 PtySocket 并连接
      try {
        const socket = new PtySocket(data.sessionId);
        socket.connect();
        window.__ptySockets = window.__ptySockets || {};
        window.__ptySockets[data.sessionId] = socket;
      } catch (socketErr) {
        console.warn('PTY auto-connect failed:', socketErr.message);
      }
      return data;
    } catch (error) {
      set({ error: error.message });
      return null;
    }
  },

  async cancelSession() {
    try {
      await acp.request('session/cancel', {
        sessionId: get().sessionId,
      });
      get().closeAssistantStream();
      get().appendTimelineEvent('status_change', { status: 'cancelled', role: 'system' });
    } catch (error) {
      set({ error: error.message });
    }
  },

  async sendPrompt(text) {
    const content = String(text || '').trim();
    if (!content) return;
    set((state) => ({ timeline: pushUserMessage(state.timeline, content) }));
    try {
      await acp.request('session/prompt', {
        sessionId: get().sessionId,
        prompt: [{ type: 'text', text: content }],
      });
    } catch (error) {
      get().appendTimelineEvent('error', { message: error.message, type: 'error' });
      get().closeAssistantStream();
    }
  },
}));

export { acp };
