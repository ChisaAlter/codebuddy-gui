import React, { useEffect } from 'react';
import Sidebar from './components/Sidebar';
import TitleBar from './components/TitleBar';
import StatusBar from './components/StatusBar';
import ToastContainer from './components/ToastContainer';
import ChatView from './components/ChatView';
import TerminalView from './components/TerminalView';
import WorkersView from './components/WorkersView';
import LogsView from './components/LogsView';
import TasksView from './components/TasksView';
import PluginsView from './components/PluginsView';
import FilesView from './components/FilesView';
import TracesView from './components/TracesView';
import DocsView from './components/DocsView';
import SettingsView from './components/SettingsView';
import MetricsView from './components/MetricsView';
import { useStore } from './store';

const views = {
    chat: ChatView,
    terminal: TerminalView,
    workers: WorkersView,
    logs: LogsView,
    tasks: TasksView,
    plugins: PluginsView,
    files: FilesView,
    traces: TracesView,
    docs: DocsView,
    metrics: MetricsView,
    settings: SettingsView
};

export default function App() {
    const { currentView, checkApiStatus, fetchSessions, fetchWorkers, fetchDaemonStatus, fetchPlugins, fetchTasks } = useStore();
    const View = views[currentView] || ChatView;

    useEffect(() => {
        // Check API status immediately
        checkApiStatus();
        
        // Poll API status
        const statusInterval = setInterval(() => checkApiStatus(), 3000);
        
        // Fetch initial data
        const api = useStore.getState();
        if (api.apiConnected) {
            fetchSessions();
            fetchWorkers();
            fetchDaemonStatus();
            fetchPlugins();
            fetchTasks();
        }
        
        // Refresh workers every 5s
        const dataInterval = setInterval(() => {
            const store = useStore.getState();
            if (store.apiConnected) {
                store.fetchWorkers();
                store.fetchDaemonStatus();
            }
        }, 5000);

        return () => {
            clearInterval(statusInterval);
            clearInterval(dataInterval);
        };
    }, []);

    return (
        <div className="fixed inset-0 flex flex-col" style={{ background: 'var(--color-bg-base)' }}>
            <TitleBar />
            <div className="flex flex-1 overflow-hidden">
                <Sidebar />
                <div className="flex-1 flex flex-col overflow-hidden">
                    <View />
                    <StatusBar />
                </div>
            </div>
            <ToastContainer />
        </div>
    );
}
