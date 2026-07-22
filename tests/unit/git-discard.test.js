import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  runGitIpc: vi.fn(),
  workspacePath: 'C:/Project',
}));

vi.mock('../../src/store', () => ({
  useStore: {
    getState: () => ({ workspacePath: mocks.workspacePath }),
  },
}));

import { discardAll, discardFile } from '../../src/lib/git';

describe('git destructive discard helpers', () => {
  beforeEach(() => {
    mocks.runGitIpc.mockReset();
    mocks.workspacePath = 'C:/Project';
    window.electronAPI = {
      runGit: mocks.runGitIpc,
    };
    mocks.runGitIpc.mockResolvedValue({ ok: true, output: '' });
  });

  it('discardFile requires a path', async () => {
    await expect(discardFile(null)).rejects.toThrow(/缺少要丢弃的文件路径/);
    await expect(discardFile({})).rejects.toThrow(/缺少要丢弃的文件路径/);
    expect(mocks.runGitIpc).not.toHaveBeenCalled();
  });

  it('discardFile uses clean -fd for untracked files', async () => {
    await discardFile({ path: 'tmp.log', indexStatus: '?', worktreeStatus: '?' });
    expect(mocks.runGitIpc).toHaveBeenCalledWith({
      args: ['clean', '-fd', '--', 'tmp.log'],
      cwd: 'C:/Project',
    });
  });

  it('discardFile restores tracked files from HEAD including originalPath', async () => {
    await discardFile({ path: 'src/a.js', originalPath: 'src/old.js', indexStatus: 'M', worktreeStatus: ' ' });
    expect(mocks.runGitIpc).toHaveBeenCalledWith({
      args: ['restore', '--source=HEAD', '--staged', '--worktree', '--', 'src/a.js', 'src/old.js'],
      cwd: 'C:/Project',
    });
  });

  it('discardFile accepts bare path strings as tracked restore', async () => {
    await discardFile('README.md');
    expect(mocks.runGitIpc).toHaveBeenCalledWith({
      args: ['restore', '--source=HEAD', '--staged', '--worktree', '--', 'README.md'],
      cwd: 'C:/Project',
    });
  });

  it('discardAll refuses when repository has no HEAD commit', async () => {
    mocks.runGitIpc.mockImplementation(async ({ args }) => {
      if (args[0] === 'rev-parse') return { ok: false, error: 'unknown revision' };
      return { ok: true, output: '' };
    });
    await expect(discardAll()).rejects.toThrow(/仓库尚无提交，无法安全丢弃全部修改/);
    expect(mocks.runGitIpc).toHaveBeenCalledWith({
      args: ['rev-parse', '--verify', 'HEAD'],
      cwd: 'C:/Project',
    });
    expect(mocks.runGitIpc.mock.calls.some((call) => call[0].args[0] === 'reset')).toBe(false);
  });

  it('discardAll resets, checkouts, then cleans when HEAD exists', async () => {
    const calls = [];
    mocks.runGitIpc.mockImplementation(async (payload) => {
      calls.push(payload.args);
      return { ok: true, output: '' };
    });
    await discardAll('D:/Other');
    expect(calls).toEqual([
      ['rev-parse', '--verify', 'HEAD'],
      ['reset', 'HEAD', '--', '.'],
      ['checkout', '--', '.'],
      ['clean', '-fd'],
    ]);
    expect(mocks.runGitIpc).toHaveBeenCalledWith({
      args: ['clean', '-fd'],
      cwd: 'D:/Other',
    });
  });

  it('surfaces IPC failures from destructive restore', async () => {
    mocks.runGitIpc.mockResolvedValueOnce({ ok: false, error: 'permission denied' });
    await expect(discardFile('locked.bin')).rejects.toThrow('permission denied');
  });
});
