let _apiBase = 'http://127.0.0.1:63918';

export function getApiBase() {
  return _apiBase;
}

export function setApiBase(base) {
  _apiBase = base;
}

function makeHeaders(extra = {}) {
  return {
    'X-CodeBuddy-Request': '1',
    ...extra,
  };
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

      const response = await fetch(`${_apiBase}/api/v1/acp/connect`, {
        method: 'POST',
        headers: makeHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({}),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`ACP connect failed: ${response.status}`);
      }

      const payload = await response.json();
      this.connectionId = payload.connectionId;
      this.sessionToken = payload.sessionToken || null;
      this.connected = true;
      this._connecting = false;
      this.reconnecting = false;
      this._connectionError = false;
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

  async initializeSession(sessionId = null) {
    await this.connect();
    const init = await this.initialize();
    const loaded = sessionId
      ? await this.request('session/load', { sessionId, cwd: '.', mcpServers: [] })
      : await this.request('session/new', { cwd: '.', mcpServers: [] });
    return { init, loaded };
  }

  async disconnect() {
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
  }

  async request(method, params = {}) {
    if (!this.connected || !this.connectionId) {
      throw new Error('ACP client is not connected');
    }

    const id = String(++this.requestCounter);
    const payload = { jsonrpc: '2.0', method, params, id };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch(`${_apiBase}/api/v1/acp`, {
        method: 'POST',
        headers: makeHeaders({
          Accept: 'application/json, text/event-stream',
          'Content-Type': 'application/json',
          'acp-connection-id': this.connectionId,
          ...(this.sessionToken ? { 'acp-session-token': this.sessionToken } : {}),
        }),
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`ACP POST failed: ${response.status}`);
      }

      const text = await response.text();
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
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        throw new Error(`ACP request timeout: ${method}`);
      }
      throw err;
    }
  }
}

export async function fetchJson(path, init = {}) {
  const response = await fetch(`${_apiBase}${path}`, {
    ...init,
    headers: {
      ...makeHeaders(),
      ...(init.headers || {}),
    },
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return response.json();
}

// API_BASE is now dynamic — use getApiBase() / setApiBase() instead