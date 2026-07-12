const { contextBridge, ipcRenderer } = require('electron');

const activeCodeBuddyStreams = new Set();

window.addEventListener('beforeunload', () => {
  for (const streamId of activeCodeBuddyStreams) {
    ipcRenderer.send('codebuddy:closeStream', streamId);
  }
  activeCodeBuddyStreams.clear();
});

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  windowMinimize: () => ipcRenderer.send('window:minimize'),
  windowMaximize: () => ipcRenderer.send('window:maximize'),
  windowClose: () => ipcRenderer.send('window:close'),
  windowReload: () => ipcRenderer.send('window:reload'),
  openDevTools: () => ipcRenderer.send('window:openDevTools'),
  runGit: (request) => ipcRenderer.invoke('git:run', request),
  chooseWorkspace: () => ipcRenderer.invoke('workspace:choose'),
  loadProductState: () => ipcRenderer.invoke('productState:load'),
  saveProductState: (state) => ipcRenderer.invoke('productState:save', state),
  ensureProjectRuntime: (request) => ipcRenderer.invoke('runtime:ensure', request),
  listProjectRuntimes: () => ipcRenderer.invoke('runtime:list'),
  stopProjectRuntime: (projectId) => ipcRenderer.invoke('runtime:stop', projectId),
  restartProjectRuntime: (request) => ipcRenderer.invoke('runtime:restart', request),
  onProjectRuntimeStatus: (handler) => {
    const listener = (_event, runtime) => handler(runtime);
    ipcRenderer.on('runtime:status', listener);
    return () => ipcRenderer.removeListener('runtime:status', listener);
  },
  requestCodeBuddy: (request) => ipcRenderer.invoke('codebuddy:request', request),
  openCodeBuddyStream: (request, handlers = {}) => {
    const streamId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    activeCodeBuddyStreams.add(streamId);
    const onMessage = (_event, payload) => {
      if (payload?.streamId !== streamId) return;
      handlers.onMessage?.(payload.message);
    };
    const onError = (_event, payload) => {
      if (payload?.streamId !== streamId) return;
      handlers.onError?.(payload.error);
    };
    ipcRenderer.on('codebuddy:streamMessage', onMessage);
    ipcRenderer.on('codebuddy:streamError', onError);
    ipcRenderer.invoke('codebuddy:openStream', { ...request, streamId }).catch((error) => {
      handlers.onError?.(error?.message || String(error));
    });
    return {
      close: () => {
        activeCodeBuddyStreams.delete(streamId);
        ipcRenderer.removeListener('codebuddy:streamMessage', onMessage);
        ipcRenderer.removeListener('codebuddy:streamError', onError);
        ipcRenderer.send('codebuddy:closeStream', streamId);
      },
    };
  },
});
