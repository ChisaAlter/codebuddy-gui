import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { highlightText } from '../../src/components/ReplicaLogsView.jsx';

describe('ReplicaLogsView highlightText', () => {
  it('returns original text when term is empty', () => {
    expect(highlightText('hello world', '')).toBe('hello world');
    expect(highlightText('hello world', null)).toBe('hello world');
  });

  it('wraps case-insensitive matches in mark nodes', () => {
    const html = renderToStaticMarkup(<>{highlightText('Error: boom ERROR again', 'error')}</>);
    expect(html).toContain('<mark');
    expect(html.toLowerCase()).toContain('error');
    expect((html.match(/<mark/g) || []).length).toBeGreaterThanOrEqual(2);
  });

  it('escapes regex metacharacters in the search term', () => {
    const html = renderToStaticMarkup(<>{highlightText('price is $5.00 today', '$5.00')}</>);
    expect(html).toContain('<mark');
    expect(html).toContain('$5.00');
  });
});
