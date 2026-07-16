import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fetchJson: vi.fn(),
}));

vi.mock('../../src/lib/acp', () => ({
  fetchJson: mocks.fetchJson,
  requestCodeBuddy: vi.fn(),
}));

import { disablePlugin, enablePlugin, uninstallPlugin } from '../../src/lib/ops';

describe('plugin write operations', () => {
  beforeEach(() => {
    mocks.fetchJson.mockReset();
    mocks.fetchJson.mockResolvedValue({ data: { ok: true } });
  });

  it.each([
    ['enablePlugin', enablePlugin, '/api/v1/plugins/enable'],
    ['disablePlugin', disablePlugin, '/api/v1/plugins/disable'],
    ['uninstallPlugin', uninstallPlugin, '/api/v1/plugins/uninstall'],
  ])('%s sends the marketplace-qualified plugin id', async (_name, operation, endpoint) => {
    await operation('workflow', 'workflow-dev');

    expect(mocks.fetchJson).toHaveBeenCalledWith(endpoint, expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ plugin: 'workflow@workflow-dev' }),
    }));
  });

  it('does not duplicate an existing marketplace suffix', async () => {
    await disablePlugin('workflow@workflow-dev', 'workflow-dev');

    expect(mocks.fetchJson).toHaveBeenCalledWith('/api/v1/plugins/disable', expect.objectContaining({
      body: JSON.stringify({ plugin: 'workflow@workflow-dev' }),
    }));
  });
});
