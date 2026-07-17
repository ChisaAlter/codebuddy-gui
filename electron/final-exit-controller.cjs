function createFinalExitController(options = {}) {
  const trayDelayMs = Number.isFinite(options.trayDelayMs) ? options.trayDelayMs : 150;
  const forceDelayMs = Number.isFinite(options.forceDelayMs) ? options.forceDelayMs : 3000;
  const setTimer = options.setTimer || setTimeout;
  const clearTimer = options.clearTimer || clearTimeout;
  const destroyTray = options.destroyTray || (() => {});
  const requestQuit = options.requestQuit || (() => {});
  const forceExit = options.forceExit || (() => {});
  let started = false;
  let quitTimer = null;
  let forceTimer = null;

  function clearTimers() {
    if (quitTimer !== null) clearTimer(quitTimer);
    if (forceTimer !== null) clearTimer(forceTimer);
    quitTimer = null;
    forceTimer = null;
  }

  return {
    start(reason = 'requested') {
      if (started) return false;
      started = true;
      destroyTray(reason);
      quitTimer = setTimer(() => {
        quitTimer = null;
        requestQuit(reason);
      }, trayDelayMs);
      forceTimer = setTimer(() => {
        forceTimer = null;
        forceExit(reason);
      }, forceDelayMs);
      return true;
    },

    complete() {
      clearTimers();
    },

    isStarted() {
      return started;
    },
  };
}

module.exports = { createFinalExitController };
