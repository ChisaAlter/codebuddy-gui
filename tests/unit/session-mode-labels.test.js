import { describe, expect, it } from 'vitest';
import {
  getSessionModeLabel,
  isCliPermissionBypassMode,
} from '../../src/lib/session-mode-labels';

describe('session mode labels', () => {
  it('maps known mode ids to Chinese labels', () => {
    expect(getSessionModeLabel('fullAccess')).toBe('完全访问');
    expect(getSessionModeLabel('bypassPermissions')).toBe('跳过权限确认');
    expect(getSessionModeLabel('default')).toBe('始终询问');
  });

  it('identifies CLI-side permission bypass modes (not GUI auto-approve)', () => {
    expect(isCliPermissionBypassMode('fullAccess')).toBe(true);
    expect(isCliPermissionBypassMode('fullAccessMode')).toBe(true);
    expect(isCliPermissionBypassMode('bypassPermissions')).toBe(true);
    expect(isCliPermissionBypassMode('bypassPermissionsMode')).toBe(true);
    expect(isCliPermissionBypassMode('default')).toBe(false);
    expect(isCliPermissionBypassMode('acceptEdits')).toBe(false);
    expect(isCliPermissionBypassMode('plan')).toBe(false);
    expect(isCliPermissionBypassMode('auto')).toBe(false);
  });
});
