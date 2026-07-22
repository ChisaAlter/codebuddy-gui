import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  refreshTasks: vi.fn().mockResolvedValue(true),
  createTask: vi.fn().mockResolvedValue(true),
  deleteTask: vi.fn().mockResolvedValue(true),
  refreshTaskTemplatesNow: vi.fn().mockResolvedValue(true),
  scheduledTasks: [{ taskId: 'task-1', cron: '0 9 * * *', prompt: 'daily' }],
  sessionId: 'session-1',
}));

vi.mock('../../src/store', () => {
  const useStore = (selector) =>
    selector({
      scheduledTasks: mocks.scheduledTasks,
      scheduledTasksError: null,
      sessionId: mocks.sessionId,
      refreshTasks: mocks.refreshTasks,
      createTask: mocks.createTask,
      deleteTask: mocks.deleteTask,
      taskTemplates: [],
      taskTemplatesError: null,
      taskTemplatesLoading: false,
      refreshTaskTemplatesNow: mocks.refreshTaskTemplatesNow,
      activeThreadId: 'thread-1',
    });
  useStore.getState = () => ({ activeThreadId: 'thread-1' });
  return { useStore };
});

import ReplicaTasksView from '../../src/components/ReplicaTasksView';

describe('ReplicaTasksView delete confirm', () => {
  let container;
  let root;

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    mocks.refreshTasks.mockClear();
    mocks.deleteTask.mockClear();
    mocks.createTask.mockClear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  });

  async function renderView() {
    await act(async () => {
      root.render(<ReplicaTasksView />);
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  it('opens delete confirm and only deletes after confirm', async () => {
    await renderView();
    expect(container.textContent).toContain('任务');

    const deleteButton = Array.from(container.querySelectorAll('button')).find((button) =>
      /删除/.test(button.textContent || ''),
    );
    expect(deleteButton).toBeTruthy();
    await act(async () => {
      deleteButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(container.textContent).toMatch(/删除|确认|定时任务/);
    expect(mocks.deleteTask).not.toHaveBeenCalled();

    const confirm = Array.from(container.querySelectorAll('button')).find((button) =>
      /删除|确认/.test(button.textContent || '') && button !== deleteButton,
    );
    expect(confirm).toBeTruthy();
    await act(async () => {
      confirm.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mocks.deleteTask).toHaveBeenCalledWith('task-1');
  });

  it('disables create when sessionId is missing', async () => {
    mocks.sessionId = null;
    await renderView();
    const create = Array.from(container.querySelectorAll('button')).find((button) =>
      /创建任务/.test(button.textContent || ''),
    );
    expect(create?.disabled).toBe(true);
    mocks.sessionId = 'session-1';
  });
});
