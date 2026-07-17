import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { createQuitRequestController } = require('../../electron/quit-request-controller.cjs');

function createHarness() {
  let timeoutCallback = null;
  const onTimeout = vi.fn();
  const clearTimer = vi.fn();
  const controller = createQuitRequestController({
    timeoutMs: 8000,
    now: () => 1234,
    setTimer(callback) {
      timeoutCallback = callback;
      return 99;
    },
    clearTimer,
    onTimeout,
  });
  return { controller, clearTimer, onTimeout, runTimeout: () => timeoutCallback?.() };
}

describe('tray quit request controller', () => {
  it('deduplicates repeated tray exit clicks while a request is pending', () => {
    const { controller } = createHarness();
    const first = controller.begin();
    const second = controller.begin();

    expect(first).toEqual({ started: true, requestId: 'quit-1234-1' });
    expect(second).toEqual({ started: false, requestId: first.requestId });
  });

  it('clears the fallback when the renderer confirms or cancels', () => {
    const confirmed = createHarness();
    const confirmRequest = confirmed.controller.begin();
    expect(confirmed.controller.confirm(confirmRequest.requestId)).toBe(true);
    confirmed.runTimeout();
    expect(confirmed.onTimeout).not.toHaveBeenCalled();
    expect(confirmed.clearTimer).toHaveBeenCalledWith(99);

    const cancelled = createHarness();
    const cancelRequest = cancelled.controller.begin();
    expect(cancelled.controller.cancel(cancelRequest.requestId)).toBe(true);
    cancelled.runTimeout();
    expect(cancelled.onTimeout).not.toHaveBeenCalled();
  });

  it('disarms only the fallback after the renderer acknowledges handling', () => {
    const acknowledged = createHarness();
    const request = acknowledged.controller.begin();

    expect(acknowledged.controller.acknowledge(request.requestId)).toBe(true);
    acknowledged.runTimeout();

    expect(acknowledged.onTimeout).not.toHaveBeenCalled();
    expect(acknowledged.controller.hasPending()).toBe(true);
    expect(acknowledged.controller.cancel(request.requestId)).toBe(true);
  });

  it('fires the fallback once when the renderer never responds', () => {
    const { controller, onTimeout, runTimeout } = createHarness();
    const request = controller.begin();

    runTimeout();
    runTimeout();

    expect(onTimeout).toHaveBeenCalledTimes(1);
    expect(onTimeout).toHaveBeenCalledWith(request.requestId);
    expect(controller.hasPending()).toBe(false);
  });

  it('wires request ids through the main, preload, and renderer layers', () => {
    const root = process.cwd();
    const mainSource = fs.readFileSync(path.join(root, 'electron', 'main.cjs'), 'utf8');
    const preloadSource = fs.readFileSync(path.join(root, 'electron', 'preload.cjs'), 'utf8');
    const appSource = fs.readFileSync(path.join(root, 'src', 'App.jsx'), 'utf8');

    expect(mainSource).toContain("mainWindow.webContents.send('app:quitRequested', { requestId })");
    expect(mainSource).toContain("ipcMain.on('app:cancelQuit'");
    expect(mainSource).toContain("commandLine.includes('--request-quit')");
    expect(mainSource).toContain('beginFinalApplicationExit(`renderer-confirmed:${requestId}`)');
    expect(preloadSource).toContain(
      "acknowledgeQuit: (requestId) => ipcRenderer.send('app:acknowledgeQuit', requestId)",
    );
    expect(preloadSource).toContain("confirmQuit: (requestId) => ipcRenderer.send('app:confirmQuit', requestId)");
    expect(preloadSource).toContain("cancelQuit: (requestId, reason) => ipcRenderer.send('app:cancelQuit'");
    expect(appSource).toContain('window.electronAPI.confirmQuit(requestId)');
    expect(appSource).toContain('window.electronAPI?.acknowledgeQuit?.(requestId)');
    expect(appSource).toContain('window.electronAPI?.cancelQuit?.(requestId');
  });
});
