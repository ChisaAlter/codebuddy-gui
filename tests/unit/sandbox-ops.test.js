import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanSandboxes,
  killSandbox,
  listSandboxes,
  normalizeSandboxId,
  sandboxErrorMessage,
} from '../../src/lib/sandbox';

describe('sandbox ops validation and IPC guards', () => {
  beforeEach(() => {
    delete window.electronAPI;
  });

  it('normalizes valid sandbox ids', () => {
    expect(normalizeSandboxId(' abc_12-Z ')).toBe('abc_12-Z');
    expect(normalizeSandboxId('A')).toBe('A');
  });

  it('rejects empty, illegal, or oversized sandbox ids', () => {
    expect(() => normalizeSandboxId('')).toThrow(/Sandbox ID 格式无效/);
    expect(() => normalizeSandboxId(' has space')).toThrow(/Sandbox ID 格式无效/);
    expect(() => normalizeSandboxId('-leading')).toThrow(/Sandbox ID 格式无效/);
    expect(() => normalizeSandboxId(`x${'a'.repeat(128)}`)).toThrow(/Sandbox ID 格式无效/);
  });

  it('rewrites missing E2B_API_KEY errors for operators', () => {
    const message = sandboxErrorMessage(
      new Error('E2B_API_KEY environment variable is required'),
      '终止失败',
    );
    expect(message).toContain('缺少 E2B_API_KEY');
    expect(message).toContain('E2B_API_KEY environment variable is required');
    expect(sandboxErrorMessage(new Error('timeout'), '终止失败')).toBe('timeout');
    expect(sandboxErrorMessage(null, '终止失败')).toBe('终止失败');
  });

  it('list/kill/clean require electron sandbox APIs', async () => {
    await expect(listSandboxes()).rejects.toThrow(/Sandbox 管理接口不可用/);
    await expect(killSandbox('box1')).rejects.toThrow(/Sandbox 管理接口不可用/);
    await expect(cleanSandboxes()).rejects.toThrow(/Sandbox 管理接口不可用/);
  });

  it('killSandbox validates then invokes IPC with normalized id', async () => {
    const kill = vi.fn().mockResolvedValue({ ok: true });
    window.electronAPI = { killSandbox: kill };
    await expect(killSandbox('  box-1 ')).resolves.toEqual({ ok: true });
    expect(kill).toHaveBeenCalledWith('box-1');
  });

  it('does not call IPC when sandbox id is invalid', async () => {
    const kill = vi.fn();
    window.electronAPI = { killSandbox: kill };
    await expect(killSandbox('../evil')).rejects.toThrow(/Sandbox ID 格式无效/);
    expect(kill).not.toHaveBeenCalled();
  });

  it('cleanSandboxes and listSandboxes proxy electron APIs', async () => {
    window.electronAPI = {
      listSandboxes: vi.fn().mockResolvedValue({ sandboxes: [] }),
      cleanSandboxes: vi.fn().mockResolvedValue({ output: 'cleaned' }),
    };
    await expect(listSandboxes()).resolves.toEqual({ sandboxes: [] });
    await expect(cleanSandboxes()).resolves.toEqual({ output: 'cleaned' });
  });
});
