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
});
