import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fetchJson: vi.fn(),
  requestCodeBuddy: vi.fn(),
}));

vi.mock('../../src/lib/acp', () => ({
  fetchJson: mocks.fetchJson,
  requestCodeBuddy: mocks.requestCodeBuddy,
}));

import { disablePlugin, enablePlugin, fetchWechatQr, uninstallPlugin } from '../../src/lib/ops';

describe('plugin write operations', () => {
  beforeEach(() => {
    mocks.fetchJson.mockReset();
    mocks.fetchJson.mockResolvedValue({ data: { ok: true } });
    mocks.requestCodeBuddy.mockReset();
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

  it('encodes the current QR status payload URL as a displayable QR image', async () => {
    mocks.requestCodeBuddy.mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: vi.fn().mockResolvedValue(JSON.stringify({
        type: 'fetching',
        message: '请扫码',
        qrUrl: 'https://example.test/wechat-login-token',
      })),
    });

    const result = await fetchWechatQr('_pending123');

    expect(result).toMatchObject({
      ok: true,
      type: 'fetching',
      message: '请扫码',
    });
    expect(result.qrImage).toMatch(/^data:image\/png;base64,/);
  });
});
