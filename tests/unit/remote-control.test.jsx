import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fetchJson: vi.fn(),
}));

vi.mock('../../src/lib/acp', () => ({
  fetchJson: mocks.fetchJson,
}));

vi.mock('../../src/lib/ops', () => ({
  createWechatChannel: vi.fn(),
  fetchWechatQr: vi.fn(),
  createWecomChannel: vi.fn(),
  channelAction: vi.fn(),
  deleteChannelInstance: vi.fn(),
}));

vi.mock('../../src/store', () => ({
  useStore(selector) {
    return selector({
      activeProjectId: 'project-1',
      setRoute: vi.fn(),
    });
  },
}));

import { useStore } from '../../src/store';
import ReplicaRemoteControlView from '../../src/components/ReplicaRemoteControlView';

useStore.getState = () => ({ activeProjectId: 'project-1' });

describe('ReplicaRemoteControlView', () => {
  let container;
  let root;

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    mocks.fetchJson.mockReset();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  });

  it('keeps remote-control actions available when stale capability metadata says disabled', async () => {
    mocks.fetchJson.mockResolvedValue({
      clients: [],
      capabilities: {
        remoteControlEnabled: false,
        canAddWechatBot: false,
        canAddWecomBot: false,
      },
    });

    await act(async () => {
      root.render(<ReplicaRemoteControlView />);
      await Promise.resolve();
    });

    expect(container.textContent).not.toContain('当前 CodeBuddy 产品配置未启用远程控制');
    expect(container.textContent).toContain('创建并显示二维码');
    expect(container.textContent).toContain('创建企微机器人');
    expect(container.textContent).toContain('微信机器人');
    expect(container.textContent).toContain('企业微信机器人');
  });
});
