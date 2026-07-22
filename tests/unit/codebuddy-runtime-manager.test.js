import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  buildCodeBuddyRuntimeEnvironment,
  codeBuddyFetchOptions,
} = require('../../electron/codebuddy-runtime-manager.cjs');

describe('CodeBuddy runtime environment', () => {
  // Isolate every case from real disk OAuth under the developer's LOCALAPPDATA.
  const isolated = {
    LOCALAPPDATA: 'C:\\__no_auth__',
    USERPROFILE: 'C:\\__no_user__',
    APPDATA: 'C:\\__no_appdata__',
  };

  it('does not force ioa product environment by default', () => {
    const env = buildCodeBuddyRuntimeEnvironment({ PATH: 'test-path', ...isolated });
    expect(env.CODEBUDDY_INTERNET_ENVIRONMENT).toBeUndefined();
  });

  it('strips empty internet environment overrides so CLI defaults apply', () => {
    const env = buildCodeBuddyRuntimeEnvironment({
      PATH: 'test-path',
      CODEBUDDY_INTERNET_ENVIRONMENT: '   ',
      ...isolated,
    });
    expect(env.CODEBUDDY_INTERNET_ENVIRONMENT).toBeUndefined();
  });

  it('preserves an explicitly configured product environment', () => {
    const env = buildCodeBuddyRuntimeEnvironment({
      PATH: 'test-path',
      CODEBUDDY_INTERNET_ENVIRONMENT: 'custom-environment',
      ...isolated,
    });
    expect(env.CODEBUDDY_INTERNET_ENVIRONMENT).toBe('custom-environment');
  });

  it('maps accountLoginSite cn to internal and global to unset', () => {
    const baseEnv = {
      PATH: 'test-path',
      CODEBUDDY_INTERNET_ENVIRONMENT: 'custom-environment',
      ...isolated,
    };
    const cn = buildCodeBuddyRuntimeEnvironment(baseEnv, { accountLoginSite: 'cn' });
    expect(cn.CODEBUDDY_INTERNET_ENVIRONMENT).toBe('internal');

    const globalEnv = buildCodeBuddyRuntimeEnvironment(baseEnv, { accountLoginSite: 'global' });
    expect(globalEnv.CODEBUDDY_INTERNET_ENVIRONMENT).toBeUndefined();
  });

  it('keeps CodeBuddy authentication cookies on proxied requests', () => {
    expect(codeBuddyFetchOptions({ method: 'POST', headers: { Accept: 'application/json' } })).toEqual({
      method: 'POST',
      headers: { Accept: 'application/json' },
      credentials: 'include',
    });
  });
});
