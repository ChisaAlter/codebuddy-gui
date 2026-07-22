import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useStore } from '../../src/store';

describe('store CLI info fallback', () => {
  beforeEach(() => {
    window.electronAPI = {
      requestCodeBuddy: vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ error: 'Authentication required' }),
      }),
      getCliMaintenanceInfo: vi.fn().mockResolvedValue({ version: '2.120.0' }),
    };
    useStore.setState({
      activeProjectId: 'project-1',
      activeThreadId: 'thread-1',
      info: null,
      infoLoaded: false,
    });
  });

  afterEach(() => {
    delete window.electronAPI;
  });

  it('keeps showing the installed CLI version when the runtime info endpoint is unavailable', async () => {
    await expect(useStore.getState().refreshInfo()).resolves.toBe(true);

    expect(window.electronAPI.getCliMaintenanceInfo).toHaveBeenCalledTimes(1);
    expect(useStore.getState().info).toMatchObject({ version: '2.120.0' });
    expect(useStore.getState().infoLoaded).toBe(true);
  });

  it('falls back to CLI maintenance version when runtime info omits version', async () => {
    window.electronAPI.requestCodeBuddy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ data: { name: 'codebuddy', version: null } }),
    });
    await expect(useStore.getState().refreshInfo()).resolves.toBe(true);
    expect(window.electronAPI.getCliMaintenanceInfo).toHaveBeenCalled();
    expect(useStore.getState().info).toMatchObject({ version: '2.120.0' });
  });
});
