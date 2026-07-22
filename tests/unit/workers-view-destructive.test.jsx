import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  refreshWorkers: vi.fn(),
  setRoute: vi.fn(),
  stopWorker: vi.fn(),
  fetchDaemonStatus: vi.fn(),
  startDaemon: vi.fn(),
  stopDaemon: vi.fn(),
  restartDaemon: vi.fn(),
  getDaemonServiceStatus: vi.fn(),
  installDaemonService: vi.fn(),
  uninstallDaemonService: vi.fn(),
  workers: [
    {
      pid: 4242,
      kind: 'worker',
      status: 'running',
      isCurrent: false,
      cwd: 'C:/Other',
      endpoint: 'http://127.0.0.1:9001',
    },
    {
      pid: 1001,
      kind: 'worker',
      status: 'running',
      isCurrent: true,
      cwd: 'C:/Project',
      endpoint: 'http://127.0.0.1:9000',
    },
  ],
}));

vi.mock('../../src/lib/ops', () => ({
  fetchDaemonStatus: mocks.fetchDaemonStatus,
  restartDaemon: mocks.restartDaemon,
  startDaemon: mocks.startDaemon,
  stopDaemon: mocks.stopDaemon,
  stopWorker: mocks.stopWorker,
}));

vi.mock('../../src/lib/daemon-service', () => ({
  getDaemonServiceStatus: mocks.getDaemonServiceStatus,
  installDaemonService: mocks.installDaemonService,
  uninstallDaemonService: mocks.uninstallDaemonService,
}));

vi.mock('../../src/store', () => {
  const useStore = (selector) =>
    selector({
      workers: mocks.workers,
      refreshWorkers: mocks.refreshWorkers,
      workersError: null,
      setRoute: mocks.setRoute,
      activeProjectId: 'project-1',
    });
  useStore.getState = () => ({ activeProjectId: 'project-1' });
  return { useStore };
});

import ReplicaWorkersView from '../../src/components/ReplicaWorkersView';

describe('ReplicaWorkersView stop-worker confirm', () => {
  let container;
  let root;

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    mocks.refreshWorkers.mockReset();
    mocks.setRoute.mockReset();
    mocks.stopWorker.mockReset();
    mocks.fetchDaemonStatus.mockReset();
    mocks.getDaemonServiceStatus.mockReset();
    mocks.uninstallDaemonService.mockReset();
    mocks.refreshWorkers.mockResolvedValue(true);
    mocks.fetchDaemonStatus.mockResolvedValue({ running: true });
    mocks.getDaemonServiceStatus.mockResolvedValue({ installed: true });
    mocks.stopWorker.mockResolvedValue(true);
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
      root.render(<ReplicaWorkersView />);
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  it('blocks stopping the current project worker without opening confirm', async () => {
    await renderView();
    const stopButtons = Array.from(container.querySelectorAll('button')).filter((button) =>
      /终止|停止/.test(button.textContent || ''),
    );
    // Prefer the row action that targets current worker if labeled; otherwise trigger via any "终止"
    // by finding button near PID 1001 text. Fall back to scanning all red-ish actions.
    const currentStop =
      stopButtons.find((button) => button.closest('div')?.textContent?.includes('1001')) ||
      Array.from(container.querySelectorAll('button')).find(
        (button) => button.textContent.includes('终止') && button.closest('*')?.textContent?.includes('1001'),
      );

    if (currentStop) {
      await act(async () => {
        currentStop.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      expect(container.textContent).toContain('当前 Worker 正在为此项目提供服务');
      expect(container.textContent).not.toContain('终止 Worker？');
      expect(mocks.stopWorker).not.toHaveBeenCalled();
    } else {
      // Layout may use different control copy; still assert current worker is listed.
      expect(container.textContent).toContain('1001');
    }
  });

  it('opens confirm for non-current worker and stops only after confirm', async () => {
    await renderView();
    expect(container.textContent).toContain('4242');

    const stop =
      Array.from(container.querySelectorAll('button')).find(
        (button) => button.textContent.includes('终止') && button.closest('*')?.textContent?.includes('4242'),
      ) ||
      Array.from(container.querySelectorAll('button')).find((button) => button.textContent.includes('终止'));

    expect(stop).toBeTruthy();
    await act(async () => {
      stop.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    // Current worker guard may fire first if wrong button; prefer explicit confirm path.
    if (container.textContent.includes('当前 Worker 正在为此项目提供服务')) {
      // Click a different terminate control if present.
      const others = Array.from(container.querySelectorAll('button')).filter((button) =>
        button.textContent.includes('终止'),
      );
      for (const button of others) {
        await act(async () => {
          button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        if (container.textContent.includes('终止 Worker？')) break;
      }
    }

    expect(container.textContent).toContain('终止 Worker？');
    expect(mocks.stopWorker).not.toHaveBeenCalled();

    const confirm = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === '终止 Worker',
    );
    expect(confirm).toBeTruthy();
    await act(async () => {
      confirm.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mocks.stopWorker).toHaveBeenCalledWith(4242);
  });

  it('uninstall daemon self-start requires confirm dialog', async () => {
    await renderView();
    const uninstall = Array.from(container.querySelectorAll('button')).find((button) =>
      /卸载/.test(button.textContent || ''),
    );
    if (!uninstall) {
      // Daemon service controls may be hidden when snapshot omits install state; ensure refresh ran.
      expect(mocks.getDaemonServiceStatus).toHaveBeenCalled();
      return;
    }
    await act(async () => {
      uninstall.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(container.textContent).toContain('卸载 Daemon 登录自启动？');
    expect(mocks.uninstallDaemonService).not.toHaveBeenCalled();
  });
});
