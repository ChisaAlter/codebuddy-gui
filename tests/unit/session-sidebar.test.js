import { describe, expect, it } from 'vitest';
import {
  archivedProjectThreads,
  projectSidebarExpanded,
  visibleProjectThreads,
} from '../../src/lib/session-sidebar';

const order = { p1: ['normal-1', 'pinned-1', 'archived', 'pinned-2', 'normal-2'] };
const threads = {
  'normal-1': { id: 'normal-1', projectId: 'p1', pinned: false, archivedAt: null },
  'pinned-1': { id: 'pinned-1', projectId: 'p1', pinned: true, archivedAt: null },
  archived: { id: 'archived', projectId: 'p1', pinned: true, archivedAt: '2026-07-14T01:00:00.000Z' },
  'pinned-2': { id: 'pinned-2', projectId: 'p1', pinned: true, archivedAt: null },
  'normal-2': { id: 'normal-2', projectId: 'p1', pinned: false, archivedAt: null },
};

describe('session sidebar selectors', () => {
  it('treats projects as expanded unless explicitly folded', () => {
    expect(projectSidebarExpanded({ preferences: {} })).toBe(true);
    expect(projectSidebarExpanded({ preferences: { sidebarExpanded: false } })).toBe(false);
  });

  it('filters archived threads and keeps pinned groups stable', () => {
    expect(visibleProjectThreads('p1', order, threads).map((thread) => thread.id)).toEqual([
      'pinned-1',
      'pinned-2',
      'normal-1',
      'normal-2',
    ]);
  });

  it('returns only archived threads in their original order', () => {
    expect(archivedProjectThreads('p1', order, threads).map((thread) => thread.id)).toEqual(['archived']);
  });
});
