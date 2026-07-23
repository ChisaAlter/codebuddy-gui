import { describe, expect, it } from 'vitest';
import {
  isNearBottom,
  resolveChatScrollRestore,
  saveChatScrollPosition,
} from '../../src/lib/chat-scroll.js';

describe('chat-scroll', () => {
  it('detects near-bottom within threshold', () => {
    expect(isNearBottom({ scrollTop: 920, scrollHeight: 1000, clientHeight: 100 })).toBe(true);
    expect(isNearBottom({ scrollTop: 0, scrollHeight: 1000, clientHeight: 100 })).toBe(false);
  });

  it('saves stickBottom when near end', () => {
    const map = new Map();
    const entry = saveChatScrollPosition(map, 't1', {
      scrollTop: 900,
      scrollHeight: 1000,
      clientHeight: 100,
    });
    expect(entry.stickBottom).toBe(true);
    expect(map.get('t1').top).toBe(900);
  });

  it('restores saved mid-scroll without jumping to top', () => {
    const restored = resolveChatScrollRestore(
      { top: 420, stickBottom: false },
      { scrollHeight: 2000, clientHeight: 400, hasMessages: true },
    );
    expect(restored.scrollTop).toBe(420);
    expect(restored.stickBottom).toBe(false);
    expect(restored.showScrollBtn).toBe(true);
  });

  it('restores stickBottom to latest max top', () => {
    const restored = resolveChatScrollRestore(
      { top: 100, stickBottom: true },
      { scrollHeight: 3000, clientHeight: 500, hasMessages: true },
    );
    expect(restored.scrollTop).toBe(2500);
    expect(restored.stickBottom).toBe(true);
    expect(restored.showScrollBtn).toBe(false);
  });

  it('defaults to bottom when no saved position and messages exist', () => {
    const restored = resolveChatScrollRestore(null, {
      scrollHeight: 1800,
      clientHeight: 400,
      hasMessages: true,
    });
    expect(restored.scrollTop).toBe(1400);
    expect(restored.stickBottom).toBe(true);
  });
});
