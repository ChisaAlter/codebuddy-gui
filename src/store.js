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
  apiBase: API,
  currentView: 'chat',
  apiConnected: false,
  apiStatus: 'connecting',

  // ── UI ──
  toasts: [],
  sidebarCollapsed: false,
  sidebarSearch: '',

  // ── Sessions (from /api/v1/sessions) ──
  sessions: [],
  activeSessionId: null,
  chatMessages: {},

  // ── Workers ──
  workersList: [],
  daemonStatus: null,

  // ── Logs ──
  logsType: 'telemetry',
  logsSearch: '',

  // ── Tasks ──
  cronTasks: [],

  // ── Plugins ──
  pluginsList: [],

  // ── Files ──
  filesPath: '',
  filesList: [],

  // ── Traces ──
  tracesList: [],

  // ── Metrics ──
  metricsData: null,

  // ── PTY ──
  ptyId: null,

  // ── Settings ──
  settings: { theme: 'dark', language: 'en', model: 'claude-sonnet-4-20250514', permissionMode: 'default' },

  // ═══════════════════════════════════════
  // ACTIONS: API-connected
  // ═══════════════════════════════════════

  async checkApiStatus() {
    try {
      await api('/api/v1/health');
      set({ apiConnected: true, apiStatus: 'connected' });
    } catch {
      set({ apiConnected: false, apiStatus: 'disconnected' });
    }
  },

  // ── Sessions ──
  async fetchSessions() {
    try {
      const data = await api('/api/v1/sessions?cwd=*');
      const list = data.sessions || data || [];
      if (Array.isArray(list) && list.length > 0) {
        set({
          sessions: list.map((s, i) => ({
            id: s.id || `s-${i}`,
            title: s.name || s.id?.slice(0, 8) || 'Untitled',
            time: s.lastActiveAt || '—',
            groupId: 'today'
          }))
        });
      }
    } catch (e) { console.log('fetchSessions:', e.message); }
  },

  async fetchActiveSessionMessages() {
    const sid = get().activeSessionId || 'default';
    const cached = get().chatMessages[sid];
    if (cached) return cached;
    try {
      const data = await api(`/api/v1/sessions/${sid}/messages`);
      const msgs = data.messages || data || [];
      set(s => ({
        chatMessages: {
          ...s.chatMessages,
          [sid]: Array.isArray(msgs) ? msgs.map(m => ({
            role: m.role || (m.sender === 'human' ? 'user' : 'assistant'),
            content: m.content || m.text || '',
            ts: m.timestamp || Date.now()
          })) : []
        }
      }));
    } catch {
      set(s => ({ chatMessages: { ...s.chatMessages, [sid]: [] } }));
    }
    return get().chatMessages[sid] || [];
  },

  async sendChat(text) {
    const sid = get().activeSessionId || 'default';
    const store = get();
    const msgs = store.chatMessages[sid] || [];
    
    // Add user message immediately
    const userMsg = { role: 'user', content: text, ts: Date.now() };
    set(s => ({
      chatMessages: { ...s.chatMessages, [sid]: [...(s.chatMessages[sid] || []), userMsg] }
    }));

    // Create assistant placeholder
    const placeholderIdx = get().chatMessages[sid].length;
    set(s => ({
      chatMessages: {
        ...s.chatMessages,
        [sid]: [...s.chatMessages[sid], { role: 'assistant', content: '', ts: Date.now(), streaming: true }]
      }
    }));

    try {
      const data = { text, sessionId: sid, model: store.settings.model };
      const res = await fetch(`${API}/api/v1/runs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...HEADERS },
        body: JSON.stringify(data)
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      // Read SSE stream
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value);
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const chunk = line.slice(6);
            if (chunk === '[DONE]') break;
            try {
              const parsed = JSON.parse(chunk);
              const text = parsed.text || parsed.content || parsed.delta?.text || chunk;
              get().appendStreamingText(sid, placeholderIdx, text);
            } catch {
              get().appendStreamingText(sid, placeholderIdx, chunk);
            }
          }
        }
      }
    } catch (err) {
      get().appendStreamingText(sid, placeholderIdx, `\n\nError: ${err.message}`);
    } finally {
      set(s => {
        const msgs = [...(s.chatMessages[sid] || [])];
        if (msgs[placeholderIdx]) msgs[placeholderIdx] = { ...msgs[placeholderIdx], streaming: false };
        return { chatMessages: { ...s.chatMessages, [sid]: msgs } };
      });
    }
  },

  appendStreamingText(sid, idx, text) {
    set(s => {
      const msgs = [...(s.chatMessages[sid] || [])];
      if (msgs[idx]) {
        msgs[idx] = { ...msgs[idx], content: msgs[idx].content + text, streaming: true };
      }
      return { chatMessages: { ...s.chatMessages, [sid]: msgs } };
    });
  },

  // ── Workers ──
  async fetchWorkers() {
    try {
      const data = await api('/api/v1/workers');
      const workers = (data.workers || data || []).map((w, i) => ({
        pid: w.pid || i,
        sessionId: w.sessionId || `worker-${i}`,
        cwd: w.cwd || '—',
        kind: w.kind || 'interactive',
        status: w.status || 'running'
      }));
      set({ workersList: workers });
    } catch (e) { console.log('fetchWorkers:', e.message); }
  },

  async fetchDaemonStatus() {
    try {
      const data = await api('/api/v1/daemon/status');
      set({ daemonStatus: data });
    } catch {
      try {
        const data = await api('/api/v1/workers?kind=daemon');
        const daemons = data.workers || data || [];
        set({ daemonStatus: daemons[0] ? { status: 'running', pid: daemons[0].pid, endpoint: daemons[0].url } : null });
      } catch { set({ daemonStatus: null }); }
    }
  },

  async killWorker(pid) {
    try { await api(`/api/v1/workers/${pid}`, { method: 'DELETE' }); get().fetchWorkers(); } catch(e) {}
  },

  // ── Tasks ──
  async fetchTasks() {
    try {
      const data = await api('/api/v1/scheduled-tasks');
      set({ cronTasks: data.tasks || data || [] });
    } catch { set({ cronTasks: [] }); }
  },

  async deleteTask(id) {
    try { await api(`/api/v1/scheduled-tasks/${id}`, { method: 'DELETE' }); get().fetchTasks(); } catch {}
  },

  // ── Plugins ──
  async fetchPlugins() {
    try {
      const data = await api('/api/v1/plugins');
      set({ pluginsList: data.plugins || data || [] });
    } catch { set({ pluginsList: [] }); }
  },

  async uninstallPlugin(name) {
    try { await api('/api/v1/plugins', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, action: 'uninstall' }) }); get().fetchPlugins(); } catch {}
  },

  // ── Files ──
  async fetchFiles(path = '') {
    set({ filesPath: path });
    try {
      const data = await api('/api/v1/fs/list', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: path || '.' }) });
      set({ filesList: data.files || data.entries || (Array.isArray(data) ? data : []) });
    } catch { set({ filesList: [] }); }
  },

  // ── Traces ──
  async fetchTraces() {
    try {
      const data = await api('/api/v1/traces?offset=0&limit=50');
      set({ tracesList: data.traces || data || [] });
    } catch { set({ tracesList: [] }); }
  },

  // ── Metrics ──
  async fetchMetrics() {
    try {
      const data = await api('/api/v1/metrics');
      set({ metricsData: data });
    } catch { set({ metricsData: null }); }
  },

  // ── PTY ──
  async createPty() {
    try {
      const data = await api('/api/v1/pty', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cols: 120, rows: 30 }) });
      set({ ptyId: data.id });
      return data.id;
    } catch { return null; }
  },

  async sendPtyInput(id, input) {
    try { await api(`/api/v1/pty/${id}/input/send`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: input }) }); } catch {}
  },

  // ── UI helpers ──
  addToast: (toast) => set(s => ({ toasts: [...s.toasts, { id: Date.now(), ...toast }] })),
  removeToast: id => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })),
  toggleSidebar: () => set(s => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setSidebarSearch: sidebarSearch => set({ sidebarSearch }),
  setCurrentView: currentView => set({ currentView }),
  setActiveSession: activeSessionId => set({ activeSessionId }),
  setSettings: patch => set(s => ({ settings: { ...s.settings, ...patch } })),
}));
