import { getApiBase, fetchJson, requestCodeBuddy } from './acp';

async function requestOptionalJson(path, init = {}) {
  const response = await requestCodeBuddy(path, init);
  const text = response.status === 204 ? '' : await response.text().catch(() => '');
  let payload = null;
  if (text) {
    try { payload = JSON.parse(text); } catch (_) { payload = text; }
  }
  if (!response.ok) {
    const detail = payload?.error?.message || payload?.error || payload?.message;
    throw new Error(detail || `${response.status} ${response.statusText}`);
  }
  return payload?.data ?? payload ?? null;
}

export async function fetchSessionStats(sessionId) {
  if (!sessionId) return null;
  const payload = await fetchJson(`/api/v1/stats/session?sessionId=${encodeURIComponent(sessionId)}`);
  return payload.data || payload;
}

/** 全局统计（对照源 GET /api/v1/stats），含 tokenUsageByModel/fileChangeStats/apiDuration/runningTime/totalDays/toolUsage 等 */
export async function fetchStats() {
  const payload = await fetchJson('/api/v1/stats');
  return payload.data || payload || null;
}

export async function fetchScheduledTasks(sessionId) {
  if (!sessionId) return [];
  const payload = await fetchJson(`/api/v1/scheduled-tasks?sessionId=${encodeURIComponent(sessionId)}`);
  return payload.data?.tasks || payload.tasks || [];
}

export async function createScheduledTask(sessionId, cron, prompt) {
  const payload = await fetchJson('/api/v1/scheduled-tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, cron, prompt, recurring: true, durable: true }),
  });
  return payload.data || payload;
}

export async function fetchTraceList() {
  const payload = await fetchJson('/api/v1/traces?offset=0&limit=100');
  return payload.data?.traces || payload.traces || [];
}

export async function fetchWorkerLogs(workerPid, type = 'stdout', tail = 200) {
  if (!workerPid) return '';
  const payload = await fetchJson(`/api/v1/workers/${encodeURIComponent(workerPid)}/logs?type=${encodeURIComponent(type)}&tail=${encodeURIComponent(tail)}`);
  const data = payload?.data ?? payload;
  if (typeof data === 'string') {
    return { content: data, type, availableTypes: [type], logPath: '' };
  }
  return {
    content: typeof data?.content === 'string' ? data.content : '',
    type: data?.type || type,
    availableTypes: Array.isArray(data?.availableTypes) && data.availableTypes.length ? data.availableTypes : [type],
    logPath: data?.logPath || '',
  };
}

// ===== Sessions 管理 =====

/** 删除会话（对照源 DELETE /api/v1/sessions/{id}） */
export async function deleteSession(sessionId) {
  if (!sessionId) return;
  return requestOptionalJson(`/api/v1/sessions/${encodeURIComponent(sessionId)}`, {
    method: 'DELETE',
  });
}

/** 重命名会话（对照源 POST /api/v1/sessions/{id}/rename {name}） */
export async function renameSession(sessionId, name) {
  if (!sessionId) return null;
  const trimmed = String(name || '').trim();
  if (!trimmed) throw new Error('会话名不能为空');
  const payload = await fetchJson(`/api/v1/sessions/${encodeURIComponent(sessionId)}/rename`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: trimmed }),
  });
  return payload?.data || payload || null;
}

// ===== Scheduled Tasks 管理 =====

/** 删除定时任务 */
export async function deleteScheduledTask(taskId, sessionId) {
  const query = sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : '';
  return requestOptionalJson(`/api/v1/scheduled-tasks/${encodeURIComponent(taskId)}${query}`, {
    method: 'DELETE',
  });
}

// ===== Channels 管理 =====

/** 获取 channels 列表 */
export async function fetchChannels() {
  const payload = await fetchJson('/api/v1/channels');
  return payload.data?.channels || payload.channels || [];
}

/** Toggle channel 状态（启用/禁用） */
export async function toggleChannel(channelId, enabled) {
  const payload = await fetchJson(`/api/v1/channels/${encodeURIComponent(channelId)}/toggle`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
  });
  return payload.data || payload;
}

/** 删除 channel */
export async function deleteChannel(channelId) {
  return requestOptionalJson(`/api/v1/channels/${encodeURIComponent(channelId)}`, {
    method: 'DELETE',
  });
}

/**
 * 通用 channel 实例 action（对照源 bundle：POST /channels/{type}/{instance}/{action}）
 * - action 由调用方透传，非硬集；对照源真实 UI 即此设计（_ 是运行时字符串）
 * - 特例：action="unbind" && type="wechat" && 返回 needsQrScan=true → 触发 rebind 二维码流程
 * @param {string} type - channel 类型，如 'wechat'|'wecom'|'discord'
 * @param {string} instanceId - 实例 id
 * @param {string} action - 动作名，如 'start'|'stop'|'unbind'|'rebind'|'sync'
 * @returns {Promise<object>} 后端响应，可能含 {needsQrScan, qrUrl, message, type, ...}
 */
export async function channelAction(type, instanceId, action) {
  if (!type || !instanceId || !action) throw new Error('type/instanceId/action 均不可为空');
  const payload = await fetchJson(`/api/v1/channels/${encodeURIComponent(type)}/${encodeURIComponent(instanceId)}/${encodeURIComponent(action)}`, {
    method: 'POST',
  });
  return payload?.data ?? payload ?? null;
}

/** 删除 channel 实例（对照源 DELETE /channels/{type}/{instance}） */
export async function deleteChannelInstance(type, instanceId) {
  if (!type || !instanceId) throw new Error('type/instanceId 均不可为空');
  const response = await requestCodeBuddy(`/api/v1/channels/${encodeURIComponent(type)}/${encodeURIComponent(instanceId)}`, {
    method: 'DELETE',
    timeoutMs: 15000,
  });
  if (!response.ok) {
    let msg = `${response.status} ${response.statusText}`;
    try { const e = await response.json(); if (e?.error) msg = e.error; } catch (_) {}
    throw new Error(msg);
  }
  const text = await response.text().catch(() => '');
  try { return JSON.parse(text)?.data || JSON.parse(text) || null; } catch (_) { return null; }
}

// ===== Channels: 微信/企微专属（对照源 POST /api/v1/channels/wechat|wecom）=====
// 微信：POST /api/v1/channels/wechat -> {instanceId}；二维码 GET /api/v1/channels/wechat/{id}/qr
// 企微：POST /api/v1/channels/wecom {botId,secret} -> 实例

/** 创建微信机器人 channel 实例，回 instanceId */
export async function createWechatChannel() {
  const payload = await fetchJson('/api/v1/channels/wechat', { method: 'POST' });
  return payload?.data || payload || null;
}

/** 拉微信登录二维码（对照源 GET /api/v1/channels/wechat/{instanceId}/qr）
 *  返回 { ok, qrData?: string, error?: string }
 *  bundle 未明示 body 形状，按 REST 约定尝试解析为 JSON 或直接返回 text blob
 */
export async function fetchWechatQr(instanceId) {
  if (!instanceId) return { ok: false, error: 'missing instanceId' };
  const response = await requestCodeBuddy(`/api/v1/channels/wechat/${encodeURIComponent(instanceId)}/qr`, {
    method: 'GET',
    timeoutMs: 15000,
  });
  if (!response.ok) {
    let msg = `${response.status} ${response.statusText}`;
    try { const e = await response.json(); if (e?.error) msg = e.error; } catch (_) {}
    return { ok: false, error: msg };
  }
  const ct = response.headers.get('content-type') || '';
  if (ct.includes('image/')) {
    // 后端可能直返二进制图：转 dataURL 供 <img src> 渲染
    const blob = await response.blob();
    return { ok: true, qrImage: await new Promise((res) => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result);
      fr.onerror = () => res('');
      fr.readAsDataURL(blob);
    }) };
  }
  // JSON 或 text：尝试取 url/base64 字段
  const text = await response.text();
  try {
    const json = JSON.parse(text);
    const data = json?.data ?? json ?? {};
    const directImage = data.qrImage || data.image || data.url || data.qrcode || (typeof data === 'string' ? data : null);
    if (directImage) return { ok: true, qrImage: directImage, raw: data };
    if (data.qrUrl) {
      const { default: QRCode } = await import('qrcode');
      return {
        ok: true,
        qrImage: await QRCode.toDataURL(data.qrUrl, { width: 240, margin: 1, errorCorrectionLevel: 'M' }),
        raw: data,
      };
    }
    return { ok: false, error: data.message || '二维码尚未就绪', raw: data };
  } catch (_) {
    return { ok: false, error: '二维码响应格式无法识别', raw: text };
  }
}

/** 创建企微机器人 channel（对照源 POST /api/v1/channels/wecom {botId, secret}） */
export async function createWecomChannel({ botId, secret } = {}) {
  if (!botId || !secret) throw new Error('botId 与 secret 均不可为空');
  const payload = await fetchJson('/api/v1/channels/wecom', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ botId: String(botId).trim(), secret: String(secret).trim() }),
  });
  return payload?.data || payload || null;
}

/** 终止 worker（对照源 DELETE /api/v1/workers/{pid}） */
export async function stopWorker(pid) {
  return requestOptionalJson(`/api/v1/workers/${encodeURIComponent(pid)}`, {
    method: 'DELETE',
  });
}

// ===== Plugin 管理 =====

/** 安装插件 */
export async function installPlugin(pluginId, marketplace) {
  const id = String(pluginId || '').trim();
  if (!id) throw new Error('plugin name 不能为空');
  const plugin = marketplace && !id.includes('@') ? `${id}@${marketplace}` : id;
  const payload = await fetchJson('/api/v1/plugins', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ plugin }),
  });
  return payload?.data || payload || null;
}

/** 卸载插件（对照源 bundle：POST /api/v1/plugins/uninstall {plugin}）
 *  注意：对照源用 POST /uninstall + body={plugin:<name>}，不是 DELETE /plugins/{id}。
 *  保留旧 uninstallPlugin 名，改走真实路径；调用方传 plugin 名而非 id。
 */
export async function uninstallPlugin(pluginName) {
  const name = String(pluginName || '').trim();
  if (!name) throw new Error('plugin name 不能为空');
  const payload = await fetchJson('/api/v1/plugins/uninstall', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ plugin: name }),
  });
  return payload?.data || payload || null;
}

/**
 * @deprecated 使用 uninstallPlugin(pluginName)
 * 旧 DELETE /plugins/{id} 路径保留为兜底（后端可能两条都支持）
 */
export async function uninstallPluginById(pluginId) {
  const payload = await fetchJson(`/api/v1/plugins/${encodeURIComponent(pluginId)}`, {
    method: 'DELETE',
  });
  return payload?.data || payload || null;
}

/** 启用插件 */
export async function enablePlugin(pluginId) {
  const payload = await fetchJson('/api/v1/plugins/enable', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ plugin: pluginId }),
  });
  return payload?.data || payload || null;
}

/** 禁用插件 */
export async function disablePlugin(pluginId) {
  const payload = await fetchJson('/api/v1/plugins/disable', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ plugin: pluginId }),
  });
  return payload?.data || payload || null;
}

/**
 * @deprecated 使用 enablePlugin / disablePlugin
 * 启用/禁用插件
 */
export async function togglePlugin(pluginId, enabled) {
  const payload = await fetchJson(`/api/v1/plugins/${encodeURIComponent(pluginId)}/toggle`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
  });
  return payload.data || payload;
}

/** 搜索可用插件 */
export async function searchPlugins(query) {
  const payload = await fetchJson(`/api/v1/plugins/search?q=${encodeURIComponent(query)}`);
  return payload.data?.plugins || payload.plugins || [];
}

// ===== Tasks Templates 管理 =====
// 对照源 GET /api/v1/tasks/templates{?sessionId} -> {templates[], error?, status}
//          POST /api/v1/tasks/templates/refresh{?sessionId} -> 同
export async function fetchTaskTemplates(sessionId) {
  const params = new URLSearchParams();
  if (sessionId) params.set('sessionId', sessionId);
  const qs = params.toString();
  const payload = await fetchJson(`/api/v1/tasks/templates${qs ? '?' + qs : ''}`);
  const data = payload?.data ?? payload ?? {};
  return {
    templates: data.templates || [],
    error: data.error || null,
    status: data.status || null,
  };
}

export async function refreshTaskTemplates(sessionId) {
  const params = new URLSearchParams();
  if (sessionId) params.set('sessionId', sessionId);
  const qs = params.toString();
  const payload = await fetchJson(`/api/v1/tasks/templates/refresh${qs ? '?' + qs : ''}`, {
    method: 'POST',
  });
  const data = payload?.data ?? payload ?? {};
  return {
    templates: data.templates || [],
    error: data.error || null,
    status: data.status || null,
  };
}

// ===== Trace 管理 =====

/** 获取 trace 详情 */
export async function fetchTraceDetail(traceId) {
  const payload = await fetchJson(`/api/v1/traces/${encodeURIComponent(traceId)}`);
  return payload.data || payload;
}

/** 搜索/筛选 traces */
export async function searchTraces(params = {}) {
  const query = new URLSearchParams();
  if (params.offset !== undefined) query.set('offset', params.offset);
  if (params.limit !== undefined) query.set('limit', params.limit);
  if (params.service) query.set('service', params.service);
  if (params.status) query.set('status', params.status);
  const payload = await fetchJson(`/api/v1/traces?${query.toString()}`);
  return {
    traces: payload.data?.traces || payload.traces || [],
    total: payload.data?.total || payload.total || 0,
  };
}

// ===== Settings 管理 =====

/**
 * 单项细粒度写（对照源 bundle：PUT /api/v1/settings/{key}?scope=user body {value}）
 * - key 含点 "." 时按路径切分嵌套合并（对照源 W.split(".") 逻辑）
 * - 与 updateSetting（整体 PUT /settings）并存；此路径更精准，对照源真实 UI 用此
 * @param {string} key - 设置项 key，如 "theme" 或 "memory.enabled"
 * @param {*} value - 设置值，对象类型会按 key 路径嵌套合并
 * @param {string} [scope='user'] - 命名空间，对照源固定 user
 * @returns {Promise<object>}
 */
export async function updateSettingByKey(key, value, scope = 'user') {
  if (!key) throw new Error('setting key 不能为空');
  const params = new URLSearchParams();
  if (scope) params.set('scope', scope);
  const qs = params.toString();
  const payload = await fetchJson(`/api/v1/settings/${encodeURIComponent(key)}${qs ? '?' + qs : ''}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value }),
  });
  return payload?.data || payload || null;
}

// ===== Metrics 管理 =====

/** 带时间范围的 metrics 查询 */
export async function fetchMetricsRange(from, to) {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const payload = await fetchJson(`/api/v1/metrics?${params.toString()}`);
  return payload.data || payload;
}

// ===== 多端点批量代理 =====

/** 认证状态 */
export async function fetchAuthStatus() {
  const payload = await fetchJson('/api/v1/auth/status');
  return payload.data || payload;
}

// ===== Daemon 管理 =====

/** 获取 daemon 运行状态 */
export async function fetchDaemonStatus() {
  const payload = await fetchJson('/api/v1/daemon/status');
  return payload.data || payload;
}

/** 启动 daemon */
export async function startDaemon() {
  const payload = await fetchJson('/api/v1/daemon/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  return payload.data || payload;
}

/** 停止 daemon */
export async function stopDaemon() {
  return requestOptionalJson('/api/v1/daemon/stop', { method: 'POST' });
}

/** 重启 daemon */
export async function restartDaemon() {
  const payload = await fetchJson('/api/v1/daemon/restart', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  return payload.data || payload;
}

// ===== Keybindings 管理 =====

/** 获取快捷键绑定列表 */
export async function fetchKeybindings() {
  const payload = await fetchJson('/api/v1/keybindings');
  return payload.data?.keybindings || payload.keybindings || [];
}

/** 重置快捷键绑定为默认值 */
export async function resetKeybindings() {
  const payload = await fetchJson('/api/v1/keybindings/reset', { method: 'POST' });
  return payload.data || payload;
}

// ===== Plugin Marketplaces =====

/** 获取插件市场列表 */
export async function fetchMarketplaces() {
  const payload = await fetchJson('/api/v1/plugins/marketplaces');
  const data = payload?.data ?? payload;
  if (Array.isArray(data)) return data;
  return data?.marketplaces || [];
}

/** 浏览指定市场的插件 */
export async function browseMarketplace(marketplaceId, query) {
  const payload = await fetchJson('/api/v1/plugins/marketplaces/browse', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ marketplace: marketplaceId }),
  });
  const plugins = payload?.data?.plugins || payload?.plugins || payload?.data || [];
  if (!query || !Array.isArray(plugins)) return Array.isArray(plugins) ? plugins : [];
  const term = String(query).toLowerCase();
  return plugins.filter((plugin) => `${plugin.name || ''} ${plugin.description || ''}`.toLowerCase().includes(term));
}

// ===== Plugin Marketplaces 增删（对照源 bundle）=====

/** 新增插件市场 */
export async function addMarketplace(marketplaceId, config = {}) {
  if (!marketplaceId) throw new Error('marketplace id 不能为空');
  const source = String(config.source || config.url || '').trim();
  if (!source) throw new Error('marketplace source 不能为空');
  const payload = await fetchJson('/api/v1/plugins/marketplaces', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: marketplaceId, source }),
  });
  return payload?.data || payload || null;
}

/** 删除插件市场（对照源 DELETE /api/v1/plugins/marketplaces/{id}） */
export async function removeMarketplace(marketplaceId) {
  if (!marketplaceId) throw new Error('marketplace id 不能为空');
  const response = await requestCodeBuddy(`/api/v1/plugins/marketplaces/${encodeURIComponent(marketplaceId)}`, {
    method: 'DELETE',
    timeoutMs: 15000,
  });
  if (!response.ok) {
    let msg = `${response.status} ${response.statusText}`;
    try { const e = await response.json(); if (e?.error) msg = e.error; } catch (_) {}
    throw new Error(msg);
  }
  const text = await response.text().catch(() => '');
  try { return JSON.parse(text)?.data || JSON.parse(text) || null; } catch (_) { return null; }
}

export { getApiBase };

// ===== Storage KV 命名空间（对照源 bundle ro 对象）=====
// 路由统一：/api/v1/storage${query}，query 由 {key|namespace, scope} 拼
// scope ∈ 'user'|'global' 等；get 返回 {data:{value}}，getNamespace 返回 {data:{...}}
const STORAGE_SCOPES = new Set(['user', 'global', 'session']);

function buildStorageQuery({ key, namespace, scope } = {}) {
  const params = new URLSearchParams();
  if (key) params.set('key', key);
  if (namespace) params.set('namespace', namespace);
  if (scope && STORAGE_SCOPES.has(scope)) params.set('scope', scope);
  const qs = params.toString();
  return qs ? '?' + qs : '';
}

/** 读单个 KV（对照源 ro.get(key,scope)） */
export async function fetchStorage({ key, scope } = {}) {
  if (!key) return null;
  const payload = await fetchJson(`/api/v1/storage${buildStorageQuery({ key, scope })}`);
  return payload?.data?.value ?? null;
}

/** 读命名空间下全部 KV（对照源 ro.getNamespace(namespace,scope)） */
export async function fetchStorageNamespace({ namespace, scope } = {}) {
  if (!namespace) return {};
  const payload = await fetchJson(`/api/v1/storage${buildStorageQuery({ namespace, scope })}`);
  return payload?.data ?? {};
}

/** 写单个 KV（对照源 ro.set(key,value,scope)） */
export async function writeStorage({ key, value, scope } = {}) {
  if (!key) throw new Error('storage key 不能为空');
  const payload = await fetchJson(`/api/v1/storage${buildStorageQuery({ scope })}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, value }),
  });
  return payload?.data || payload || null;
}

/** 批量写 KV（对照源 ro.setMany(entries,scope,opts)） */
export async function writeStorageMany({ entries, scope, keepalive } = {}) {
  if (!Array.isArray(entries) || entries.length === 0) return null;
  const payload = await fetchJson(`/api/v1/storage${buildStorageQuery({ scope })}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entries }),
    keepalive: keepalive === true,
  });
  return payload?.data || payload || null;
}

/** 删单个 KV（对照源 ro.remove(key,scope)） */
export async function removeStorage({ key, scope } = {}) {
  if (!key) throw new Error('storage key 不能为空');
  const response = await requestCodeBuddy(`/api/v1/storage${buildStorageQuery({ key, scope })}`, {
    method: 'DELETE',
    timeoutMs: 15000,
  });
  if (!response.ok) {
    let msg = `${response.status} ${response.statusText}`;
    try { const e = await response.json(); if (e?.error) msg = e.error; } catch (_) {}
    throw new Error(msg);
  }
  return null;
}
