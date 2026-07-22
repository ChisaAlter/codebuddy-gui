function requireSandboxApi(name) {
  const api = window.electronAPI?.[name];
  if (typeof api !== 'function') throw new Error('Sandbox 管理接口不可用');
  return api;
}

/** Normalize and validate sandbox id before IPC (shared with UI tests). */
export function normalizeSandboxId(sandboxId) {
  const value = String(sandboxId || '').trim();
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(value)) {
    throw new Error('Sandbox ID 格式无效');
  }
  return value;
}

/** Map CLI/E2B errors to operator-facing copy (ReplicaSandboxesView). */
export function sandboxErrorMessage(error, fallback = 'Sandbox 操作失败') {
  const message = error?.message || fallback;
  if (/E2B_API_KEY environment variable is required/i.test(message)) {
    return `缺少 E2B_API_KEY。请先在启动 CodeBuddy Desktop 的环境中配置该变量。CLI 返回：${message}`;
  }
  return message;
}

export async function listSandboxes() {
  return requireSandboxApi('listSandboxes')();
}

export async function killSandbox(sandboxId) {
  const value = normalizeSandboxId(sandboxId);
  return requireSandboxApi('killSandbox')(value);
}

export async function cleanSandboxes() {
  return requireSandboxApi('cleanSandboxes')();
}
