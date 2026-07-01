import React, { useEffect, useState } from 'react';
import { useStore } from './store';
import Sidebar from './components/Sidebar';
import TitleBar from './components/TitleBar';
import ChatView from './components/ChatView';
import WorkersView from './components/WorkersView';
import LogsView from './components/LogsView';
import TasksView from './components/TasksView';
import PluginsView from './components/PluginsView';
import FilesView from './components/FilesView';
import TracesView from './components/TracesView';
import DocsView from './components/DocsView';
import SettingsView from './components/SettingsView';
import MetricsView from './components/MetricsView';

const views = {
    chat: ChatView,
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
    const { currentView } = useStore();
    const View = views[currentView] || ChatView;

    return (
        <div className="fixed inset-0 flex flex-col">
            <TitleBar />
            <div className="flex flex-1 overflow-hidden">
                <Sidebar />
                <main className="flex-1 flex flex-col overflow-hidden">
                    <View />
                </main>
            </div>
        </div>
    );
}
