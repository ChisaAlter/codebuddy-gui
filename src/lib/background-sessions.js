function requireBackgroundSessionApi(name) {
  const api = window.electronAPI?.[name];
  if (typeof api !== 'function') throw new Error('CodeBuddy 后台会话接口不可用');
  return api;
}

export async function listBackgroundSessions() {
  return requireBackgroundSessionApi('listBackgroundSessions')();
}

export async function startBackgroundSession({ name, cwd, prompt }) {
  const normalizedName = String(name || '').trim();
  const normalizedPrompt = String(prompt || '').trim();
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(normalizedName)) throw new Error('名称只能包含字母、数字、点、连字符和下划线');
  if (!String(cwd || '').trim()) throw new Error('请选择项目');
  if (!normalizedPrompt) throw new Error('请输入后台任务内容');
  if (normalizedPrompt.length > 20000) throw new Error('后台任务内容不能超过 20000 个字符');
  return requireBackgroundSessionApi('startBackgroundSession')({ name: normalizedName, cwd, prompt: normalizedPrompt });
}

export async function readBackgroundSessionLogs(pid) {
  return requireBackgroundSessionApi('readBackgroundSessionLogs')(pid);
}

export async function killBackgroundSession(pid) {
  return requireBackgroundSessionApi('killBackgroundSession')(pid);
}

export async function openBackgroundSessionEndpoint(endpoint) {
  return requireBackgroundSessionApi('openBackgroundSessionEndpoint')(endpoint);
}

export async function attachBackgroundSession(pid) {
  const value = Number(pid);
  if (!Number.isInteger(value) || value <= 0) throw new Error('后台会话 PID 无效');
  return requireBackgroundSessionApi('attachBackgroundSession')(value);
}
