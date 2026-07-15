import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  cancelSession: vi.fn(),
}));

vi.mock('../../src/store', () => ({
  useStore(selector) {
    return selector({
      timeline: [],
      activeProjectId: 'project-1',
      activeThreadId: 'thread-1',
      projectsById: { 'project-1': { id: 'project-1', name: 'Project' } },
      threadsById: { 'thread-1': { id: 'thread-1', projectId: 'project-1', draft: '' } },
      guiSettings: {},
      capabilities: {},
      connectionState: 'connected',
      currentModel: 'test-model',
      currentMode: 'default',
      sessionTitle: 'Test session',
      usage: null,
      availableCommands: [],
      sendPrompt: vi.fn(),
      cancelSession: mocks.cancelSession,
      isAwaitingResponse: true,
      models: [{ id: 'test-model', name: 'Test model' }],
      modes: [
        { id: 'default', name: 'Always Ask' },
        { id: 'acceptEdits', name: 'Accept Edits' },
        { id: 'plan', name: 'Plan' },
        { id: 'auto', name: 'Auto' },
        { id: 'dontAsk', name: "Don't Ask" },
        { id: 'bypassPermissions', name: 'Bypass Permissions' },
      ],
      setModel: vi.fn(),
      setMode: vi.fn(),
    });
  },
}));

import { useStore } from '../../src/store';
import ReplicaChatView from '../../src/components/ReplicaChatView';

useStore.getState = () => ({
  activeProjectId: 'project-1',
  activeThreadId: 'thread-1',
});

describe('ReplicaChatView cancellation', () => {
  let container;
  let root;
  let originalScrollIntoView;

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    originalScrollIntoView = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = vi.fn();
    mocks.cancelSession.mockReset();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    Element.prototype.scrollIntoView = originalScrollIntoView;
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  });

  it('cancels the active CodeBuddy session when Stop is clicked', async () => {
    await act(async () => root.render(React.createElement(ReplicaChatView)));

    const stopButton = container.querySelector('button[title="停止生成"]');
    expect(stopButton).toBeTruthy();
    expect(container.querySelector('button[title="加入待发送队列"]')).toBeNull();
    expect(container.querySelector('button[title="发送"]')).toBeNull();

    await act(async () => {
      stopButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(mocks.cancelSession).toHaveBeenCalledTimes(1);
  });

  it('shows Chinese permission modes and anchors the model picker inside the window', async () => {
    await act(async () => root.render(React.createElement(ReplicaChatView)));

    const findButton = (label) => Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent.trim() === label);
    const modeButton = findButton('始终询问');
    expect(modeButton).toBeTruthy();

    await act(async () => {
      modeButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const modeText = container.textContent;
    expect(modeText).toContain('接受编辑');
    expect(modeText).toContain('计划模式');
    expect(modeText).toContain('自动执行');
    expect(modeText).toContain('不再询问');
    expect(modeText).toContain('跳过权限确认');
    expect(modeText).not.toContain('Bypass Permissions');

    await act(async () => {
      modeButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      findButton('Test model').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const modelPicker = container.querySelector('[data-model-picker]');
    expect(modelPicker).toBeTruthy();
    expect(modelPicker.className).toContain('right-0');
    expect(modelPicker.className).not.toContain('left-0');
  });
});
