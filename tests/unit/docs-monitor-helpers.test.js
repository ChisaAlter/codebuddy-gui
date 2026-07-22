import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  docsLangFromLocale,
  extractHeadings,
  firstDocsLink,
  normalizeDocsPath,
} from '../../src/components/ReplicaDocsView.jsx';
import {
  formatDiskUsage,
  unwrapPayload,
} from '../../src/components/ReplicaMonitorView.jsx';

describe('ReplicaDocsView helpers', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('detects docs language from navigator locales', () => {
    vi.stubGlobal('navigator', { languages: ['en-US', 'zh-CN'], language: 'en-US' });
    expect(docsLangFromLocale()).toBe('zh');
    vi.stubGlobal('navigator', { languages: ['en-US'], language: 'en-US' });
    expect(docsLangFromLocale()).toBe('en');
  });

  it('finds the first nested docs link', () => {
    expect(firstDocsLink(null)).toBeNull();
    expect(
      firstDocsLink([
        { text: 'A', items: [{ text: 'A1' }, { text: 'A2', link: '/docs/a2' }] },
        { text: 'B', link: '/docs/b' },
      ]),
    ).toBe('/docs/a2');
  });

  it('normalizes docs paths', () => {
    expect(normalizeDocsPath('')).toBeNull();
    expect(normalizeDocsPath('guide/start')).toBe('/guide/start');
    expect(normalizeDocsPath('//guide//start/')).toBe('/guide/start/');
  });

  it('extracts markdown headings while ignoring fenced code', () => {
    const md = ['# Title', '## One', '```', '## not-a-heading', '```', '### Two', '## 中文标题'].join('\n');
    const headings = extractHeadings(md);
    expect(headings.map((item) => item.text)).toEqual(['One', 'Two', '中文标题']);
    expect(headings[0].level).toBe(2);
    expect(headings[1].level).toBe(3);
    expect(headings[2].id).toContain('中文');
  });
});

describe('ReplicaMonitorView helpers', () => {
  it('unwraps API payloads', () => {
    expect(unwrapPayload({ data: { ok: 1 } })).toEqual({ ok: 1 });
    expect(unwrapPayload({ ok: 2 })).toEqual({ ok: 2 });
    expect(unwrapPayload(null)).toBeNull();
  });

  it('formats disk usage from GiB fields or raw bytes', () => {
    expect(formatDiskUsage(null)).toBe('-');
    expect(formatDiskUsage({ diskUsedGiB: 1.25, diskTotalGiB: 10 })).toBe('1.3 / 10.0 GiB');
    const oneGiB = 1024 * 1024 * 1024;
    expect(formatDiskUsage({ diskUsed: oneGiB, diskTotal: 2 * oneGiB })).toBe('1.0 / 2.0 GiB');
    expect(formatDiskUsage({ diskUsed: 'x', diskTotal: 'y' })).toBe('-');
  });
});
