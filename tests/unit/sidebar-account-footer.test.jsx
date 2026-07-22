import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authenticateCodeBuddyAccount: vi.fn().mockResolvedValue(true),
  cancelCodeBuddyAccountAuth: vi.fn(),
  state: null,
}));

vi.mock('../../src/store', () => {
  const useStore = (selector) => {
    if (typeof selector === 'function') return selector(mocks.state);
    return mocks.state;
  };
  useStore.getState = () => mocks.state;
  useStore.setState = (partial) => {
    mocks.state = { ...mocks.state, ...(typeof partial === 'function' ? partial(mocks.state) : partial) };
  };
  return { useStore };
});

vi.mock('../../src/components/ProjectSessionTree', () => ({
  __esModule: true,
  default: () => <div data-testid="project-session-tree" />,
}));

import {
  SidebarAccountFooter,
  sidebarAccountDotClass,
} from '../../src/components/ReplicaSidebar.jsx';

function baseState(overrides = {}) {
  return {
    codeBuddyAccountAuthState: 'required',
    codeBuddyAccountUser: null,
    codeBuddyAccountAuthError: 'need login',
    guiSettings: {
      locale: 'zh',
      accountLoginSite: 'cn',
      lastAccountUser: null,
    },
    authenticateCodeBuddyAccount: mocks.authenticateCodeBuddyAccount,
    cancelCodeBuddyAccountAuth: mocks.cancelCodeBuddyAccountAuth,
    ...overrides,
  };
}

describe('sidebarAccountDotClass', () => {
  it('maps auth states to accent colors', () => {
    expect(sidebarAccountDotClass('authenticated', 'authenticated')).toContain('accent-green');
    expect(sidebarAccountDotClass('required', 'needs_login')).toContain('accent-red');
    expect(sidebarAccountDotClass('authenticating', 'authenticating')).toContain('accent-yellow');
    expect(sidebarAccountDotClass('unknown', 'cached')).toContain('accent-yellow');
  });
});

describe('SidebarAccountFooter', () => {
  let container;
  let root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    mocks.authenticateCodeBuddyAccount.mockReset().mockResolvedValue(true);
    mocks.cancelCodeBuddyAccountAuth.mockReset();
    mocks.state = baseState();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('shows login control and site menu for needs_login', async () => {
    await act(async () => {
      root.render(
        <SidebarAccountFooter info={{ version: '2.125.0' }} connectionState="connected" />,
      );
    });
    expect(container.querySelector('[data-testid="sidebar-account-footer"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="sidebar-account-status"]')?.textContent).toMatch(
      /2\.125\.0/,
    );
    const loginBtn = container.querySelector('[data-testid="sidebar-account-login"]');
    expect(loginBtn?.textContent).toMatch(/登录/);
    await act(async () => {
      loginBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(container.querySelector('[data-testid="sidebar-account-site-menu"]')).toBeTruthy();
    const cnItem = Array.from(container.querySelectorAll('[role="menuitem"]')).find((el) =>
      /国内站/.test(el.textContent || ''),
    );
    expect(cnItem).toBeTruthy();
    await act(async () => {
      cnItem.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(mocks.authenticateCodeBuddyAccount).toHaveBeenCalledWith({ site: 'cn' });
  });

  it('shows authenticated name with version status and site menu action', async () => {
    mocks.state = baseState({
      codeBuddyAccountAuthState: 'authenticated',
      codeBuddyAccountUser: { userNickname: 'Ayase' },
      guiSettings: {
        locale: 'zh',
        accountLoginSite: 'global',
        lastAccountUser: { userNickname: 'Ayase' },
      },
    });
    await act(async () => {
      root.render(
        <SidebarAccountFooter info={{ version: '2.125.0' }} connectionState="connected" />,
      );
    });
    expect(container.querySelector('[data-testid="sidebar-account-name"]')?.textContent).toContain(
      'Ayase',
    );
    expect(container.querySelector('[data-testid="sidebar-account-status"]')?.textContent).toMatch(
      /2\.125\.0/,
    );
    expect(container.querySelector('[data-testid="sidebar-account-status"]')?.textContent).toContain(
      '国外站',
    );
    const action = container.querySelector('[data-testid="sidebar-account-login"]');
    expect(action).toBeTruthy();
    await act(async () => {
      action.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(container.querySelector('[data-testid="sidebar-account-site-menu"]')).toBeTruthy();
  });

  it('keeps cached user name when re-login is required', async () => {
    mocks.state = baseState({
      codeBuddyAccountAuthState: 'required',
      codeBuddyAccountUser: null,
      guiSettings: {
        locale: 'zh',
        accountLoginSite: 'cn',
        lastAccountUser: { userNickname: 'Chisa' },
      },
    });
    await act(async () => {
      root.render(
        <SidebarAccountFooter info={{ version: '2.125.0' }} connectionState="connected" />,
      );
    });
    expect(container.querySelector('[data-testid="sidebar-account-name"]')?.textContent).toContain(
      'Chisa',
    );
    expect(container.querySelector('[data-testid="sidebar-account-login"]')).toBeTruthy();
  });
});
