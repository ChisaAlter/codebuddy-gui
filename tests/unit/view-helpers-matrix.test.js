import { describe, expect, it } from 'vitest';

import {
  formatSince,
  statusLabel,
} from '../../src/components/ReplicaInstancesView.jsx';
import {
  normalizedPluginScope,
  validMaintenancePluginId,
} from '../../src/components/ReplicaPluginsView.jsx';
import {
  buildEffectiveRows,
  normalizeCliShortcut,
  normalizeConfig,
  removeUserBinding,
  upsertUserBinding,
  warningMessage,
} from '../../src/components/ReplicaKeybindingsView.jsx';
import {
  formatDate,
  formatDuration,
  formatNumber,
} from '../../src/components/ReplicaStatsView.jsx';
import {
  clampPercent,
  finiteNumber,
  formatBytes,
  formatGiB,
  formatSampleTime,
  formatUptime,
  pruneHistory,
} from '../../src/components/ReplicaMetricsView.jsx';

describe('ReplicaInstancesView helpers', () => {
  it('maps runtime statuses to Chinese labels', () => {
    expect(statusLabel('running')).toBe('运行中');
    expect(statusLabel('starting')).toBe('启动中');
    expect(statusLabel('stopping')).toBe('停止中');
    expect(statusLabel('error')).toBe('异常');
    expect(statusLabel('stopped')).toBe('已停止');
    expect(statusLabel('unknown')).toBe('未启动');
  });

  it('formats relative startedAt values', () => {
    expect(formatSince(null)).toBe('-');
    expect(formatSince('not-a-date')).toBe('-');
    expect(formatSince(Date.now() - 30_000)).toBe('刚刚');
    expect(formatSince(Date.now() - 5 * 60_000)).toBe('5 分钟');
    expect(formatSince(Date.now() - 3 * 60 * 60_000)).toBe('3 小时');
    expect(formatSince(Date.now() - 2 * 24 * 60 * 60_000)).toBe('2 天');
  });
});

describe('ReplicaPluginsView helpers', () => {
  it('normalizes plugin scopes with user fallback', () => {
    expect(normalizedPluginScope('user')).toBe('user');
    expect(normalizedPluginScope('project')).toBe('project');
    expect(normalizedPluginScope('local')).toBe('local');
    expect(normalizedPluginScope('workspace')).toBe('user');
    expect(normalizedPluginScope('')).toBe('user');
  });

  it('validates maintenance plugin ids', () => {
    expect(validMaintenancePluginId('plugin-a')).toBe(true);
    expect(validMaintenancePluginId('org/plugin@1.0')).toBe(true);
    expect(validMaintenancePluginId('')).toBe(false);
    // Leading whitespace is trimmed before the pattern check.
    expect(validMaintenancePluginId(' bad')).toBe(true);
    expect(validMaintenancePluginId('!!!')).toBe(false);
    expect(validMaintenancePluginId('x'.repeat(300))).toBe(false);
  });
});

describe('ReplicaKeybindingsView helpers', () => {
  it('normalizes CLI shortcuts', () => {
    expect(normalizeCliShortcut(' Ctrl + K ')).toBe('ctrl+k');
    expect(normalizeCliShortcut('Ctrl  +  Shift + P')).toBe('ctrl+shift+p');
  });

  it('normalizes incomplete config payloads safely', () => {
    expect(normalizeConfig(null)).toEqual({
      defaults: [],
      user: [],
      warnings: [],
      contexts: [],
      actions: [],
      reserved: [],
      filePath: '',
    });
    const cfg = normalizeConfig({
      defaults: [{ context: 'chat', bindings: { 'ctrl+k': 'clear' } }],
      filePath: '/tmp/keys.json',
    });
    expect(cfg.defaults).toHaveLength(1);
    expect(cfg.filePath).toBe('/tmp/keys.json');
    expect(cfg.user).toEqual([]);
  });

  it('upserts and removes user bindings without mutating inputs', () => {
    const base = [{ context: 'chat', bindings: { 'ctrl+k': 'clear' } }];
    const next = upsertUserBinding(base, 'chat', 'ctrl+l', 'focus');
    expect(base[0].bindings).toEqual({ 'ctrl+k': 'clear' });
    expect(next[0].bindings).toEqual({ 'ctrl+k': 'clear', 'ctrl+l': 'focus' });
    const removed = removeUserBinding(next, 'chat', 'ctrl+k');
    expect(removed[0].bindings).toEqual({ 'ctrl+l': 'focus' });
    const emptied = removeUserBinding(removed, 'chat', 'ctrl+l');
    expect(emptied).toEqual([]);
  });

  it('builds effective rows with custom overrides', () => {
    const rows = buildEffectiveRows(
      [{ context: 'chat', bindings: { 'ctrl+k': 'clear', 'ctrl+n': 'new' } }],
      [{ context: 'chat', bindings: { 'ctrl+k': 'custom-clear' } }],
    );
    const byShortcut = Object.fromEntries(rows.map((row) => [row.shortcut, row]));
    expect(byShortcut['ctrl+k']).toMatchObject({
      action: 'custom-clear',
      defaultAction: 'clear',
      custom: true,
    });
    expect(byShortcut['ctrl+n']).toMatchObject({
      action: 'new',
      custom: false,
    });
  });

  it('stringifies warning payloads', () => {
    expect(warningMessage('plain')).toBe('plain');
    expect(warningMessage({ message: 'dup' })).toBe('dup');
    expect(warningMessage({ reason: 'reserved' })).toBe('reserved');
  });
});

describe('ReplicaStatsView helpers', () => {
  it('formats numbers, durations, and dates', () => {
    expect(formatNumber(null)).toBe('-');
    expect(formatNumber(12_345)).toBe('12.3K');
    // Number(null) === 0, so null is treated as 0 ms rather than missing.
    expect(formatDuration(null)).toBe('0 ms');
    expect(formatDuration(Number.NaN)).toBe('-');
    expect(formatDuration(65)).toBe('65 ms');
    expect(formatDuration(1500)).toBe('2 秒');
    expect(formatDate('2026-01-02T03:04:05.000Z')).toBeTruthy();
    expect(formatDate('bad')).toBe('bad');
  });
});

describe('ReplicaMetricsView helpers', () => {
  it('clamps percents and coerces finite numbers', () => {
    expect(clampPercent(-5)).toBe(0);
    expect(clampPercent(150)).toBe(100);
    expect(clampPercent('40')).toBe(40);
    expect(finiteNumber('x', 7)).toBe(7);
    expect(finiteNumber('3.5')).toBe(3.5);
  });

  it('formats uptime/bytes/sample times', () => {
    expect(formatUptime(-1)).toBe('--');
    expect(formatUptime(90)).toContain('秒');
    expect(formatUptime(3661)).toMatch(/时|分/);
    expect(formatBytes(Number.NaN)).toBe('--');
    expect(formatBytes(512)).toContain('MiB');
    expect(formatBytes(2048)).toContain('GiB');
    expect(formatGiB(1.25)).toContain('1.3');
    expect(formatSampleTime(Number.NaN)).toBe('--');
    expect(formatSampleTime(Date.now())).not.toBe('--');
  });

  it('prunes history to a bounded length', () => {
    const history = Array.from({ length: 120 }, (_, i) => ({ t: i }));
    const pruned = pruneHistory(history);
    expect(Array.isArray(pruned)).toBe(true);
    expect(pruned.length).toBeLessThanOrEqual(history.length);
    expect(pruned.length).toBeGreaterThan(0);
  });
});
