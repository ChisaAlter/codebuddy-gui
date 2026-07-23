/**
 * File changes / checkpoints (CLI WebUI internal APIs, 2.123+).
 * Paths verified against @tencent-ai/codebuddy-code@2.125 web-ui bundle + live serve.
 *
 * Live 2.125 notes:
 * - diff prefers absolute path/uri; relative often returns 404 "File not tracked"
 * - success body shape is often { path, oldText, newText } (not a unified diff string)
 * - checkpoints list may omit files[]; ACP `_codebuddy.ai/checkpoint` carries uri list
 */
import { fetchJson, requestCodeBuddy } from './acp';

const REVERT_SCOPES = new Set(['Code', 'Conversation', 'CodeAndConversation']);

async function postInternal(path, body = {}) {
  const payload = await fetchJson(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  return payload?.data ?? payload ?? null;
}

/** Extract absolute/relative file paths from heterogeneous checkpoint shapes. */
export function extractCheckpointFilePaths(checkpoint) {
  if (!checkpoint || typeof checkpoint !== 'object') return [];
  const buckets = [
    checkpoint.paths,
    checkpoint.files,
    checkpoint.fileChanges?.files,
    checkpoint.fileChanges,
  ];
  const out = [];
  const seen = new Set();
  for (const bucket of buckets) {
    if (!Array.isArray(bucket)) continue;
    for (const item of bucket) {
      const path =
        typeof item === 'string'
          ? item
          : item?.uri || item?.path || item?.filePath || item?.file || '';
      const normalized = String(path || '').trim();
      if (!normalized) continue;
      const key = normalized.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(normalized);
    }
  }
  return out;
}

export function normalizeCheckpointRecord(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = raw.id || raw.checkpointId || '';
  const paths = extractCheckpointFilePaths(raw);
  return {
    ...raw,
    id: id || raw.id,
    paths,
    files: paths.length ? paths : raw.files,
  };
}

export async function fetchFileChangeDiff(filePath) {
  const path = String(filePath || '').trim();
  if (!path) throw new Error('文件路径不能为空');
  return postInternal('/internal/file-changes/diff', { path });
}

export async function fetchFileChangeCheckpoints() {
  const data = await postInternal('/internal/file-changes/checkpoints', {});
  const list = Array.isArray(data)
    ? data
    : Array.isArray(data?.checkpoints)
      ? data.checkpoints
      : [];
  return list.map(normalizeCheckpointRecord).filter(Boolean);
}

/**
 * @param {{ paths?: string[], checkpointId?: string, scope?: string }} options
 * scope: Code | Conversation | CodeAndConversation (checkpoint revert)
 */
export async function revertFileChanges(options = {}) {
  const body = {};
  if (Array.isArray(options.paths) && options.paths.length) {
    body.paths = options.paths.map(String).filter(Boolean);
  }
  if (options.checkpointId) {
    body.checkpointId = String(options.checkpointId);
    const scope = String(options.scope || 'Code');
    if (!REVERT_SCOPES.has(scope)) {
      throw new Error(`无效的回退范围: ${scope}`);
    }
    body.scope = scope;
  }
  // Empty body = revert all current file changes (WebUI discard-all).
  const response = await requestCodeBuddy('/internal/file-changes/revert', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    timeoutMs: 60000,
  });
  const text = response.status === 204 ? '' : await response.text().catch(() => '');
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch (_) {
      payload = text;
    }
  }
  if (!response.ok) {
    const detail = payload?.error?.message || payload?.error || payload?.message;
    throw new Error(detail || `${response.status} ${response.statusText}`);
  }
  return payload?.data ?? payload ?? true;
}

export { REVERT_SCOPES };
