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
  addMarketplace,
  setMarketplaceAutoUpdate,
  updatePluginHttp,
} from '../../src/lib/ops';

describe('marketplace autoUpdate and plugin HTTP update', () => {
  beforeEach(() => {
    mocks.fetchJson.mockReset();
    mocks.fetchJson.mockResolvedValue({ data: { ok: true } });
  });

  it('addMarketplace includes autoUpdate when provided', async () => {
    await addMarketplace('m1', { source: 'https://example.test/m', autoUpdate: true });
    expect(mocks.fetchJson).toHaveBeenCalledWith('/api/v1/plugins/marketplaces', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        name: 'm1',
        source: 'https://example.test/m',
        autoUpdate: true,
      }),
    }));
  });

  it('addMarketplace omits autoUpdate when unset', async () => {
    await addMarketplace('m1', { source: 'https://example.test/m' });
    expect(mocks.fetchJson).toHaveBeenCalledWith('/api/v1/plugins/marketplaces', expect.objectContaining({
      body: JSON.stringify({ name: 'm1', source: 'https://example.test/m' }),
    }));
  });

  it('setMarketplaceAutoUpdate posts marketplace flag', async () => {
    await setMarketplaceAutoUpdate('m1', false);
    expect(mocks.fetchJson).toHaveBeenCalledWith('/api/v1/plugins/marketplaces/auto-update', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ marketplace: 'm1', autoUpdate: false }),
    }));
  });

  it('updatePluginHttp posts plugin and optional scope', async () => {
    await updatePluginHttp('demo@m1', { scope: 'user', waitForApply: true });
    expect(mocks.fetchJson).toHaveBeenCalledWith('/api/v1/plugins/update', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ plugin: 'demo@m1', scope: 'user', waitForApply: true }),
    }));
  });
});
