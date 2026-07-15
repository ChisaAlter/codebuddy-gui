import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  restoreThread: vi.fn(),
  state: {
    projectsById: {
      p1: { id: 'p1', name: 'Alpha' },
      p2: { id: 'p2', name: 'Beta' },
    },
    projectOrder: ['p1', 'p2'],
    threadsById: {
      archived: {
        id: 'archived',
        projectId: 'p1',
        title: 'Archived task',
        archivedAt: '2026-07-14T01:00:00.000Z',
        pinned: true,
      },
      active: {
        id: 'active',
        projectId: 'p1',
        title: 'Active task',
        archivedAt: null,
      },
    },
    threadOrderByProject: { p1: ['active', 'archived'], p2: [] },
  },
}));

vi.mock('../../src/store', () => ({
  useStore(selector) {
    return selector({ ...mocks.state, restoreThread: mocks.restoreThread });
  },
}));

import ReplicaArchivedView from '../../src/components/ReplicaArchivedView';

describe('ReplicaArchivedView', () => {
  let container;
  let root;

  beforeEach(async () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    mocks.restoreThread.mockReset();
    mocks.restoreThread.mockResolvedValue(true);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => root.render(<ReplicaArchivedView />));
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  });

  it('groups archived sessions by project and hides active sessions', () => {
    expect(container.textContent).toContain('Alpha');
    expect(container.textContent).toContain('Archived task');
    expect(container.textContent).not.toContain('Active task');
    expect(container.textContent).not.toContain('Beta');
  });

  it('restores an archived session', async () => {
    const button = container.querySelector('button[aria-label="恢复会话 Archived task"]');
    expect(button).toBeTruthy();
    await act(async () => button.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(mocks.restoreThread).toHaveBeenCalledWith('archived');
  });
});
