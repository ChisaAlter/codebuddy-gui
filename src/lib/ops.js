import { getApiBase, fetchJson } from './acp';

export async function fetchSessionStats(sessionId) {
  if (!sessionId) return null;
  const payload = await fetchJson(`/api/v1/stats/session?sessionId=${encodeURIComponent(sessionId)}`);
  return payload.data || payload;
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
  if (typeof payload?.data === 'string') return payload.data;
  if (typeof payload === 'string') return payload;
  return JSON.stringify(payload?.data || payload, null, 2);
}

// ===== Scheduled Tasks 管理 =====

/** 更新定时任务 */
export async function updateScheduledTask(taskId, updates) {
  const payload = await fetchJson(`/api/v1/scheduled-tasks/${encodeURIComponent(taskId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  return payload.data || payload;
}

/** 删除定时任务 */
export async function deleteScheduledTask(taskId) {
  const payload = await fetchJson(`/api/v1/scheduled-tasks/${encodeURIComponent(taskId)}`, {
    method: 'DELETE',
  });
  return payload.data || payload;
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
  const payload = await fetchJson(`/api/v1/channels/${encodeURIComponent(channelId)}`, {
    method: 'DELETE',
  });
  return payload.data || payload;
}

// ===== Worker 管理 =====

/** 启动 worker */
export async function startWorker(config) {
  const payload = await fetchJson('/api/v1/workers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  return payload.data || payload;
}

/** 停止 worker */
export async function stopWorker(pid) {
  const payload = await fetchJson(`/api/v1/workers/${encodeURIComponent(pid)}/stop`, {
    method: 'POST',
  });
  return payload.data || payload;
}

/** 重启 worker */
export async function restartWorker(pid) {
  const payload = await fetchJson(`/api/v1/workers/${encodeURIComponent(pid)}/restart`, {
    method: 'POST',
  });
  return payload.data || payload;
}

/** 获取单个 worker 详情 */
export async function fetchWorkerDetail(pid) {
  const payload = await fetchJson(`/api/v1/workers/${encodeURIComponent(pid)}`);
  return payload.data || payload;
}

// ===== Plugin 管理 =====

/** 安装插件 */
export async function installPlugin(pluginId, marketplace) {
  const payload = await fetchJson('/api/v1/plugins/install', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pluginId, marketplace }),
  });
  return payload.data || payload;
}

/** 卸载插件 */
export async function uninstallPlugin(pluginId) {
  const payload = await fetchJson(`/api/v1/plugins/${encodeURIComponent(pluginId)}`, {
    method: 'DELETE',
  });
  return payload.data || payload;
}

/** 启用插件 */
export async function enablePlugin(pluginId) {
  const payload = await fetchJson('/api/v1/plugins/enable', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pluginId }),
  });
  return payload.data || payload;
}

/** 禁用插件 */
export async function disablePlugin(pluginId) {
  const payload = await fetchJson('/api/v1/plugins/disable', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pluginId }),
  });
  return payload.data || payload;
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

/** 更新单个设置项（回写到后端） */
export async function updateSetting(key, value) {
  const payload = await fetchJson('/api/v1/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ [key]: value }),
  });
  return payload.data || payload;
}

/** 批量更新设置 */
export async function updateSettingsBatch(settings) {
  const payload = await fetchJson('/api/v1/settings/batch', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  });
  return payload.data || payload;
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

export { getApiBase };
