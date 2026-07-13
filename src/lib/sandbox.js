function requireSandboxApi(name) {
  const api = window.electronAPI?.[name];
  if (typeof api !== 'function') throw new Error('Sandbox 管理接口不可用');
  return api;
}

export async function listSandboxes() {
  return requireSandboxApi('listSandboxes')();
}

export async function killSandbox(sandboxId) {
  const value = String(sandboxId || '').trim();
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(value)) throw new Error('Sandbox ID 格式无效');
  return requireSandboxApi('killSandbox')(value);
}

export async function cleanSandboxes() {
  return requireSandboxApi('cleanSandboxes')();
}
