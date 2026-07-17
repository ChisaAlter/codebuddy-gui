import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  buildCodeBuddyRuntimeEnvironment,
  codeBuddyFetchOptions,
} = require('../../electron/codebuddy-runtime-manager.cjs');

describe('CodeBuddy runtime environment', () => {
  it('enables the product environment that provides remote control by default', () => {
    expect(buildCodeBuddyRuntimeEnvironment({ PATH: 'test-path' })).toEqual({
      PATH: 'test-path',
      CODEBUDDY_INTERNET_ENVIRONMENT: 'ioa',
    });
  });

  it('preserves an explicitly configured product environment', () => {
    expect(
      buildCodeBuddyRuntimeEnvironment({
        PATH: 'test-path',
        CODEBUDDY_INTERNET_ENVIRONMENT: 'custom-environment',
      }),
    ).toEqual({
      PATH: 'test-path',
      CODEBUDDY_INTERNET_ENVIRONMENT: 'custom-environment',
    });
  });

  it('keeps CodeBuddy authentication cookies on proxied requests', () => {
    expect(codeBuddyFetchOptions({ method: 'POST', headers: { Accept: 'application/json' } })).toEqual({
      method: 'POST',
      headers: { Accept: 'application/json' },
      credentials: 'include',
    });
  });
});
