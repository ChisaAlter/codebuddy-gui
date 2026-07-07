// 后端基址兜底值：仅当 Electron 主进程 IPC 不可达时使用。
// 正常运行时 store.bootstrap() 会调 window.electronAPI.getCodeBuddyPort() 拿主进程从 stdout 解析出的真实随机端口并 setApiBase 覆盖此值。
let _apiBase = 'http://127.0.0.1:63918';

const LONG_RUNNING_ACP_METHODS = new Set(['session/prompt']);
const DEFAULT_REQUEST_TIMEOUT_MS = 30000;
const LONG_REQUEST_IDLE_TIMEOUT_MS = 120000;

export function getApiBase() {
  return _apiBase;
}

export function setApiBase(base) {
  _apiBase = base;
}

let _acpSessionToken = null;
export function setAcpSessionToken(token) {
  _acpSessionToken = token;
}
export function getAcpSessionToken() {
  return _acpSessionToken;
}

function makeHeaders(extra = {}) {
  const headers = {
    'X-CodeBuddy-Request': '1',
    ...extra,
  };
  if (_acpSessionToken) {
    headers['acp-session-token'] = _acpSessionToken;
  }
  return headers;
}

export async function requestCodeBuddy(pathOrUrl, init = {}) {
  const url = /^https?:\/\//.test(pathOrUrl) ? pathOrUrl : `${_apiBase}${pathOrUrl}`;
  const timeoutMs = init.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  const signal = init.signal;
  const request = {
    ...init,
    signal,
    headers: {
      ...makeHeaders(),
      ...(init.headers || {}),
    },
  };
  delete request.timeoutMs;

  const controller = new AbortController();
  // 走 IPC 代理通道时由主进程统一管超时（避免前端 30s 抢盖主进程 120s 长响应）
  const viaIpc = typeof window !== 'undefined' && window.electronAPI?.requestCodeBuddy;
  const timeoutId = (!viaIpc && timeoutMs > 0) ? setTimeout(() => controller.abort(), timeoutMs) : null;
  const onAbort = () => controller.abort();
  const cleanup = () => {
    if (timeoutId) clearTimeout(timeoutId);
    signal?.removeEventListener?.('abort', onAbort);
  };
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener?.('abort', onAbort, { once: true });

  if (viaIpc) {
    try {
      const proxied = await window.electronAPI.requestCodeBuddy({
        url,
        method: request.method || 'GET',
        headers: request.headers,
        body: request.body,
        timeoutMs,
      });
      if (controller.signal.aborted && !proxied?.ok) {
        throw new Error(`CodeBuddy request timeout: ${request.method || 'GET'} ${url}`);
      }
      return {
        ok: !!proxied?.ok,
        status: proxied?.status || 0,
        statusText: proxied?.statusText || 'CodeBuddy request failed',
        headers: proxied?.headers || {},
        text: async () => proxied?.body || '',
        json: async () => proxied?.body ? JSON.parse(proxied.body) : null,
      };
    } finally {
      cleanup();
    }
  }

  try {
    return await fetch(url, { ...request, signal: controller.signal });
  } finally {
    cleanup();
  }
}

function parseEventStreamMessages(text) {
  const chunks = text.split(/\n\n+/).map((x) => x.trim()).filter(Boolean);
  const messages = [];

  for (const chunk of chunks) {
    const dataLines = chunk
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim());

    if (!dataLines.length) continue;
    const joined = dataLines.join('');
    try {
      messages.push(JSON.parse(joined));
    } catch (_) { console.warn('ACP SSE JSON parse failed:', _); }
  }

  return messages;
}

export class AcpClient {
  constructor() {
    this.connectionId = null;
    this.sessionToken = null;
    this.eventTarget = new EventTarget();
    this.connected = false;
    this.initialized = false;
    this.requestCounter = 0;

    // 重连相关
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.reconnectDelay = 1000;
    this.reconnecting = false;
    this._reconnectTimer = null;
    this._connecting = false;

    // 心跳相关
    this._heartbeatTimer = null;
    this._heartbeatFailures = 0;
    this._maxHeartbeatFailures = 3;
    this._heartbeatInterval = 30000;
  }

  get connectionState() {
    if (this.reconnecting) return 'reconnecting';
    if (this._connecting) return 'connecting';
    if (this.connected) return 'connected';
    if (this._connectionError) return 'error';
    return 'disconnected';
  }

  on(type, listener) {
    this.eventTarget.addEventListener(type, listener);
    return () => this.eventTarget.removeEventListener(type, listener);
  }

  emit(type, detail) {
    this.eventTarget.dispatchEvent(new CustomEvent(type, { detail }));
  }

  handleIncomingRpc(message) {
    if (!message || typeof message !== 'object') return;

    if (message.method === 'session/update') {
      const params = message.params || {};
      const update = params.update || {};
      const sessionUpdate = update.sessionUpdate;
      this.emit('session/update', params);
      if (sessionUpdate) {
        this.emit(sessionUpdate, update);
      }
      return;
    }

    if (message.method === '_codebuddy.ai/checkpoint') {
      this.emit('checkpoint', message.params || {});
      return;
    }

    if (message.method) {
      this.emit(message.method, message.params || message);
    }
  }

  async connect() {
    if (this.connected) return;

    this._connecting = true;
    this._connectionError = false;
    this.reconnectAttempts = 0;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await requestCodeBuddy('/api/v1/acp/connect', {
        method: 'POST',
        headers: makeHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({}),
        signal: controller.signal,
        timeoutMs: 10000,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`ACP connect failed: ${response.status}`);
      }

      const payload = await response.json();
      const previousConnectionId = this.connectionId;
      this.connectionId = payload.connectionId;
      this.sessionToken = payload.sessionToken || null;
      this.connected = true;
      this._connecting = false;
      this.reconnecting = false;
      this._connectionError = false;
      if (previousConnectionId && previousConnectionId !== this.connectionId) {
        this.releaseConnection(previousConnectionId);
        this.emit('connection/replaced', { previousConnectionId, connectionId: this.connectionId });
      }
      this.emit('connected', payload);

      // 连接成功后自动启用心跳
      this.startHeartbeat();
    } catch (err) {
      this._connecting = false;
      this.connected = false;
      if (err.name === 'AbortError') {
        this._connectionError = true;
      }
      // 非重连触发的 connect() 失败也走重连流程
      if (!this.reconnecting) {
        this._triggerReconnect();
      }
      throw err;
    }
  }

  async _triggerReconnect() {
    if (this.reconnecting) return;
    this.reconnecting = true;
    this._connectionError = false;
    this.reconnectAttempts = 0;
    this._scheduleReconnect(this.reconnectDelay);
  }

  _scheduleReconnect(delay) {
    this._reconnectTimer = setTimeout(async () => {
      this._reconnectTimer = null;
      if (!this.reconnecting) return;

      this.emit('reconnecting', { attempt: this.reconnectAttempts, max: this.maxReconnectAttempts });

      try {
        await this.connect();
        if (this.connected) {
          this.reconnecting = false;
          const attempts = this.reconnectAttempts;
          this.reconnectAttempts = 0;
          this.emit('reconnected', { attempts });
          return;
        }
      } catch (_) {
        // connect 内部已经设置了 _connectionError
      }

      this.reconnectAttempts++;
      if (this.reconnectAttempts > this.maxReconnectAttempts) {
        this.reconnecting = false;
        this._connectionError = true;
        this.emit('reconnect_failed', { attempts: this.maxReconnectAttempts });
        return;
      }

      // 指数退避，最大 30 秒
      const nextDelay = Math.min(delay * 2, 30000);
      this._scheduleReconnect(nextDelay);
    }, delay);
  }

  async reconnect() {
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    this.reconnecting = true;
    this.connected = false;
    this.initialized = false;
    this.reconnectAttempts = 0;
    this.stopHeartbeat();

    try {
      await this.connect();
      return true;
    } catch (_) {
      this._scheduleReconnect(this.reconnectDelay);
      return false;
    }
  }

  startHeartbeat(intervalMs = 30000) {
    this.stopHeartbeat();
    this._heartbeatInterval = intervalMs;
    this._heartbeatFailures = 0;
    this._heartbeatTimer = setInterval(async () => {
      try {
        await fetchJson('/api/v1/health');
        this._heartbeatFailures = 0;
      } catch (_) {
        this._heartbeatFailures++;
        if (this._heartbeatFailures >= this._maxHeartbeatFailures) {
          this.stopHeartbeat();
          this.connected = false;
          this._triggerReconnect();
        }
      }
    }, this._heartbeatInterval);
  }

  stopHeartbeat() {
    if (this._heartbeatTimer) {
      clearInterval(this._heartbeatTimer);
      this._heartbeatTimer = null;
    }
    this._heartbeatFailures = 0;
  }

  async initialize() {
    if (this.initialized) return;
    const result = await this.request('initialize', {
      protocolVersion: 1,
      clientInfo: { name: 'codebuddy-gui-replica', version: '0.1.0' },
      clientCapabilities: {
        _meta: {
          'codebuddy.ai': {
            question: true,
            promptSuggestion: true,
          },
        },
      },
    });
    this.initialized = true;
    this.emit('initialized', result);
    return result;
  }

  async initializeSession(sessionId = null, cwd = '.') {
    await this.connect();
    const init = await this.initialize();
    // cwd 决定该会话 agent 工具调用的实际工作目录；session/new 时一次性注入，运行时不可改
    const loaded = sessionId
      ? await this.request('session/load', { sessionId, cwd, mcpServers: [] })
      : await this.request('session/new', { cwd, mcpServers: [] });
    return { init, loaded };
  }

  async disconnect() {
    const previousConnectionId = this.connectionId;
    this.connected = false;
    this.initialized = false;
    this.reconnecting = false;
    this._connecting = false;
    this.connectionId = null;
    this.sessionToken = null;
    this.reconnectAttempts = 0;

    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }

    this.stopHeartbeat();
    if (previousConnectionId) await this.releaseConnection(previousConnectionId);
  }

  async releaseConnection(connectionId) {
    if (!connectionId) return;
    await requestCodeBuddy(`/api/v1/acp/connect/${encodeURIComponent(connectionId)}`, {
      method: 'DELETE',
      timeoutMs: 5000,
    }).catch(() => null);
  }

  async request(method, params = {}) {
    if (!this.connected || !this.connectionId) {
      throw new Error('ACP client is not connected');
    }

    const id = String(++this.requestCounter);
    const payload = { jsonrpc: '2.0', method, params, id };
    const isLongRunning = LONG_RUNNING_ACP_METHODS.has(method);

    const controller = new AbortController();
    let timeoutId = null;
    const armTimeout = () => {
      if (timeoutId) clearTimeout(timeoutId);
      const timeoutMs = isLongRunning ? LONG_REQUEST_IDLE_TIMEOUT_MS : DEFAULT_REQUEST_TIMEOUT_MS;
      timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    };
    armTimeout();

    try {
      const response = await requestCodeBuddy('/api/v1/acp', {
        method: 'POST',
        headers: makeHeaders({
          Accept: 'application/json, text/event-stream',
          'Content-Type': 'application/json',
          'acp-connection-id': this.connectionId,
          ...(this.sessionToken ? { 'acp-session-token': this.sessionToken } : {}),
        }),
        body: JSON.stringify(payload),
        signal: controller.signal,
        timeoutMs: isLongRunning ? LONG_REQUEST_IDLE_TIMEOUT_MS : DEFAULT_REQUEST_TIMEOUT_MS,
      });

      if (!response.ok) {
        throw new Error(`ACP POST failed: ${response.status}`);
      }

      const reader = response.body?.getReader?.();
      const decoder = new TextDecoder();
      let text = '';
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          armTimeout();
          text += decoder.decode(value, { stream: true });
        }
        text += decoder.decode();
      } else {
        text = await response.text();
      }

      const messages = parseEventStreamMessages(text);

      let matchedResult = null;
      for (const message of messages) {
        if (message.id && String(message.id) === id) {
          if (message.error) {
            throw new Error(message.error.message || `ACP rpc error: ${method}`);
          }
          matchedResult = message.result ?? null;
        } else {
          this.handleIncomingRpc(message);
        }
      }

      if (matchedResult !== null) {
        return matchedResult;
      }

      const trimmed = text.trim();
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        const parsed = JSON.parse(trimmed);
        if (parsed?.error) throw new Error(parsed.error.message || `ACP rpc error: ${method}`);
        return parsed?.result ?? parsed;
      }

      return null;
    } catch (err) {
      if (err.name === 'AbortError') {
        throw new Error(`ACP request ${isLongRunning ? 'idle ' : ''}timeout: ${method}`);
      }
      throw err;
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }
}

export async function fetchJson(path, init = {}) {
  const response = await requestCodeBuddy(path, init);
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return response.json();
}

// API_BASE is now dynamic — use getApiBase() / setApiBase() instead