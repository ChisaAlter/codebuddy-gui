import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fetchJson: vi.fn(),
  requestCodeBuddy: vi.fn(),
}));

vi.mock('../../src/lib/acp', () => ({
  fetchJson: mocks.fetchJson,
  requestCodeBuddy: mocks.requestCodeBuddy,
}));

import {
  addWorkspaceDir,
  fetchWorkspaceDirs,
  normalizeWorkspaceDirList,
  normalizeWorkspaceDirPath,
  removeWorkspaceDir,
  syncWorkspaceDirs,
} from '../../src/lib/workspace-dirs';

describe('workspace-dirs helpers', () => {
  beforeEach(() => {
    mocks.fetchJson.mockReset();
    mocks.requestCodeBuddy.mockReset();
  });

  it('normalizes Windows paths and dedupes list', () => {
    expect(normalizeWorkspaceDirPath('c:/foo/bar/')).toBe('C:\\foo\\bar');
    expect(normalizeWorkspaceDirList(['C:\\a', 'c:/a/', 'D:/b', ''])).toEqual(['C:\\a', 'D:\\b']);
  });

  it('fetchWorkspaceDirs returns empty on 404', async () => {
    mocks.fetchJson.mockRejectedValue(new Error('404 Not Found'));
    await expect(fetchWorkspaceDirs()).resolves.toEqual([]);
  });

  it('addWorkspaceDir posts normalized path', async () => {
    mocks.fetchJson.mockResolvedValue({ data: { path: 'C:\\repo\\lib' } });
    await addWorkspaceDir('c:/repo/lib/');
    expect(mocks.fetchJson).toHaveBeenCalledWith('/api/v1/workspace-dirs', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ path: 'C:\\repo\\lib' }),
    }));
  });

  it('addWorkspaceDir tolerates live 2.125 204 (fetchJson null)', async () => {
    mocks.fetchJson.mockResolvedValue(null);
    await expect(addWorkspaceDir('C:\\repo\\lib')).resolves.toEqual({ path: 'C:\\repo\\lib' });
  });

  it('syncWorkspaceDirs falls back to requested list when response is 204 null', async () => {
    mocks.fetchJson.mockResolvedValue(null);
    await expect(syncWorkspaceDirs(['c:/a/', 'c:/b'])).resolves.toEqual(['C:\\a', 'C:\\b']);
  });

  it('removeWorkspaceDir deletes by query path', async () => {
    mocks.requestCodeBuddy.mockResolvedValue({ ok: true, status: 204 });
    await removeWorkspaceDir('C:\\repo\\lib');
    expect(mocks.requestCodeBuddy).toHaveBeenCalledWith(
      `/api/v1/workspace-dirs?path=${encodeURIComponent('C:\\repo\\lib')}`,
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('syncWorkspaceDirs puts dirs body', async () => {
    mocks.fetchJson.mockResolvedValue({ data: { dirs: ['C:\\a'] } });
    const result = await syncWorkspaceDirs(['c:/a/', 'c:/a']);
    expect(mocks.fetchJson).toHaveBeenCalledWith('/api/v1/workspace-dirs/sync', expect.objectContaining({
      method: 'PUT',
      body: JSON.stringify({ dirs: ['C:\\a'] }),
    }));
    expect(result).toEqual(['C:\\a']);
  });
});
