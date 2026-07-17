function createQuitRequestController(options = {}) {
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : 8000;
  const setTimer = options.setTimer || setTimeout;
  const clearTimer = options.clearTimer || clearTimeout;
  const now = options.now || Date.now;
  const onTimeout = options.onTimeout || (() => {});
  let sequence = 0;
  let pending = null;

  function clearPending() {
    if (!pending) return null;
    const current = pending;
    pending = null;
    if (current.timer !== null) clearTimer(current.timer);
    return current;
  }

  function matches(requestId) {
    return Boolean(pending && requestId && pending.requestId === requestId);
  }

  return {
    begin() {
      if (pending) return { started: false, requestId: pending.requestId };
      sequence += 1;
      const requestId = `quit-${now()}-${sequence}`;
      let timer = null;
      timer = setTimer(() => {
        if (!matches(requestId) || pending.timer !== timer) return;
        pending = null;
        onTimeout(requestId);
      }, timeoutMs);
      pending = { requestId, timer };
      return { started: true, requestId };
    },

    confirm(requestId) {
      if (!matches(requestId)) return false;
      clearPending();
      return true;
    },

    acknowledge(requestId) {
      if (!matches(requestId)) return false;
      if (pending.timer !== null) clearTimer(pending.timer);
      pending.timer = null;
      return true;
    },

    cancel(requestId) {
      if (!matches(requestId)) return false;
      clearPending();
      return true;
    },

    hasPending() {
      return Boolean(pending);
    },

    currentRequestId() {
      return pending?.requestId || null;
    },
  };
}

module.exports = { createQuitRequestController };
