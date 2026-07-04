import { getApiBase, fetchJson } from './acp';

export async function fsList(path = '.', depth = 1) {
  const payload = await fetchJson('/api/v1/fs/list', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, depth }),
  });
  return payload.data?.entries || payload.entries || payload.files || [];
}

export async function fsSearchContent({ query, cwd = '.', isRegex = false, caseSensitive = false, wholeWord = false, includeGlob = '', excludeGlob = '' }) {
  const payload = await fetchJson('/api/v1/fs/search-content', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query,
      cwd,
      isRegex,
      caseSensitive,
      wholeWord,
      includeGlob: includeGlob || undefined,
      excludeGlob: excludeGlob || undefined,
      maxResults: 200,
    }),
  });
  return payload.data?.results || payload.results || [];
}

export async function createWatcher(path = '.', recursive = true) {
  const payload = await fetchJson('/api/v1/fs/watcher/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, recursive }),
  });
  return payload.data || payload;
}

export async function pollWatcher(watcherId) {
  const payload = await fetchJson('/api/v1/fs/watcher/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ watcherId }),
  });
  return payload.data?.events || payload.events || [];
}

export async function removeWatcher(watcherId) {
  return fetchJson('/api/v1/fs/watcher/remove', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ watcherId }),
  });
}

export async function downloadFile(path) {
  const response = await fetch(`${getApiBase()}/api/v1/files/download?path=${encodeURIComponent(path)}`, {
    method: 'GET',
    headers: { 'X-CodeBuddy-Request': '1' },
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.text();
}

/**
 * 创建目录
 * @param {string} path - 目录路径
 * @returns {Promise<object>} 创建结果
 */
export async function fsMkdir(path) {
  const payload = await fetchJson('/api/v1/fs/mkdir', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  });
  return payload.data || payload;
}

/**
 * 移动/重命名文件或目录
 * @param {string} source - 源路径
 * @param {string} destination - 目标路径
 * @returns {Promise<object>} 移动结果
 */
export async function fsMove(source, destination) {
  const payload = await fetchJson('/api/v1/fs/move', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source, destination }),
  });
  return payload.data || payload;
}

/**
 * 删除文件或目录
 * @param {string} path - 路径
 * @returns {Promise<object>} 删除结果
 */
export async function fsRemove(path) {
  const payload = await fetchJson('/api/v1/fs/remove', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  });
  return payload.data || payload;
}

/**
 * 写入文件内容
 * @param {string} path - 文件路径
 * @param {string} content - 文件内容
 * @returns {Promise<object>} 写入结果
 */
export async function fsWrite(path, content) {
  const payload = await fetchJson('/api/v1/fs/write', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, content }),
  });
  return payload.data || payload;
}

/**
 * 读取文件内容（文本）
 * @param {string} path - 文件路径
 * @returns {Promise<string>} 文件文本内容
 */
export async function fsRead(path) {
  const response = await fetch(`${getApiBase()}/api/v1/fs/read?path=${encodeURIComponent(path)}`, {
    method: 'GET',
    headers: { 'X-CodeBuddy-Request': '1' },
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.text();
}

/**
 * 上传文件（base64 编码内容）
 * @param {string} path - 目标路径
 * @param {string} content - base64 编码的文件内容
 * @param {string} [encoding='base64'] - 编码方式
 * @returns {Promise<object>} 上传结果
 */
export async function fsUpload(path, content, encoding = 'base64') {
  const payload = await fetchJson('/api/v1/files/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, content, encoding }),
  });
  return payload.data || payload;
}

export function normalizePathParts(path) {
  return String(path || '')
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean);
}

export function joinPath(base, child) {
  if (!base || base === '.') return child;
  return `${base.replace(/\\/g, '/')}/${child}`;
}

export { getApiBase };
