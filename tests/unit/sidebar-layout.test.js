import { describe, expect, it } from 'vitest';
import { replicaSidebarWidthStyle } from '../../src/components/ReplicaSidebar';

describe('ReplicaSidebar layout', () => {
  it('pins collapsed and expanded widths against flex min-content growth', () => {
    expect(replicaSidebarWidthStyle(true)).toEqual({ width: 60, minWidth: 60, maxWidth: 60 });
    expect(replicaSidebarWidthStyle(false)).toEqual({
      width: 'clamp(220px, 21vw, 252px)',
      minWidth: 'clamp(220px, 21vw, 252px)',
      maxWidth: 'clamp(220px, 21vw, 252px)',
    });
  });
});