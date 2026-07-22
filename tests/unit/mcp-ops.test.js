import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requestCodeBuddy: vi.fn(),
}));

vi.mock('../../src/lib/acp', () => ({
  requestCodeBuddy: mocks.requestCodeBuddy,
}));

import {
  addMcpServer,
  removeMcpServer,
  validateMcpConfig,
  validateMcpServerIdentity,
  VALID_MCP_SCOPES,
  VALID_MCP_TYPES,
} from '../../src/lib/mcp';

function okResponse(payload = { data: true }) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    text: async () => JSON.stringify(payload),
  };
}

describe('MCP ops validation and remove/add guards', () => {
  beforeEach(() => {
    mocks.requestCodeBuddy.mockReset();
    mocks.requestCodeBuddy.mockResolvedValue(okResponse());
    delete window.electronAPI;
  });

  it('accepts valid name/scope combinations for all scopes', () => {
    for (const scope of VALID_MCP_SCOPES) {
      expect(validateMcpServerIdentity('filesystem', scope)).toBe('filesystem');
      expect(validateMcpServerIdentity(' my-server_1 ', scope)).toBe('my-server_1');
    }
  });

  it('rejects invalid names and scopes', () => {
    expect(() => validateMcpServerIdentity('has space', 'local')).toThrow(/字母、数字/);
    expect(() => validateMcpServerIdentity('bad/name', 'user')).toThrow(/字母、数字/);
    expect(() => validateMcpServerIdentity('ok', 'workspace')).toThrow(/作用域无效/);
    expect(() => validateMcpServerIdentity('', 'local')).toThrow(/字母、数字/);
  });

  it('rejects invalid transport types', () => {
    for (const type of VALID_MCP_TYPES) {
      expect(validateMcpConfig({ type })).toEqual({ type });
    }
    expect(() => validateMcpConfig(null)).toThrow(/传输类型无效/);
    expect(() => validateMcpConfig({ type: 'websocket' })).toThrow(/传输类型无效/);
  });

  it('addMcpServer posts add-json after validation', async () => {
    await expect(
      addMcpServer({
        name: 'docs',
        scope: 'project',
        config: { type: 'stdio', command: 'npx' },
      }),
    ).resolves.toBe('docs');
    expect(mocks.requestCodeBuddy).toHaveBeenCalledWith(
      '/internal/mcp/add-json',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          name: 'docs',
          scope: 'project',
          json: { type: 'stdio', command: 'npx' },
        }),
      }),
    );
  });

  it('removeMcpServer requires name and valid scope then posts remove', async () => {
    await removeMcpServer('docs', 'user');
    expect(mocks.requestCodeBuddy).toHaveBeenCalledWith(
      '/internal/mcp/remove',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'docs', scope: 'user' }),
      }),
    );

    await expect(removeMcpServer('', 'user')).rejects.toThrow(/名称或作用域无效/);
    await expect(removeMcpServer('docs', 'global')).rejects.toThrow(/名称或作用域无效/);
    expect(mocks.requestCodeBuddy).toHaveBeenCalledTimes(1);
  });

  it('surfaces backend error message from remove path', async () => {
    mocks.requestCodeBuddy.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      text: async () => JSON.stringify({ error: { message: 'server locked' } }),
    });
    await expect(removeMcpServer('docs', 'local')).rejects.toThrow('server locked');
  });

  it('listMcpConfigs requires electron API', async () => {
    const { listMcpConfigs } = await import('../../src/lib/mcp');
    await expect(listMcpConfigs('C:/Project')).rejects.toThrow(/MCP 配置读取接口不可用/);
  });
});
