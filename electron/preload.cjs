const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('electronAPI', { getStore: k => ipcRenderer.invoke('get-store', k), setStore: (k,v) => ipcRenderer.invoke('set-store', k, v) });
