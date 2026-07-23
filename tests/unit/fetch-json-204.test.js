import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchJson, setApiBase } from '../../src/lib/acp';

/**
 * Electron IPC returns a plain proxy payload; requestCodeBuddy rebuilds text()/json().
 * Shape matches electron/main codebuddy request bridge.
 */
function ipcProxy({ ok, status, statusText = '', body = '' }) {
  return {
    ok,
    status,
    statusText,
    headers: {},
    body,
  };
}

describe('fetchJson empty-body success (CLI 2.125 204)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    setApiBase('http://127.0.0.1:63918');
    delete window.electronAPI;
  });

  it('returns null on HTTP 204 without requiring a JSON body', async () => {
    window.electronAPI = {
      requestCodeBuddy: vi.fn(async () => ipcProxy({
        ok: true,
        status: 204,
        statusText: 'No Content',
        body: '',
      })),
    };

    await expect(fetchJson('/api/v1/workspace-dirs', { method: 'POST' })).resolves.toBeNull();
  });

  it('parses JSON bodies on 200', async () => {
    window.electronAPI = {
      requestCodeBuddy: vi.fn(async () => ipcProxy({
        ok: true,
        status: 200,
        statusText: 'OK',
        body: JSON.stringify({ data: { dirs: ['C:\\a'] } }),
      })),
    };

    await expect(fetchJson('/api/v1/workspace-dirs')).resolves.toEqual({
      data: { dirs: ['C:\\a'] },
    });
  });

  it('surfaces error.message from JSON error bodies', async () => {
    window.electronAPI = {
      requestCodeBuddy: vi.fn(async () => ipcProxy({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        body: JSON.stringify({ error: { code: 'BAD_REQUEST', message: 'plugin is required' } }),
      })),
    };

    await expect(fetchJson('/api/v1/plugins/update', { method: 'POST' })).rejects.toThrow(
      'plugin is required',
    );
  });
});
