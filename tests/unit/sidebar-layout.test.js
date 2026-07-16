import { describe, expect, it } from 'vitest';
import {
  replicaSidebarFooterItems,
  replicaSidebarGroupInitiallyExpanded,
  replicaSidebarMainGroups,
  replicaSidebarWidthStyle,
} from '../../src/components/ReplicaSidebar';

describe('ReplicaSidebar layout', () => {
  it('pins collapsed and expanded widths against flex min-content growth', () => {
    expect(replicaSidebarWidthStyle(true)).toEqual({ width: 60, minWidth: 60, maxWidth: 60 });
    expect(replicaSidebarWidthStyle(false)).toEqual({
      width: 'clamp(220px, 21vw, 252px)',
      minWidth: 'clamp(220px, 21vw, 252px)',
      maxWidth: 'clamp(220px, 21vw, 252px)',
    });
  });

  it('keeps the long workspace and observability groups folded by default', () => {
    expect(replicaSidebarGroupInitiallyExpanded('primary')).toBe(true);
    expect(replicaSidebarGroupInitiallyExpanded('workspace')).toBe(false);
    expect(replicaSidebarGroupInitiallyExpanded('observability')).toBe(false);
  });

  it('moves settings and keybindings out of the scrolling navigation into the footer', () => {
    expect(replicaSidebarMainGroups().map((group) => group.id)).not.toContain('preferences');
    expect(replicaSidebarFooterItems().map((item) => item.id)).toEqual(['settings', 'keybindings']);
  });
});
