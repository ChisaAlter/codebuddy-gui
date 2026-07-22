import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  listMcpConfigs: vi.fn(),
  fetchMcpStatus: vi.fn(),
  removeMcpServer: vi.fn(),
  addMcpServer: vi.fn(),
  fetchMcpTools: vi.fn(),
  activeProjectId: 'project-1',
  workspacePath: 'C:/Project',
  connectionState: 'connected',
}));

vi.mock('../../src/lib/mcp', () => ({
  listMcpConfigs: mocks.listMcpConfigs,
  fetchMcpStatus: mocks.fetchMcpStatus,
  removeMcpServer: mocks.removeMcpServer,
  addMcpServer: mocks.addMcpServer,
  fetchMcpTools: mocks.fetchMcpTools,
}));

vi.mock('../../src/store', () => ({
  useStore(selector) {
    return selector({
      activeProjectId: mocks.activeProjectId,
      workspacePath: mocks.workspacePath,
      connectionState: mocks.connectionState,
    });
  },
}));

import { useStore } from '../../src/store';
import ReplicaMcpView from '../../src/components/ReplicaMcpView';

useStore.getState = () => ({
  activeProjectId: mocks.activeProjectId,
  workspacePath: mocks.workspacePath,
  connectionState: mocks.connectionState,
});

describe('ReplicaMcpView destructive delete confirm', () => {
  let container;
  let root;

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    mocks.activeProjectId = 'project-1';
    mocks.workspacePath = 'C:/Project';
    mocks.connectionState = 'connected';
    mocks.listMcpConfigs.mockReset();
    mocks.fetchMcpStatus.mockReset();
    mocks.removeMcpServer.mockReset();
    mocks.addMcpServer.mockReset();
    mocks.fetchMcpTools.mockReset();
    mocks.listMcpConfigs.mockResolvedValue({
      servers: [
        {
          name: 'filesystem',
          scope: 'local',
          disabled: false,
          config: {
            type: 'stdio',
            command: 'npx',
            args: [],
            envKeys: [],
            headerKeys: [],
          },
        },
      ],
      locations: { local: 'C:/Project/.codebuddy/mcp.json' },
      errors: [],
    });
    mocks.fetchMcpStatus.mockResolvedValue({ status: 'connected', needsAuth: false });
    mocks.removeMcpServer.mockResolvedValue(undefined);
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
      root.render(<ReplicaMcpView />);
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });
  }

  it('opens delete confirm and removes only after confirm', async () => {
    await renderView();
    expect(container.textContent).toContain('filesystem');

    const deleteButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === '删除',
    );
    expect(deleteButton).toBeTruthy();

    await act(async () => {
      deleteButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(container.textContent).toContain('删除 MCP 服务器？');
    expect(mocks.removeMcpServer).not.toHaveBeenCalled();

    // First confirm returns a still-present server so UI reports failure; then empty list.
    mocks.listMcpConfigs
      .mockResolvedValueOnce({
        servers: [
          {
            name: 'filesystem',
            scope: 'local',
            disabled: false,
            config: { type: 'stdio', command: 'npx', args: [], envKeys: [], headerKeys: [] },
          },
        ],
        locations: {},
        errors: [],
      })
      .mockResolvedValueOnce({ servers: [], locations: {}, errors: [] });

    const confirm = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === '删除服务器',
    );
    expect(confirm).toBeTruthy();

    await act(async () => {
      confirm.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.removeMcpServer).toHaveBeenCalledWith('filesystem', 'local');
    expect(container.textContent).toContain('CodeBuddy 未删除 MCP 配置');
  });

  it('cancels delete without calling removeMcpServer', async () => {
    await renderView();
    const deleteButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === '删除',
    );
    await act(async () => {
      deleteButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    const cancel = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === '取消',
    );
    await act(async () => {
      cancel.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(mocks.removeMcpServer).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain('删除 MCP 服务器？');
  });

  it('disables write actions when runtime is disconnected', async () => {
    mocks.connectionState = 'disconnected';
    await renderView();
    const add = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent.includes('添加服务器'),
    );
    const deleteButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === '删除',
    );
    expect(add?.disabled).toBe(true);
    expect(deleteButton?.disabled).toBe(true);
    expect(container.textContent).toContain('写操作和工具状态暂不可用');
  });
});
