const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  ping: () => ipcRenderer.invoke('app:ping'),
  windowMinimize: () => ipcRenderer.send('window:minimize'),
  windowMaximize: () => ipcRenderer.send('window:maximize'),
  windowClose: () => ipcRenderer.send('window:close'),
  windowReload: () => ipcRenderer.send('window:reload'),
  openDevTools: () => ipcRenderer.send('window:openDevTools'),
  runGit: (args) => ipcRenderer.invoke('git:run', args),
  getCodeBuddyPort: () => ipcRenderer.invoke('codebuddy:getPort'),
});
