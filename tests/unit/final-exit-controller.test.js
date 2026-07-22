import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { createFinalExitController } = require('../../electron/final-exit-controller.cjs');

function createHarness(options = {}) {
  const timers = [];
  const clearTimer = vi.fn((timer) => {
    timer.cleared = true;
  });
  const destroyTray = vi.fn();
  const requestQuit = vi.fn();
  const forceExit = vi.fn();
  const controller = createFinalExitController({
    trayDelayMs: options.trayDelayMs ?? 50,
    forceDelayMs: options.forceDelayMs ?? 1200,
    destroyTray,
    requestQuit,
    forceExit,
    setTimer(callback, delay) {
      const timer = { callback, delay, cleared: false };
      timers.push(timer);
      return timer;
    },
    clearTimer,
  });
  const runTimer = (delay) => {
    const timer = timers.find((item) => item.delay === delay);
    if (timer && !timer.cleared) timer.callback();
  };
  return { controller, clearTimer, destroyTray, forceExit, requestQuit, runTimer, timers };
}

describe('final Electron exit controller', () => {
  it('destroys the tray before asking Electron to quit', () => {
    const harness = createHarness();

    expect(harness.controller.start('tray-menu')).toBe(true);
    expect(harness.destroyTray).toHaveBeenCalledWith('tray-menu');
    expect(harness.requestQuit).not.toHaveBeenCalled();

    harness.runTimer(50);
    expect(harness.requestQuit).toHaveBeenCalledWith('tray-menu');
  });

  it('forces process exit when the normal Electron quit path stalls', () => {
    const harness = createHarness();
    harness.controller.start('tray-menu');

    harness.runTimer(1200);

    expect(harness.forceExit).toHaveBeenCalledWith('tray-menu');
  });

  it('deduplicates exit starts and clears pending fallbacks on completion', () => {
    const harness = createHarness();
    expect(harness.controller.start('first')).toBe(true);
    expect(harness.controller.start('second')).toBe(false);

    harness.controller.complete();
    harness.runTimer(50);
    harness.runTimer(1200);

    expect(harness.clearTimer).toHaveBeenCalledTimes(2);
    expect(harness.requestQuit).not.toHaveBeenCalled();
    expect(harness.forceExit).not.toHaveBeenCalled();
  });
});
