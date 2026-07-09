const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  windowMinimize: () => ipcRenderer.send('window:minimize'),
  windowMaximize: () => ipcRenderer.send('window:maximize'),
  windowClose: () => ipcRenderer.send('window:close'),
  windowReload: () => ipcRenderer.send('window:reload'),
  openDevTools: () => ipcRenderer.send('window:openDevTools'),
  runGit: (request) => ipcRenderer.invoke('git:run', request),
  chooseWorkspace: () => ipcRenderer.invoke('workspace:choose'),
  getCodeBuddyPort: () => ipcRenderer.invoke('codebuddy:getPort'),
  requestCodeBuddy: (request) => ipcRenderer.invoke('codebuddy:request', request),
  openCodeBuddyStream: (request, handlers = {}) => {
    const streamId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
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
        ipcRenderer.removeListener('codebuddy:streamMessage', onMessage);
        ipcRenderer.removeListener('codebuddy:streamError', onError);
        ipcRenderer.send('codebuddy:closeStream', streamId);
      },
    };
  },
});
