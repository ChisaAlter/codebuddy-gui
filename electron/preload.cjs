const { contextBridge, ipcRenderer, webUtils } = require('electron');

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
  confirmQuit: () => ipcRenderer.send('app:confirmQuit'),
  onQuitRequested: (handler) => {
    const listener = () => handler();
    ipcRenderer.on('app:quitRequested', listener);
    return () => ipcRenderer.removeListener('app:quitRequested', listener);
  },
  windowReload: () => ipcRenderer.send('window:reload'),
  openDevTools: () => ipcRenderer.send('window:openDevTools'),
  getAppInfo: () => ipcRenderer.invoke('app:getInfo'),
  reportRendererError: (payload) => ipcRenderer.invoke('app:reportRendererError', payload),
  checkForUpdates: () => ipcRenderer.invoke('app:checkForUpdates'),
  openReleasePage: (releaseUrl) => ipcRenderer.invoke('app:openReleasePage', releaseUrl),
  openUpdateDownload: (downloadUrl) => ipcRenderer.invoke('app:openUpdateDownload', downloadUrl),
  listMcpConfigs: (cwd) => ipcRenderer.invoke('mcp:listConfigs', cwd),
  listSandboxes: () => ipcRenderer.invoke('sandbox:list'),
  killSandbox: (sandboxId) => ipcRenderer.invoke('sandbox:kill', sandboxId),
  cleanSandboxes: () => ipcRenderer.invoke('sandbox:clean'),
  listBackgroundSessions: () => ipcRenderer.invoke('backgroundSession:list'),
  startBackgroundSession: (payload) => ipcRenderer.invoke('backgroundSession:start', payload),
  readBackgroundSessionLogs: (pid) => ipcRenderer.invoke('backgroundSession:logs', pid),
  killBackgroundSession: (pid) => ipcRenderer.invoke('backgroundSession:kill', pid),
  openBackgroundSessionEndpoint: (endpoint) => ipcRenderer.invoke('backgroundSession:openEndpoint', endpoint),
  getDaemonServiceStatus: () => ipcRenderer.invoke('daemonService:status'),
  installDaemonService: (payload) => ipcRenderer.invoke('daemonService:install', payload),
  uninstallDaemonService: () => ipcRenderer.invoke('daemonService:uninstall'),
  getCliMaintenanceInfo: () => ipcRenderer.invoke('cliMaintenance:getInfo'),
  runCliDoctor: () => ipcRenderer.invoke('cliMaintenance:doctor'),
  updateCodeBuddyCli: () => ipcRenderer.invoke('cliMaintenance:update'),
  exportDiagnostics: () => ipcRenderer.invoke('app:exportDiagnostics'),
  showTaskNotification: (payload) => ipcRenderer.invoke('notification:showTaskResult', payload),
  consumeTaskNotificationTarget: () => ipcRenderer.invoke('notification:consumeOpenThread'),
  openUserData: () => ipcRenderer.invoke('app:openUserData'),
  runGit: (request) => ipcRenderer.invoke('git:run', request),
  chooseWorkspace: () => ipcRenderer.invoke('workspace:choose'),
  chooseAttachments: () => ipcRenderer.invoke('attachment:choose'),
  readDroppedAttachments: (files = []) => {
    const filePaths = Array.from(files || [], (file) => webUtils.getPathForFile(file)).filter(Boolean);
    return ipcRenderer.invoke('attachment:read', filePaths);
  },
  readAttachments: (filePaths) => ipcRenderer.invoke('attachment:read', filePaths),
  saveClipboardImage: (payload) => ipcRenderer.invoke('attachment:saveClipboardImage', payload),
  loadProductState: () => ipcRenderer.invoke('productState:load'),
  saveProductState: (state) => ipcRenderer.invoke('productState:save', state),
  saveProductStateSync: (state) => ipcRenderer.sendSync('productState:saveSync', state),
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
