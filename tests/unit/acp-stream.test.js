import { afterEach, describe, expect, it, vi } from 'vitest';
import { AcpClient, AcpRpcError, isAcpAuthenticationError, setApiBase } from '../../src/lib/acp';

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

  it('retains native authentication methods and authenticates through ACP', async () => {
    const client = new AcpClient();
    client.connected = true;
    client.connectionId = 'conn-auth';
    client.request = vi
      .fn()
      .mockResolvedValueOnce({ authMethods: [{ id: 'iOA', name: 'Login with iOA' }] })
      .mockResolvedValueOnce({ _meta: { 'codebuddy.ai/userinfo': { userId: 'user-1' } } });

    await client.initialize();
    await expect(client.authenticate('iOA')).resolves.toMatchObject({
      _meta: { 'codebuddy.ai/userinfo': { userId: 'user-1' } },
    });
    expect(client.authMethods).toEqual([{ id: 'iOA', name: 'Login with iOA' }]);
    expect(client.request).toHaveBeenNthCalledWith(2, 'authenticate', { methodId: 'iOA' });
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

    expect(messages).toEqual([{ method: 'session/update', params: { ok: true } }]);
  });

  it('connect 后可通过 Electron IPC stream 派发 session/update', async () => {
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
        queueMicrotask(() =>
          handlers.onMessage({
            method: 'session/update',
            params: { sessionId: 's-ipc', update: { sessionUpdate: 'agent_message_chunk' } },
          }),
        );
        return {
          close: () => {
            closeCalled = true;
          },
        };
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
      timeoutMs: 0,
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

  it('session/new 返回后仍处理同一 POST 流里的延迟指令列表', async () => {
    window.electronAPI = {
      requestCodeBuddy: vi.fn(async () => ({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'text/event-stream' },
        body: [
          'event: message',
          'data: {"jsonrpc":"2.0","id":"1","result":{"sessionId":"session-delayed"}}',
          '',
          'event: message',
          'data: {"jsonrpc":"2.0","method":"session/update","params":{"sessionId":"session-delayed","update":{"sessionUpdate":"available_commands_update","availableCommands":[{"name":"help","description":"Show help"}]}}}',
          '',
          '',
        ].join('\n'),
      })),
    };

    const client = new AcpClient({ apiBase: 'http://127.0.0.1:45679' });
    client.connected = true;
    client.connectionId = 'conn-delayed';
    const updates = [];
    client.on('session/update', (event) => updates.push(event.detail));

    await expect(client.request('session/new', { cwd: '.', mcpServers: [] })).resolves.toEqual({
      sessionId: 'session-delayed',
    });
    expect(updates).toEqual([
      {
        sessionId: 'session-delayed',
        update: {
          sessionUpdate: 'available_commands_update',
          availableCommands: [{ name: 'help', description: 'Show help' }],
        },
      },
    ]);
  });

  it('request 在最终结果返回前逐条派发 POST SSE 更新', async () => {
    setApiBase('http://127.0.0.1:34568');
    let releaseResult;
    const fetchMock = vi.fn(async (url, init = {}) => {
      const method = init.method || 'GET';
      if (url === 'http://127.0.0.1:34568/api/v1/acp' && method === 'POST') {
        const body = JSON.parse(init.body);
        return {
          ok: true,
          status: 200,
          body: new ReadableStream({
            start(controller) {
              controller.enqueue(
                new TextEncoder().encode(
                  'data: {"method":"session/update","params":{"sessionId":"s-stream","update":{"sessionUpdate":"agent_message_chunk","messageId":"m1","content":{"type":"text","text":"第一段"}}}}\n\n',
                ),
              );
              releaseResult = () => {
                controller.enqueue(
                  new TextEncoder().encode(`data: {"jsonrpc":"2.0","id":"${body.id}","result":null}\n\n`),
                );
                controller.close();
              };
            },
          }),
        };
      }
      throw new Error(`unexpected request: ${method} ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = new AcpClient();
    client.connected = true;
    client.connectionId = 'conn-stream';
    const updates = [];
    client.on('session/update', (event) => updates.push(event.detail));
    let requestResolved = false;
    const request = client.request('session/prompt', { sessionId: 's-stream', prompt: [] }).then((result) => {
      requestResolved = true;
      return result;
    });

    await vi.waitFor(() => expect(updates).toHaveLength(1));
    expect(requestResolved).toBe(false);
    expect(updates[0]).toMatchObject({
      sessionId: 's-stream',
      update: { sessionUpdate: 'agent_message_chunk', messageId: 'm1' },
    });

    releaseResult();
    await expect(request).resolves.toBeNull();
  });

  it('Electron IPC POST 流在最终 RPC 结果前派发消息块', async () => {
    let handlers;
    let openedRequest;
    let closeCalled = false;
    window.electronAPI = {
      openCodeBuddyStream(request, nextHandlers) {
        openedRequest = request;
        handlers = nextHandlers;
        queueMicrotask(() =>
          handlers.onMessage({
            method: 'session/update',
            params: {
              sessionId: 's-ipc-stream',
              update: {
                sessionUpdate: 'agent_thought_chunk',
                messageId: 'thought-1',
                content: { type: 'text', text: '正在分析' },
              },
            },
          }),
        );
        return {
          close: () => {
            closeCalled = true;
          },
        };
      },
    };

    const client = new AcpClient({ apiBase: 'http://127.0.0.1:45678' });
    client.connected = true;
    client.connectionId = 'conn-ipc-stream';
    client.sessionToken = 'token-ipc-stream';
    const updates = [];
    client.on('session/update', (event) => updates.push(event.detail));
    let requestResolved = false;
    const request = client.request('session/prompt', { sessionId: 's-ipc-stream', prompt: [] }).then((result) => {
      requestResolved = true;
      return result;
    });

    await vi.waitFor(() => expect(updates).toHaveLength(1));
    expect(requestResolved).toBe(false);
    expect(openedRequest).toMatchObject({
      url: 'http://127.0.0.1:45678/api/v1/acp',
      method: 'POST',
      rpcId: '1',
      timeoutMs: 0,
      headers: expect.objectContaining({
        'acp-connection-id': 'conn-ipc-stream',
        'acp-session-token': 'token-ipc-stream',
      }),
    });
    expect(updates[0]).toMatchObject({
      update: { sessionUpdate: 'agent_thought_chunk', messageId: 'thought-1' },
    });

    handlers.onMessage({ jsonrpc: '2.0', id: '1', result: null });
    await expect(request).resolves.toBeNull();
    expect(closeCalled).toBe(true);
  });

  it('locally cancels the active Electron prompt stream', async () => {
    let closeCalled = false;
    window.electronAPI = {
      openCodeBuddyStream() {
        return {
          close: () => {
            closeCalled = true;
          },
        };
      },
    };

    const client = new AcpClient({ apiBase: 'http://127.0.0.1:45678' });
    client.connected = true;
    client.connectionId = 'conn-cancel';
    const request = client.request('session/prompt', { sessionId: 's-cancel', prompt: [] });

    expect(client.cancelActivePrompt('s-cancel')).toBe(true);
    await expect(request).rejects.toThrow('cancelled by user');
    expect(closeCalled).toBe(true);
    expect(client.cancelActivePrompt('s-cancel')).toBe(false);
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

  it('preserves ACP authentication error metadata', async () => {
    window.electronAPI = {
      requestCodeBuddy: vi.fn(async () => ({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: '1',
          error: { code: -32000, message: 'Authentication required', data: { category: 'auth' } },
        }),
      })),
    };
    const client = new AcpClient({ apiBase: 'http://127.0.0.1:45678' });
    client.connected = true;
    client.connectionId = 'conn-auth';

    const error = await client.request('initialize', {}).catch((value) => value);
    expect(error).toBeInstanceOf(AcpRpcError);
    expect(error).toMatchObject({ code: -32000, category: 'auth', data: { category: 'auth' } });
    expect(isAcpAuthenticationError(error)).toBe(true);
  });

  it('connect 后建立 GET /api/v1/acp 长连接并派发 session/update', async () => {
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
        return sseResponse(
          'data: {"method":"session/update","params":{"sessionId":"s1","update":{"sessionUpdate":"agent_message_chunk","content":[{"type":"text","text":"pong"}]}}}\n\n',
        );
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
