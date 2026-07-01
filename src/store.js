import { create } from 'zustand';

export const useStore = create((set, get) => ({
    ready: true,
    currentView: 'chat',
    apiBase: 'http://127.0.0.1:7890',

    // Sidebar
    sidebarCollapsed: false,
    sidebarSearch: '',
    activeSessionId: null,

    // Chat
    chatMessages: [],
    chatInput: '',
    isStreaming: false,
    selectedModel: 'sonnet',

    // Workers
    workersList: [],
    daemonStatus: null,

    // Logs
    logsType: 'telemetry',
    logsSearch: '',
    logsWorker: 'all',

    // Tasks
    cronTasks: [],

    // Plugins
    pluginsList: [],

    // Files
    filesPath: '',

    // Metrics
    metricsData: null,

    // Actions
    setCurrentView: view => set({ currentView: view }),
    toggleSidebar: () => set(s => ({ sidebarCollapsed: !s.sidebarCollapsed })),
    setSidebarSearch: v => set({ sidebarSearch: v }),
    setActiveSession: id => set({ activeSessionId: id }),
    setChatMessages: m => set({ chatMessages: m }),
    addChatMessage: m => set(s => ({ chatMessages: [...s.chatMessages, m] })),
    setChatInput: v => set({ chatInput: v }),
    setIsStreaming: v => set({ isStreaming: v }),
    setSelectedModel: v => set({ selectedModel: v }),
    setWorkersList: v => set({ workersList: v }),
    setDaemonStatus: v => set({ daemonStatus: v }),
    setLogsType: v => set({ logsType: v }),
    setLogsSearch: v => set({ logsSearch: v }),
    setLogsWorker: v => set({ logsWorker: v }),
    setCronTasks: v => set({ cronTasks: v }),
    setPluginsList: v => set({ pluginsList: v }),
    setFilesPath: v => set({ filesPath: v }),
    setMetricsData: v => set({ metricsData: v }),
}));
