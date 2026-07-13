const VALID_SCOPES = new Set(['user', 'project', 'local']);

function requirePluginMaintenanceApi(name) {
  const api = window.electronAPI?.[name];
  if (typeof api !== 'function') throw new Error('CodeBuddy 插件维护接口不可用');
  return api;
}

function normalizeScope(value) {
  const scope = String(value || 'user').trim();
  if (!VALID_SCOPES.has(scope)) throw new Error('插件维护作用域无效');
  return scope;
}

function normalizeCwd(value) {
  const cwd = String(value || '').trim();
  if (!cwd) throw new Error('当前项目工作目录不可用');
  return cwd;
}

export async function updateInstalledPlugin({ plugin, scope = 'user', cwd } = {}) {
  const id = String(plugin || '').trim();
  if (!id) throw new Error('插件 ID 不能为空');
  return requirePluginMaintenanceApi('updateInstalledPlugin')({ plugin: id, scope: normalizeScope(scope), cwd: normalizeCwd(cwd) });
}

export async function previewPluginDependencyPrune({ scope = 'user', cwd } = {}) {
  return requirePluginMaintenanceApi('previewPluginDependencyPrune')({ scope: normalizeScope(scope), cwd: normalizeCwd(cwd) });
}

export async function prunePluginDependencies({ scope = 'user', cwd } = {}) {
  return requirePluginMaintenanceApi('prunePluginDependencies')({ scope: normalizeScope(scope), cwd: normalizeCwd(cwd) });
}
