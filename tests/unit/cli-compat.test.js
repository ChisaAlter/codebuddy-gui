import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  MIN_VERSION,
  RECOMMENDED_VERSION,
  compareVersions,
  buildCompatStatus,
  assertCliCompatibleForRuntime,
} = require('../../electron/cli-compat.cjs');

describe('cli-compat', () => {
  it('compares semver-ish versions', () => {
    expect(compareVersions('2.122.0', '2.121.9')).toBe(1);
    expect(compareVersions('2.122.0', '2.122.0')).toBe(0);
    expect(compareVersions('2.121.0', '2.122.0')).toBe(-1);
    expect(compareVersions('v2.122.0', '2.122.0')).toBe(0);
  });

  it('marks versions below min as outdated', () => {
    const compat = buildCompatStatus('2.100.0');
    expect(compat.status).toBe('outdated');
    expect(compat.minVersion).toBe(MIN_VERSION);
    expect(compat.recommendedVersion).toBe(RECOMMENDED_VERSION);
    expect(compat.message).toContain(MIN_VERSION);
  });

  it('marks exact recommended as ok and higher as newer', () => {
    expect(buildCompatStatus(RECOMMENDED_VERSION).status).toBe('ok');
    expect(buildCompatStatus('9.9.9').status).toBe('newer');
  });

  it('marks missing and unknown separately', () => {
    expect(buildCompatStatus(null, { missing: true }).status).toBe('missing');
    expect(buildCompatStatus(null, { unknown: true }).status).toBe('unknown');
  });

  it('only blocks missing/outdated/unknown for runtime start', () => {
    expect(() => assertCliCompatibleForRuntime(buildCompatStatus(RECOMMENDED_VERSION))).not.toThrow();
    expect(() => assertCliCompatibleForRuntime(buildCompatStatus('9.9.9'))).not.toThrow();
    expect(() => assertCliCompatibleForRuntime(buildCompatStatus('1.0.0'))).toThrow(/最低支持版本/);
    expect(() => assertCliCompatibleForRuntime(buildCompatStatus(null, { missing: true }))).toThrow(/未找到/);
  });
});
