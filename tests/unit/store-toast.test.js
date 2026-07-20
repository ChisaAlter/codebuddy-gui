import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useStore } from '../../src/store';

describe('toast notifications', () => {
  beforeEach(() => {
    useStore.setState({ toasts: [] });
  });

  it('pushes and auto-dismisses toast entries', () => {
    vi.useFakeTimers();
    const id = useStore.getState().pushToast({ type: 'error', message: '新会话连接失败，请重试', durationMs: 1000 });
    expect(id).toBeTruthy();
    expect(useStore.getState().toasts).toEqual([
      expect.objectContaining({ id, type: 'error', message: '新会话连接失败，请重试' }),
    ]);

    vi.advanceTimersByTime(1000);
    expect(useStore.getState().toasts).toEqual([]);
    vi.useRealTimers();
  });

  it('ignores empty toast messages', () => {
    expect(useStore.getState().pushToast({ message: '   ' })).toBeNull();
    expect(useStore.getState().toasts).toEqual([]);
  });
});
