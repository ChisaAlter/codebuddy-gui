import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectSessionTree } from '../../src/components/ProjectSessionTree';

const projectsById = {
  p1: { id: 'p1', name: 'Alpha', workspacePath: 'C:/Alpha', preferences: { sidebarExpanded: true } },
  p2: { id: 'p2', name: 'Beta', workspacePath: 'C:/Beta', preferences: { sidebarExpanded: false } },
};
const projectOrder = ['p1', 'p2'];
const threadsById = {
  running: { id: 'running', projectId: 'p1', title: 'Running task', status: 'running', pinned: true, archivedAt: null },
  unread: { id: 'unread', projectId: 'p1', title: 'Unread task', status: 'idle', unread: true, pinned: false, archivedAt: null },
  archived: { id: 'archived', projectId: 'p1', title: 'Archived task', status: 'idle', pinned: false, archivedAt: '2026-07-14T01:00:00.000Z' },
  folded: { id: 'folded', projectId: 'p2', title: 'Hidden by fold', status: 'idle', pinned: false, archivedAt: null },
};
const threadOrderByProject = { p1: ['unread', 'archived', 'running'], p2: ['folded'] };

describe('ProjectSessionTree', () => {
  let container;
  let root;
  let props;

  beforeEach(async () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    props = {
      projectsById,
      projectOrder,
      threadsById,
      threadOrderByProject,
      activeProjectId: 'p1',
      activeThreadId: 'unread',
      projectNavigationBusy: false,
      projectNavigationTargetId: null,
      onToggleProject: vi.fn(),
      onActivateThread: vi.fn(),
      onPinThread: vi.fn().mockResolvedValue(true),
      onArchiveThread: vi.fn().mockResolvedValue(true),
      onRenameThread: vi.fn().mockResolvedValue(true),
      onDeleteThread: vi.fn().mockResolvedValue(true),
      onCreateProjectThread: vi.fn().mockResolvedValue(true),
      onOpenProjectMenu: vi.fn(),
    };
    await act(async () => root.render(<ProjectSessionTree {...props} />));
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  });

  it('renders expanded project sessions with stable pinned-first order', () => {
    const rows = [...container.querySelectorAll('[data-session-row]')];
    expect(rows.map((row) => row.getAttribute('data-session-id'))).toEqual(['running', 'unread']);
    expect(container.textContent).not.toContain('Archived task');
    expect(container.textContent).not.toContain('Hidden by fold');
  });

  it('shows running and unread indicators at the end of session rows', () => {
    expect(container.querySelector('[aria-label="AI处理中"]')).toBeTruthy();
    expect(container.querySelector('[aria-label="未读更新"]')).toBeTruthy();
  });

  it('exposes pin and archive hover actions', () => {
    expect(container.querySelector('button[aria-label="取消置顶会话"]')).toBeTruthy();
    expect(container.querySelector('button[aria-label="置顶会话"]')).toBeTruthy();
    expect(container.querySelectorAll('button[aria-label="归档会话"]')).toHaveLength(2);
  });

  it('toggles a project without activating it', async () => {
    const projectButton = container.querySelector('button[aria-label="折叠项目 Alpha"]');
    await act(async () => projectButton.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(props.onToggleProject).toHaveBeenCalledWith('p1', false);
    expect(props.onActivateThread).not.toHaveBeenCalled();
  });

  it('does not highlight the project row when its active conversation already carries selection', () => {
    const projectButton = container.querySelector('button[aria-label="折叠项目 Alpha"]');
    expect(projectButton.getAttribute('data-active-highlight')).toBe('false');
  });

  it('matches project and conversation text size with the primary navigation', () => {
    const projectButton = container.querySelector('button[aria-label="折叠项目 Alpha"]');
    const threadButton = container.querySelector('[data-session-id="unread"] > button');
    expect(projectButton.className).toContain('text-[13px]');
    expect(threadButton.className).toContain('text-[13px]');
  });

  it('can highlight the active project when no conversation is selected', async () => {
    await act(async () => root.render(<ProjectSessionTree {...props} activeThreadId={null} />));
    const projectButton = container.querySelector('button[aria-label="折叠项目 Alpha"]');
    expect(projectButton.getAttribute('data-active-highlight')).toBe('true');
  });

  it('opens rename and delete actions on right click', async () => {
    const row = container.querySelector('[data-session-id="unread"]');
    await act(async () => row.dispatchEvent(new MouseEvent('contextmenu', {
      bubbles: true,
      clientX: 80,
      clientY: 100,
    })));

    expect(document.body.querySelector('[role="menu"]')).toBeTruthy();
    expect(document.body.querySelector('[role="menuitem"][data-action="rename"]')).toBeTruthy();
    expect(document.body.querySelector('[role="menuitem"][data-action="delete"]')).toBeTruthy();
  });

  it('limits long project histories until the user expands them', async () => {
    const manyThreads = Object.fromEntries(Array.from({ length: 10 }, (_, index) => [
      `thread-${index}`,
      { id: `thread-${index}`, projectId: 'p1', title: `Thread ${index}`, status: 'idle', pinned: false, archivedAt: null },
    ]));
    await act(async () => root.render(<ProjectSessionTree
      {...props}
      threadsById={manyThreads}
      threadOrderByProject={{ p1: Object.keys(manyThreads), p2: [] }}
    />));

    expect(container.querySelectorAll('[data-session-row]')).toHaveLength(8);
    const expandButton = container.querySelector('button[aria-label="展开 Alpha 的全部会话"]');
    expect(expandButton).toBeTruthy();
    await act(async () => expandButton.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(container.querySelectorAll('[data-session-row]')).toHaveLength(10);
  });

  it('offers a new session action for an expanded project with no visible sessions', async () => {
    await act(async () => root.render(<ProjectSessionTree
      {...props}
      projectsById={{ p2: { ...projectsById.p2, preferences: { sidebarExpanded: true } } }}
      projectOrder={['p2']}
      threadsById={{}}
      threadOrderByProject={{ p2: [] }}
    />));

    const button = container.querySelector('button[aria-label="在 Beta 中新建会话"]');
    expect(button).toBeTruthy();
    await act(async () => button.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(props.onCreateProjectThread).toHaveBeenCalledWith('p2');
  });
});
