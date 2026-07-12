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
      modes: [],
      setModel: vi.fn(),
      setMode: vi.fn(),
    });
  },
}));

import ReplicaChatView from '../../src/components/ReplicaChatView';

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

    await act(async () => {
      stopButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(mocks.cancelSession).toHaveBeenCalledTimes(1);
  });
});
