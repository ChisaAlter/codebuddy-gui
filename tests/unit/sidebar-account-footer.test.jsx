import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { version as desktopAppVersion } from '../../package.json';

const mocks = vi.hoisted(() => ({
  authenticateCodeBuddyAccount: vi.fn().mockResolvedValue(true),
  cancelCodeBuddyAccountAuth: vi.fn(),
  logout: vi.fn().mockResolvedValue(undefined),
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
    logout: mocks.logout,
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
    mocks.logout.mockReset().mockResolvedValue(undefined);
    mocks.state = baseState();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('shows Desktop product version only and no trailing ··· control', async () => {
    await act(async () => {
      root.render(
        <SidebarAccountFooter info={{ version: '2.125.0' }} connectionState="connected" />,
      );
    });
    expect(container.querySelector('[data-testid="sidebar-account-footer"]')).toBeTruthy();
    // CLI version is intentionally omitted from the identity card.
    expect(container.querySelector('[data-testid="sidebar-account-cli-version"]')).toBeNull();
    const gui = container.querySelector('[data-testid="sidebar-account-gui-version"]')?.textContent || '';
    expect(gui).toContain('CodeBuddy Desktop');
    expect(gui).toContain(`v${String(desktopAppVersion).replace(/^v/i, '')}`);
    expect(gui).not.toContain('CodeBuddy CLI');
    // No kebab / ··· action button.
    expect(container.querySelector('.sidebar-user-action--icon')).toBeNull();
    expect(container.querySelectorAll('.sidebar-user-avatar-dot')).toHaveLength(1);
  });

  it('opens site menu from the card when login is required', async () => {
    await act(async () => {
      root.render(
        <SidebarAccountFooter info={{ version: '2.125.0' }} connectionState="connected" />,
      );
    });
    const main = container.querySelector('[data-testid="sidebar-account-main"]');
    expect(main).toBeTruthy();
    await act(async () => {
      main.dispatchEvent(new MouseEvent('click', { bubbles: true }));
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

  it('shows logout in the popover when authenticated', async () => {
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
    const main = container.querySelector('[data-testid="sidebar-account-main"]');
    await act(async () => {
      main.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    const logoutBtn = container.querySelector('[data-testid="sidebar-account-logout"]');
    expect(logoutBtn?.textContent).toMatch(/退出登录/);
    await act(async () => {
      logoutBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(mocks.logout).toHaveBeenCalled();
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
  });
});
