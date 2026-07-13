const VALID_PERMISSION_MODES = new Set(['default', 'acceptEdits', 'bypassPermissions', 'plan', 'dontAsk', 'auto']);

function requireDaemonServiceApi(name) {
  const api = window.electronAPI?.[name];
  if (typeof api !== 'function') throw new Error('Daemon 系统服务接口不可用');
  return api;
}

export async function getDaemonServiceStatus() {
  return requireDaemonServiceApi('getDaemonServiceStatus')();
}

export async function installDaemonService({ port = '', permissionMode = 'default' } = {}) {
  const portText = String(port ?? '').trim();
  if (portText) {
    const value = Number(portText);
    if (!Number.isInteger(value) || value < 1 || value > 65535) throw new Error('端口必须是 1 到 65535 之间的整数');
  }
  if (!VALID_PERMISSION_MODES.has(permissionMode)) throw new Error('权限模式无效');
  return requireDaemonServiceApi('installDaemonService')({ port: portText, permissionMode });
}

export async function uninstallDaemonService() {
  return requireDaemonServiceApi('uninstallDaemonService')();
}
