function createFinalExitController(options = {}) {
  // Destroy tray immediately, then give Electron a brief moment to run before-quit.
  const trayDelayMs = Number.isFinite(options.trayDelayMs) ? options.trayDelayMs : 50;
  // Hard kill if app.quit() stalls (runtime stop / window close).
  const forceDelayMs = Number.isFinite(options.forceDelayMs) ? options.forceDelayMs : 1200;
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
