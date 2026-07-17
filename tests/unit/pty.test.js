import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setApiBase } from '../../src/lib/acp';
import { PtySocket } from '../../src/lib/pty';

describe('PtySocket Electron SSE transport', () => {
  beforeEach(() => {
    setApiBase('http://127.0.0.1:45678');
    window.electronAPI = undefined;
  });

  it('closes the preload stream handle when the GET stream fails', async () => {
    let handlers;
    const close = vi.fn();
    const onError = vi.fn();
    const onClose = vi.fn();
    window.electronAPI = {
      requestCodeBuddy: vi.fn(async () => ({
        ok: true,
        status: 200,
        statusText: 'OK',
        body: '{}',
        headers: { 'content-type': 'application/json' },
      })),
      openCodeBuddyStream: vi.fn((_request, nextHandlers) => {
        handlers = nextHandlers;
        return { close };
      }),
    };

    const socket = new PtySocket('pty-1');
    socket.on('error', onError);
    socket.on('close', onClose);
    socket.connect();

    await vi.waitFor(() => expect(window.electronAPI.openCodeBuddyStream).toHaveBeenCalledOnce());
    handlers.onError(new Error('stream closed'));

    expect(close).toHaveBeenCalledOnce();
    expect(socket._sseStream).toBeNull();
    expect(onError).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });
});
