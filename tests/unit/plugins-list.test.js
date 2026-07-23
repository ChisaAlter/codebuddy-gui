import { describe, expect, it } from 'vitest';
import {
  detectPluginKind,
  filterPlugins,
  slicePluginPage,
} from '../../src/lib/plugins-list';

describe('plugins-list helpers', () => {
  const sample = [
    { name: 'skill-pack', enabled: true, skills: [{ name: 'foo' }] },
    { name: 'mcp-bridge', enabled: false, mcpServers: [{ name: 'server' }] },
    { name: 'hooks-only', status: 'enabled', hooks: [{}] },
    { name: 'tools-only', tools: [{}], description: 'utility tools' },
    { name: 'mystery', description: 'no metadata' },
  ];

  it('detectPluginKind prefers explicit and dominant metadata', () => {
    expect(detectPluginKind({ kind: 'mcp' })).toBe('mcp');
    expect(detectPluginKind({ skills: [1], mcpServers: [1, 2] })).toBe('mcp');
    expect(detectPluginKind({})).toBe('other');
  });

  it('filterPlugins applies status, kind, and query', () => {
    expect(filterPlugins(sample, { status: 'enabled' }).map((p) => p.name)).toEqual([
      'skill-pack',
      'hooks-only',
    ]);
    expect(filterPlugins(sample, { kind: 'skills' }).map((p) => p.name)).toEqual(['skill-pack']);
    expect(filterPlugins(sample, { query: 'utility' }).map((p) => p.name)).toEqual(['tools-only']);
  });

  it('slicePluginPage windows the list for infinite scroll', () => {
    const list = Array.from({ length: 55 }, (_, i) => ({ name: `p${i}` }));
    const first = slicePluginPage(list, 30, 30);
    expect(first.items).toHaveLength(30);
    expect(first.hasMore).toBe(true);
    expect(first.nextVisible).toBe(55);
    const full = slicePluginPage(list, 55, 30);
    expect(full.hasMore).toBe(false);
    expect(full.total).toBe(55);
  });
});
