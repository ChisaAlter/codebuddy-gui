import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  buildCodeBuddyRuntimeEnvironment,
  codeBuddyFetchOptions,
} = require('../../electron/codebuddy-runtime-manager.cjs');

describe('CodeBuddy runtime environment', () => {
  it('does not force ioa product environment by default', () => {
    const env = buildCodeBuddyRuntimeEnvironment({ PATH: 'test-path' });
    expect(env.CODEBUDDY_INTERNET_ENVIRONMENT).toBeUndefined();
  });

  it('strips empty internet environment overrides so CLI defaults apply', () => {
    const env = buildCodeBuddyRuntimeEnvironment({
      PATH: 'test-path',
      CODEBUDDY_INTERNET_ENVIRONMENT: '   ',
    });
    expect(env.CODEBUDDY_INTERNET_ENVIRONMENT).toBeUndefined();
  });

  it('preserves an explicitly configured product environment', () => {
    const env = buildCodeBuddyRuntimeEnvironment({
      PATH: 'test-path',
      CODEBUDDY_INTERNET_ENVIRONMENT: 'custom-environment',
    });
    expect(env.CODEBUDDY_INTERNET_ENVIRONMENT).toBe('custom-environment');
  });

  it('keeps CodeBuddy authentication cookies on proxied requests', () => {
    expect(codeBuddyFetchOptions({ method: 'POST', headers: { Accept: 'application/json' } })).toEqual({
      method: 'POST',
      headers: { Accept: 'application/json' },
      credentials: 'include',
    });
  });
});
