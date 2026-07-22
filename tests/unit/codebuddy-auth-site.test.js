import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import {
  accountLoginSiteFromAuthDomain,
  accountLoginSiteFromAuthMethodId,
} from '../../src/lib/account-auth';

const require = createRequire(import.meta.url);
const {
  accountLoginSiteFromAuthPayload,
  isChinaAuthDomain,
  isInternationalAuthDomain,
  resolveAccountLoginSiteForRuntime,
} = require('../../electron/codebuddy-auth-site.cjs');

describe('codebuddy auth site detection', () => {
  it('maps China / international domains', () => {
    expect(isChinaAuthDomain('www.codebuddy.cn')).toBe(true);
    expect(isChinaAuthDomain('copilot.tencent.com')).toBe(true);
    expect(isInternationalAuthDomain('www.codebuddy.ai')).toBe(true);
    expect(accountLoginSiteFromAuthDomain('www.codebuddy.cn')).toBe('cn');
    expect(accountLoginSiteFromAuthDomain('www.codebuddy.ai')).toBe('global');
    expect(accountLoginSiteFromAuthMethodId('internal')).toBe('cn');
    expect(accountLoginSiteFromAuthMethodId('external')).toBe('global');
  });

  it('reads site from auth payload', () => {
    expect(
      accountLoginSiteFromAuthPayload({
        auth: { domain: 'www.codebuddy.cn' },
        account: { uid: 'u1' },
      }),
    ).toBe('cn');
    expect(
      accountLoginSiteFromAuthPayload({
        auth: { domain: 'www.codebuddy.ai' },
        account: { uid: 'u1' },
      }),
    ).toBe('global');
  });

  it('uses preference when no disk auth is present', () => {
    const site = resolveAccountLoginSiteForRuntime('global', {
      LOCALAPPDATA: 'C:\\__no_such_auth_root__',
      USERPROFILE: 'C:\\__no_such_user__',
      APPDATA: 'C:\\__no_appdata__',
    });
    expect(site).toBe('global');
    expect(
      resolveAccountLoginSiteForRuntime(null, {
        LOCALAPPDATA: 'C:\\__no_such_auth_root__',
        USERPROFILE: 'C:\\__no_such_user__',
        APPDATA: 'C:\\__no_appdata__',
      }),
    ).toBeNull();
  });
});
