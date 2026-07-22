import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  listSandboxes: vi.fn(),
  killSandbox: vi.fn(),
  cleanSandboxes: vi.fn(),
}));

vi.mock('../../src/lib/sandbox', async () => {
  const actual = await vi.importActual('../../src/lib/sandbox');
  return {
    ...actual,
    listSandboxes: mocks.listSandboxes,
    killSandbox: mocks.killSandbox,
    cleanSandboxes: mocks.cleanSandboxes,
  };
});

import ReplicaSandboxesView from '../../src/components/ReplicaSandboxesView';

describe('ReplicaSandboxesView kill/clean confirm', () => {
  let container;
  let root;

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    mocks.listSandboxes.mockReset();
    mocks.killSandbox.mockReset();
    mocks.cleanSandboxes.mockReset();
    mocks.listSandboxes.mockResolvedValue({
      statePath: 'C:/Users/test/.codebuddy/sandboxes.json',
      stateExists: true,
      currentSandboxId: 'box-current',
      aliases: [],
      sandboxes: [
        {
          sandboxId: 'box-current',
          current: true,
          templateName: 'base',
          aliases: ['dev'],
          projects: [],
          createdAt: '2026-01-01T00:00:00.000Z',
          lastUsedAt: '2026-01-02T00:00:00.000Z',
        },
      ],
    });
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
      root.render(<ReplicaSandboxesView />);
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  it('confirms kill then calls killSandbox and refreshes notice', async () => {
    await renderView();
    expect(container.textContent).toContain('box-current');

    const killButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === '终止',
    );
    await act(async () => {
      killButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(container.textContent).toContain('终止 Sandbox？');
    expect(container.textContent).toContain('这是当前 Sandbox');

    mocks.killSandbox.mockResolvedValue({
      output: 'killed',
      snapshot: { sandboxes: [], aliases: [] },
    });

    const confirm = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === '终止 Sandbox',
    );
    await act(async () => {
      confirm.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.killSandbox).toHaveBeenCalledWith('box-current');
    expect(container.textContent).toContain('killed');
    expect(container.textContent).not.toContain('终止 Sandbox？');
  });

  it('shows rewritten E2B_API_KEY error on kill failure', async () => {
    await renderView();
    const killButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === '终止',
    );
    await act(async () => {
      killButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    mocks.killSandbox.mockRejectedValue(new Error('E2B_API_KEY environment variable is required'));
    const confirm = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === '终止 Sandbox',
    );
    await act(async () => {
      confirm.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.textContent).toContain('缺少 E2B_API_KEY');
  });

  it('opens clean confirm and calls cleanSandboxes', async () => {
    await renderView();
    const cleanButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === '清理失效记录',
    );
    await act(async () => {
      cleanButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(container.textContent).toContain('清理失效 Sandbox 记录？');

    mocks.cleanSandboxes.mockResolvedValue({
      output: 'removed 1',
      snapshot: { sandboxes: [], aliases: [] },
    });
    const confirm = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === '开始清理',
    );
    await act(async () => {
      confirm.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mocks.cleanSandboxes).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('removed 1');
  });
});
