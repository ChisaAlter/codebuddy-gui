import { create } from 'zustand';

const API = 'http://127.0.0.1:7890';
const HEADERS = { 'X-CodeBuddy-Request': '1' };

async function api(path, opts = {}) {
  const res = await fetch(`${API}${path}`, { headers: HEADERS, ...opts });
  if (!res.ok) throw new Error(`${res.status}`);
  const ct = res.headers.get('content-type') || '';
  return ct.includes('json') ? res.json() : res.text();
}

export const useStore = create((set, get) => ({
  ready: true,
  currentView: 'chat',
  apiBase: API,
  apiConnected: false,
  apiStatus: 'connecting',

  // UI
  toasts: [],
  sidebarCollapsed: false,
  sidebarSearch: '',

  // Sessions
  sessions: [],
  activeSessionId: null,
  chatMessages: {},

  // Workers
  workersList: [],
  daemonStatus: null,

  // Logs
  logsType: 'telemetry',
  logsSearch: '',

  // Tasks
  cronTasks: [],

  // Plugins
  pluginsList: [],

  // Files
  filesPath: '',
  filesList: [],

  // Traces
  tracesList: [],

  // Metrics
  metricsData: null,

  // Settings
  settings: { theme: 'dark', language: 'en', model: 'claude-sonnet-4-20250514', permissionMode: 'default' },

  // ═══ ACTIONS ═══

  async checkApiStatus() {
    try {
      const res = await fetch(`${API}/api/v1/health`, { headers: HEADERS });
      const data = await res.json();
      set({ apiConnected: data.status === 'up' || data.status === 'ok', apiStatus: 'connected' });
    } catch (e) {
      set({ apiConnected: false, apiStatus: 'disconnected' });
    }
  },

  async fetchSessions() {
    try {
      const data = await api('/api/v1/sessions?cwd=*');
      const list = (data.sessions || data || []);
      if (list.length > 0) {
        set({
          sessions: list.map(function(s, i) {
            return {
              id: s.id || 's-' + i,
              title: s.name || (s.id ? s.id.slice(0, 8) : 'Untitled'),
              time: s.lastActiveAt || '—',
              groupId: 'today'
            };
          })
        });
      }
    } catch (e) { console.log('fetchSessions:', e.message); }
  },

  async sendChat(text) {
    const sid = get().activeSessionId || 'default';
    // Add user msg
    set(function(s) {
      var msgs = s.chatMessages[sid] || [];
      return { chatMessages: Object.assign({}, s.chatMessages, { [sid]: msgs.concat([{ role: 'user', content: text, ts: Date.now() }]) }) };
    });
    // Add placeholder
    set(function(s) {
      var msgs = s.chatMessages[sid] || [];
      return { chatMessages: Object.assign({}, s.chatMessages, { [sid]: msgs.concat([{ role: 'assistant', content: '', ts: Date.now(), streaming: true }]) }) };
    });

    try {
      const res = await fetch(`${API}/api/v1/runs`, {
        method: 'POST',
        headers: Object.assign({}, HEADERS, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ text: text, sessionId: sid, model: get().settings.model })
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      var buffer = '';
      while (true) {
        var _a = await reader.read();
        var done = _a.done, value = _a.value;
        if (done) break;
        buffer += decoder.decode(value);
        var lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (var i = 0; i < lines.length; i++) {
          var line = lines[i];
          if (line.indexOf('data: ') === 0) {
            var chunk = line.slice(6);
            if (chunk === '[DONE]') break;
            var txt = chunk;
            try {
              var parsed = JSON.parse(chunk);
              txt = parsed.text || parsed.content || (parsed.delta && parsed.delta.text) || chunk;
            } catch (e) {}
            if (txt) get()._appendText(sid, txt);
          }
        }
      }
    } catch (err) {
      get()._appendText(sid, '\n\nError: ' + err.message);
    } finally {
      set(function(s) {
        var msgs = (s.chatMessages[sid] || []).slice();
        if (msgs.length > 0) msgs[msgs.length - 1].streaming = false;
        return { chatMessages: Object.assign({}, s.chatMessages, { [sid]: msgs }) };
      });
    }
  },

  _appendText(sid, text) {
    set(function(s) {
      var msgs = (s.chatMessages[sid] || []).slice();
      if (msgs.length > 0) {
        msgs[msgs.length - 1].content += text;
      }
      return { chatMessages: Object.assign({}, s.chatMessages, { [sid]: msgs }) };
    });
  },

  // Workers
  async fetchWorkers() {
    try {
      var data = await api('/api/v1/workers');
      var workers = (data.workers || data || []).map(function(w, i) {
        return { pid: w.pid || i, sessionId: w.sessionId || 'worker-' + i, cwd: w.cwd || '—', kind: w.kind || 'interactive', status: w.status || 'running' };
      });
      set({ workersList: workers });
    } catch (e) { console.log('fetchWorkers:', e.message); }
  },

  async fetchDaemonStatus() {
    try {
      var data = await api('/api/v1/daemon/status');
      set({ daemonStatus: data });
    } catch (e) {
      try {
        var workers = await api('/api/v1/workers?kind=daemon');
        var daemons = workers.workers || workers || [];
        set({ daemonStatus: daemons[0] ? { status: 'running', pid: daemons[0].pid, endpoint: daemons[0].url } : null });
      } catch (e2) { set({ daemonStatus: null }); }
    }
  },

  async killWorker(pid) {
    try { await api('/api/v1/workers/' + pid, { method: 'DELETE' }); get().fetchWorkers(); } catch (e) {}
  },

  // Tasks
  async fetchTasks() {
    try {
      var data = await api('/api/v1/scheduled-tasks');
      set({ cronTasks: data.tasks || data || [] });
    } catch (e) { set({ cronTasks: [] }); }
  },

  async deleteTask(id) {
    try { await api('/api/v1/scheduled-tasks/' + id, { method: 'DELETE' }); get().fetchTasks(); } catch (e) {}
  },

  // Plugins
  async fetchPlugins() {
    try {
      var data = await api('/api/v1/plugins');
      set({ pluginsList: data.plugins || data || [] });
    } catch (e) { set({ pluginsList: [] }); }
  },

  async uninstallPlugin(name) {
    try { await api('/api/v1/plugins', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name, action: 'uninstall' }) }); get().fetchPlugins(); } catch (e) {}
  },

  // Files
  async fetchFiles(path) {
    if (!path) path = '';
    set({ filesPath: path });
    try {
      var data = await api('/api/v1/fs/list', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: path || '.' }) });
      set({ filesList: data.files || data.entries || (Array.isArray(data) ? data : []) });
    } catch (e) { set({ filesList: [] }); }
  },

  // Traces
  async fetchTraces() {
    try {
      var data = await api('/api/v1/traces?offset=0&limit=50');
      set({ tracesList: data.traces || data || [] });
    } catch (e) { set({ tracesList: [] }); }
  },

  // Metrics
  async fetchMetrics() {
    try {
      var data = await api('/api/v1/metrics');
      set({ metricsData: data });
    } catch (e) { set({ metricsData: null }); }
  },

  // UI
  addToast: function(toast) { set(function(s) { return { toasts: s.toasts.concat([Object.assign({ id: Date.now() }, toast)]) }; }); },
  removeToast: function(id) { set(function(s) { return { toasts: s.toasts.filter(function(t) { return t.id !== id; }) }; }); },
  toggleSidebar: function() { set(function(s) { return { sidebarCollapsed: !s.sidebarCollapsed }; }); },
  setSidebarSearch: function(v) { set({ sidebarSearch: v }); },
  setCurrentView: function(v) { set({ currentView: v }); },
  setActiveSession: function(id) { set({ activeSessionId: id }); },
  setSettings: function(patch) { set(function(s) { return { settings: Object.assign({}, s.settings, patch) }; }); },
}));
