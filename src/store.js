import { create } from 'zustand';

export const useStore = create((set, get) => ({
    ready: true,
    currentView: 'chat',
    apiBase: 'http://127.0.0.1:7890',

    // ── UI ──
    toasts: [],
    modals: [],
    sidebarCollapsed: false,
    sidebarSearch: '',

    // ── Sessions ──
    sessions: [
        { id: '1', title: 'New Chat', time: 'Just now', groupId: 'today' },
        { id: '2', title: 'Code Review', time: '2 hours ago', groupId: 'today' },
        { id: '3', title: 'Debugging Session', time: '1 day ago', groupId: 'week' },
        { id: '4', title: 'API Design', time: '3 days ago', groupId: 'week' },
    ],
    activeSessionId: null,

    // ── Chat ──
    chatSessions: {},
    isStreaming: false,

    // ── Workers ──
    workersList: [],
    daemonStatus: null,

    // ── Logs ──
    logsType: 'telemetry',
    logsSearch: '',
    logsWorker: 'all',

    // ── Tasks ──
    cronTasks: [],

    // ── Plugins ──
    pluginsList: [],

    // ── Files ──
    filesPath: '',

    // ── Traces ──
    tracesList: [],

    // ── Metrics ──
    metricsData: null,

    // ── Settings ──
    settings: {
        theme: 'dark',
        language: 'en',
        model: 'claude-sonnet-4-20250514',
        permissionMode: 'default',
        fontSize: 14,
        codeTheme: 'vsDark',
        enableTelemetry: true,
        enableAutoUpdate: true
    },

    // ── Actions: UI ──
    addToast: (toast) => set(s => ({ toasts: [...s.toasts, { id: Date.now(), ...toast }] })),
    removeToast: id => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })),
    pushModal: modal => set(s => ({ modals: [...s.modals, modal] })),
    popModal: () => set(s => ({ modals: s.modals.slice(0, -1) })),
    toggleSidebar: () => set(s => ({ sidebarCollapsed: !s.sidebarCollapsed })),
    setSidebarSearch: v => set({ sidebarSearch: v }),

    // ── Actions: Sessions ──
    setSessions: sessions => set({ sessions }),
    setActiveSession: id => set({ activeSessionId: id }),
    addSession: session => set(s => ({ sessions: [session, ...s.sessions] })),
    deleteSession: id => set(s => ({ sessions: s.sessions.filter(x => x.id !== id) })),

    // ── Actions: Chat ──
    getCurrentChat: () => {
        const { activeSessionId, chatSessions } = get();
        return chatSessions[activeSessionId || 'default'] || [];
    },
    addChatMessage: msg => set(s => {
        const sid = s.activeSessionId || 'default';
        const msgs = s.chatSessions[sid] || [];
        return { chatSessions: { ...s.chatSessions, [sid]: [...msgs, msg] } };
    }),
    updateLastChatMessage: fn => set(s => {
        const sid = s.activeSessionId || 'default';
        const msgs = [...(s.chatSessions[sid] || [])];
        if (msgs.length > 0) msgs[msgs.length - 1] = fn(msgs[msgs.length - 1]);
        return { chatSessions: { ...s.chatSessions, [sid]: msgs } };
    }),

    // ── Actions: Data ──
    setIsStreaming: v => set({ isStreaming: v }),
    setWorkersList: v => set({ workersList: v }),
    setDaemonStatus: v => set({ daemonStatus: v }),
    setLogsType: v => set({ logsType: v }),
    setLogsSearch: v => set({ logsSearch: v }),
    setLogsWorker: v => set({ logsWorker: v }),
    setCronTasks: v => set({ cronTasks: v }),
    setPluginsList: v => set({ pluginsList: v }),
    setFilesPath: v => set({ filesPath: v }),
    setTracesList: v => set({ tracesList: v }),
    setMetricsData: v => set({ metricsData: v }),
    setSettings: patch => set(s => ({ settings: { ...s.settings, ...patch } })),
}));
