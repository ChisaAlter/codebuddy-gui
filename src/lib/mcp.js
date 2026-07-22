import { requestCodeBuddy } from './acp';

export const VALID_MCP_SCOPES = new Set(['local', 'project', 'user']);
export const VALID_MCP_TYPES = new Set(['stdio', 'sse', 'http']);

/** Client-side guard mirrored by addMcpServer / removeMcpServer before IPC. */
export function validateMcpServerIdentity(name, scope) {
  const normalizedName = String(name || '').trim();
  if (!/^[a-zA-Z0-9_-]+$/.test(normalizedName)) {
    throw new Error('名称只能包含字母、数字、连字符和下划线');
  }
  if (!VALID_MCP_SCOPES.has(scope)) throw new Error('MCP 配置作用域无效');
  return normalizedName;
}

export function validateMcpConfig(config) {
  if (!config || !VALID_MCP_TYPES.has(config.type)) throw new Error('MCP 传输类型无效');
  return config;
}

async function requestMcp(path, body, timeoutMs = 30000) {
  const response = await requestCodeBuddy(`/internal/mcp/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
    timeoutMs,
  });
  const text = await response.text().catch(() => '');
  let payload = null;
  if (text) {
    try { payload = JSON.parse(text); } catch (_) { payload = text; }
  }
  if (!response.ok) {
    const message = payload?.error?.message || payload?.error || payload?.message;
    throw new Error(message || `${response.status} ${response.statusText}`);
  }
  return payload?.data ?? payload ?? null;
}

export async function listMcpConfigs(cwd) {
  if (!window.electronAPI?.listMcpConfigs) throw new Error('MCP 配置读取接口不可用');
  return window.electronAPI.listMcpConfigs(cwd);
}

export async function addMcpServer({ name, scope, config }) {
  const normalizedName = validateMcpServerIdentity(name, scope);
  validateMcpConfig(config);
  await requestMcp('add-json', { name: normalizedName, scope, json: config });
  return normalizedName;
}

export async function removeMcpServer(name, scope) {
  if (!name || !VALID_MCP_SCOPES.has(scope)) throw new Error('MCP 服务器名称或作用域无效');
  await requestMcp('remove', { name, scope });
}

export async function fetchMcpStatus(name, scope) {
  const payload = await requestMcp('status', { name, scope }, 15000);
  return payload || { name, status: 'disconnected', needsAuth: false };
}

export async function fetchMcpTools(name, scope) {
  const payload = await requestMcp('listTools', { name, scope }, 30000);
  return Array.isArray(payload) ? payload : Array.isArray(payload?.tools) ? payload.tools : [];
}