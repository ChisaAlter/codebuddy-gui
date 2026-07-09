import { afterEach, describe, expect, it, vi } from 'vitest';
import { AcpClient, setApiBase } from '../../src/lib/acp';

function sseResponse(text) {
  return {
    ok: true,
    status: 200,
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(text));
        controller.close();
      },
    }),
  };
}

describe('AcpClient GET SSE notification stream', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    setApiBase('http://127.0.0.1:63918');
    delete window.electronAPI;
  });

  it('readSseStream 能跨 chunk 解析 SSE 消息', async () => {
    const client = new AcpClient();
    const messages = [];
    const response = {
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('data: {"method":"session/'));
          controller.enqueue(new TextEncoder().encode('update","params":{"ok":true}}\n\n'));
          controller.close();
        },
      }),
    };

    await client.readSseStream(response, (message) => messages.push(message));

    expect(messages).toEqual([
      { method: 'session/update', params: { ok: true } },
    ]);
  });

  it.skip('connect 后可通过 Electron IPC stream 派发 session/update', async () => {
    setApiBase('http://127.0.0.1:23456');
    const fetchMock = vi.fn(async (url, init = {}) => {
      const method = init.method || 'GET';
      if (url === 'http://127.0.0.1:23456/api/v1/acp/connect' && method === 'POST') {
        return {
          ok: true,
          status: 200,
          json: async () => ({ connectionId: 'conn-ipc', sessionToken: 'sess-ipc' }),
        };
      }
      if (url === 'http://127.0.0.1:23456/api/v1/acp/connect/conn-ipc' && method === 'DELETE') {
        return { ok: true, status: 204, text: async () => '' };
      }
      throw new Error(`unexpected request: ${method} ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    let closeCalled = false;
    let openedRequest = null;
    window.electronAPI = {
      openCodeBuddyStream(request, handlers) {
        openedRequest = request;
        queueMicrotask(() => handlers.onMessage({
          method: 'session/update',
          params: { sessionId: 's-ipc', update: { sessionUpdate: 'agent_message_chunk' } },
        }));
        return { close: () => { closeCalled = true; } };
      },
    };

    const client = new AcpClient();
    const updates = [];
    client.on('session/update', (event) => updates.push(event.detail));

    await client.connect();

    await vi.waitFor(() => {
      expect(updates).toHaveLength(1);
    });
    expect(openedRequest).toMatchObject({
      url: 'http://127.0.0.1:23456/api/v1/acp',
      headers: expect.objectContaining({
        Accept: 'text/event-stream',
        'acp-connection-id': 'conn-ipc',
        'acp-session-token': 'sess-ipc',
      }),
    });
    expect(updates[0]).toMatchObject({ sessionId: 's-ipc' });

    await client.disconnect();
    expect(closeCalled).toBe(true);
  });

  it('request 收到 result:null 时仍视为匹配到响应', async () => {
    setApiBase('http://127.0.0.1:34567');
    const fetchMock = vi.fn(async (url, init = {}) => {
      const method = init.method || 'GET';
      if (url === 'http://127.0.0.1:34567/api/v1/acp' && method === 'POST') {
        const body = JSON.parse(init.body);
        return sseResponse(`data: {"jsonrpc":"2.0","id":"${body.id}","result":null}\n\n`);
      }
      throw new Error(`unexpected request: ${method} ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = new AcpClient();
    client.connected = true;
    client.connectionId = 'conn-null';

    await expect(client.request('session/prompt', { sessionId: 's1', prompt: [] })).resolves.toBeNull();
  });

  it.skip('connect 后建立 GET /api/v1/acp 长连接并派发 session/update', async () => {
    setApiBase('http://127.0.0.1:12345');
    const fetchMock = vi.fn(async (url, init = {}) => {
      const method = init.method || 'GET';
      if (url === 'http://127.0.0.1:12345/api/v1/acp/connect' && method === 'POST') {
        return {
          ok: true,
          status: 200,
          json: async () => ({ connectionId: 'conn-1', sessionToken: 'sess-1' }),
        };
      }
      if (url === 'http://127.0.0.1:12345/api/v1/acp' && method === 'GET') {
        return sseResponse('data: {"method":"session/update","params":{"sessionId":"s1","update":{"sessionUpdate":"agent_message_chunk","content":[{"type":"text","text":"pong"}]}}}\n\n');
      }
      if (url === 'http://127.0.0.1:12345/api/v1/acp/connect/conn-1' && method === 'DELETE') {
        return { ok: true, status: 204, text: async () => '' };
      }
      throw new Error(`unexpected request: ${method} ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = new AcpClient();
    const updates = [];
    client.on('session/update', (event) => updates.push(event.detail));

    await client.connect();

    await vi.waitFor(() => {
      expect(updates).toHaveLength(1);
    });
    expect(updates[0]).toMatchObject({
      sessionId: 's1',
      update: { sessionUpdate: 'agent_message_chunk' },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:12345/api/v1/acp',
      expect.objectContaining({
        headers: expect.objectContaining({
          Accept: 'text/event-stream',
          'acp-connection-id': 'conn-1',
          'acp-session-token': 'sess-1',
        }),
      }),
    );

    await client.disconnect();
  });
});
