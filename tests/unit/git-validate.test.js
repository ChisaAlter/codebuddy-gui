import { describe, it, expect } from 'vitest';
import { validateGitArgs, normalizeGitRequest } from '../../src/lib/git-validate';

describe('normalizeGitRequest - 形态归一', () => {
  it('数组形态转 {args, cwd}', () => {
    const { args, cwd } = normalizeGitRequest(['status', '--short']);
    expect(args).toEqual(['status', '--short']);
    expect(cwd).toBe('.');
  });

  it('对象形态保留 args，cwd 兜底到 "."', () => {
    const { args, cwd } = normalizeGitRequest({ args: ['log'] });
    expect(args).toEqual(['log']);
    expect(cwd).toBe('.');
  });

  it('空入参兜底为空 args + "." cwd', () => {
    const { args, cwd } = normalizeGitRequest(null);
    expect(args).toEqual([]);
    expect(cwd).toBe('.');
  });

  it('cwd 空白串兜底到 "."，非空白 trim', () => {
    expect(normalizeGitRequest({ args: [], cwd: '   ' }).cwd).toBe('.');
    expect(normalizeGitRequest({ args: [], cwd: '  /tmp/x  ' }).cwd).toBe('/tmp/x');
  });

  it('args 非字符串元素被 String() 强转', () => {
    expect(normalizeGitRequest({ args: [1, true, null] }).args).toEqual(['1', 'true', 'null']);
  });
});

describe('validateGitArgs - 白名单与安全拦截', () => {
  it('空命令返错', () => {
    expect(validateGitArgs([])).toMatch(/empty/);
  });

  it('未在白名单的子命令拒', () => {
    expect(validateGitArgs(['ls-files'])).toMatch(/not allowed/);
    expect(validateGitArgs(['clone', '.'])).toMatch(/not allowed/);
  });

  it('合法 UI 在用的 19 种形态全放行', () => {
    const okCases = [
      ['status', '--short'],
      ['branch', '--show-current'],
      ['branch', '--format=%(refname:short)'],
      ['stash', 'pop'],
      ['stash', 'list'],
      ['reset', 'HEAD', '--', 'x.txt'],
      ['reset', 'HEAD', '--', '.'],
      ['remote', 'get-url', 'origin'],
      ['add', '--', 'x.txt'],
      ['add', '-A'],
      ['checkout', '--', 'x.txt'],
      ['checkout', '--', '.'],
      ['checkout', 'main'],
      ['checkout', '-b', 'feat'],
      ['diff', '--', 'x.txt'],
      ['diff', '--cached'],
      ['commit', '-m', 'msg'],
      ['log', '-20', '--oneline', '--decorate'],
      ['log', '-20', '--format=%H|%h|%an|%ai|%s'],
      ['stash'],
      ['push'],
      ['fetch'],
      ['pull'],
    ];
    for (const args of okCases) {
      expect(validateGitArgs(args)).toBeNull();
    }
  });

  it('二级子命令不在白名单拒', () => {
    expect(validateGitArgs(['branch', '--delete', 'x'])).toMatch(/branch.*not allowed/);
    expect(validateGitArgs(['stash', 'drop'])).toMatch(/stash.*not allowed/);
    expect(validateGitArgs(['remote', 'add', 'x', 'y'])).toMatch(/remote.*not allowed/);
    expect(validateGitArgs(['reset', '--hard'])).toMatch(/reset.*not allowed/);
    expect(validateGitArgs(['checkout', '--orphan', 'x'])).toMatch(/checkout.*not allowed/);
  });

  it('危险选项黑名单拦截（= 与裸值两形态）', () => {
    expect(validateGitArgs(['fetch', '--upload-pack=/bin/sh'])).toMatch(/blocked.*--upload-pack/);
    expect(validateGitArgs(['commit', '-c', 'x'])).toMatch(/blocked.*-c/);
    expect(validateGitArgs(['push', '--config', 'core.hooksPath=/tmp'])).toMatch(/blocked.*--config/);
    expect(validateGitArgs(['push', '--receive-pack=/bin/sh'])).toMatch(/blocked.*--receive-pack/);
    expect(validateGitArgs(['fetch', '--exec=/tmp/x'])).toMatch(/blocked.*--exec/);
  });

  it('-C <path> 主命令从 args[2] 解析', () => {
    expect(validateGitArgs(['-C', '/repo', 'status'])).toBeNull();
    expect(validateGitArgs(['-C', '/repo', 'rm', '-rf', '/'])).toMatch(/not allowed/);
  });

  it('-- 后路径段豁免黑名单（不解析为选项）', () => {
    // '--' 后即使有 --config 字面量也当 path 不拦
    expect(validateGitArgs(['add', '--', '--config', 'x.txt'])).toBeNull();
  });
});
