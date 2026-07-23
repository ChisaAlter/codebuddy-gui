/**
 * Extra workspace directories (CLI 2.121+ /api/v1/workspace-dirs).
 * Aligns with WebUI folder-scoped dirs + PUT /sync on load.
 */
import { fetchJson, requestCodeBuddy } from './acp';

export function normalizeWorkspaceDirPath(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  // Collapse mixed separators; drop trailing slashes (keep drive root "C:\").
  let path = raw.replace(/\\/g, '/');
  if (/^[a-zA-Z]:\/$/.test(path)) {
    return `${path[0].toUpperCase()}:\\`;
  }
  path = path.replace(/\/+$/, '');
  // Restore Windows drive letter form for display/storage consistency.
  if (/^[a-zA-Z]:\//.test(path)) {
    path = `${path[0].toUpperCase()}:${path.slice(2)}`;
    return path.replace(/\//g, '\\');
  }
  return path;
}

export function normalizeWorkspaceDirList(dirs) {
  const seen = new Set();
  const out = [];
  for (const item of Array.isArray(dirs) ? dirs : []) {
    const normalized = normalizeWorkspaceDirPath(item);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
  }
  return out;
}

function extractDirs(payload) {
  const data = payload?.data ?? payload;
  if (Array.isArray(data)) return normalizeWorkspaceDirList(data);
  if (Array.isArray(data?.dirs)) return normalizeWorkspaceDirList(data.dirs);
  if (Array.isArray(data?.workspaceDirs)) return normalizeWorkspaceDirList(data.workspaceDirs);
  return [];
}

/** GET if supported; empty array on 404 (WebUI often relies on local state + sync). */
export async function fetchWorkspaceDirs() {
  try {
    const payload = await fetchJson('/api/v1/workspace-dirs');
    return extractDirs(payload);
  } catch (error) {
    const message = String(error?.message || error || '');
    if (/\b404\b/.test(message) || /not found/i.test(message)) return [];
    throw error;
  }
}

export async function addWorkspaceDir(dirPath) {
  const path = normalizeWorkspaceDirPath(dirPath);
  if (!path) throw new Error('工作目录路径不能为空');
  const payload = await fetchJson('/api/v1/workspace-dirs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  });
  return payload?.data ?? payload ?? { path };
}

export async function removeWorkspaceDir(dirPath) {
  const path = normalizeWorkspaceDirPath(dirPath);
  if (!path) throw new Error('工作目录路径不能为空');
  const response = await requestCodeBuddy(
    `/api/v1/workspace-dirs?path=${encodeURIComponent(path)}`,
    { method: 'DELETE', timeoutMs: 15000 },
  );
  if (!response.ok && response.status !== 404) {
    let detail = `${response.status} ${response.statusText}`;
    try {
      const body = await response.json();
      detail = body?.error?.message || body?.error || body?.message || detail;
    } catch (_) {}
    throw new Error(detail);
  }
  return true;
}

export async function syncWorkspaceDirs(dirs) {
  const list = normalizeWorkspaceDirList(dirs);
  const payload = await fetchJson('/api/v1/workspace-dirs/sync', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dirs: list }),
  });
  return extractDirs(payload).length ? extractDirs(payload) : list;
}
