/** Per-thread chat transcript scroll memory (survives route unmount). */

const NEAR_BOTTOM_PX = 80;

/**
 * @param {{ scrollTop: number, scrollHeight: number, clientHeight: number }} metrics
 */
export function isNearBottom(metrics, threshold = NEAR_BOTTOM_PX) {
  const scrollTop = Number(metrics?.scrollTop) || 0;
  const scrollHeight = Number(metrics?.scrollHeight) || 0;
  const clientHeight = Number(metrics?.clientHeight) || 0;
  return scrollHeight - scrollTop - clientHeight < threshold;
}

/**
 * @param {Map<string, object>} map
 * @param {string} threadId
 * @param {{ scrollTop: number, scrollHeight: number, clientHeight: number }} metrics
 */
export function saveChatScrollPosition(map, threadId, metrics) {
  const id = String(threadId || '').trim();
  if (!id || !map || typeof map.set !== 'function') return null;
  const scrollTop = Math.max(0, Number(metrics?.scrollTop) || 0);
  const scrollHeight = Math.max(0, Number(metrics?.scrollHeight) || 0);
  const clientHeight = Math.max(0, Number(metrics?.clientHeight) || 0);
  const stickBottom = isNearBottom({ scrollTop, scrollHeight, clientHeight });
  const entry = { top: scrollTop, height: scrollHeight, stickBottom, savedAt: Date.now() };
  map.set(id, entry);
  return entry;
}

/**
 * @param {{ top?: number, stickBottom?: boolean } | null | undefined} saved
 * @param {{ scrollHeight: number, clientHeight: number, hasMessages?: boolean }} layout
 * @returns {{ scrollTop: number, stickBottom: boolean, showScrollBtn: boolean }}
 */
export function resolveChatScrollRestore(saved, layout) {
  const scrollHeight = Math.max(0, Number(layout?.scrollHeight) || 0);
  const clientHeight = Math.max(0, Number(layout?.clientHeight) || 0);
  const maxTop = Math.max(0, scrollHeight - clientHeight);
  const hasMessages = layout?.hasMessages !== false;

  // No saved position: chat convention is open at latest (bottom) when there is content.
  if (!saved || typeof saved !== 'object') {
    if (!hasMessages || maxTop <= 0) {
      return { scrollTop: 0, stickBottom: true, showScrollBtn: false };
    }
    return { scrollTop: maxTop, stickBottom: true, showScrollBtn: false };
  }

  if (saved.stickBottom) {
    return { scrollTop: maxTop, stickBottom: true, showScrollBtn: false };
  }

  const top = Math.min(Math.max(0, Number(saved.top) || 0), maxTop);
  const stickBottom = isNearBottom({ scrollTop: top, scrollHeight, clientHeight });
  return {
    scrollTop: stickBottom ? maxTop : top,
    stickBottom,
    showScrollBtn: !stickBottom && maxTop > 0,
  };
}
