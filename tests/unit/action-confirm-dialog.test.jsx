import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ActionConfirmDialog from '../../src/components/ActionConfirmDialog.jsx';

describe('ActionConfirmDialog', () => {
  let container;
  let root;

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  });

  it('focuses the cancel button when opened', async () => {
    await act(async () => {
      root.render(
        <ActionConfirmDialog open title="删除项目" description="此操作不可撤销" onCancel={() => {}} onConfirm={() => {}} />,
      );
    });
    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    });

    const cancel = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === '取消');
    expect(cancel).toBeTruthy();
    expect(document.activeElement).toBe(cancel);
  });

  it('cancels on Escape when not busy', async () => {
    const onCancel = vi.fn();
    await act(async () => {
      root.render(
        <ActionConfirmDialog open title="删除" description="确认删除" onCancel={onCancel} onConfirm={() => {}} />,
      );
    });

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('ignores Escape while busy', async () => {
    const onCancel = vi.fn();
    await act(async () => {
      root.render(
        <ActionConfirmDialog open busy title="删除" description="确认删除" onCancel={onCancel} onConfirm={() => {}} />,
      );
    });

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });

    expect(onCancel).not.toHaveBeenCalled();
  });
});
