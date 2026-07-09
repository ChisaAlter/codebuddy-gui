import { getApiBase, getAuthToken } from './acp';

function wsBase() {
  return getApiBase().replace(/^http/, 'ws');
}

/**
 * 构造 PTY WebSocket url（对照源 bundle）
 *   `${ws|wss}://${host}/api/v1/pty/${sessionId}/ws?token=${encodeURIComponent(authToken)}`
 * - /ws 后缀：对照源真实 UI 路由形状，项目旧版无此后缀
 * - ?token=：鉴权场景下 WS 握手需带 bearer token；无 token 则 query 为空
 * @param {string} sessionId
 * @returns {string}
 */
export function buildPtyWebSocketUrl(sessionId) {
  const base = `${wsBase()}/api/v1/pty/${encodeURIComponent(sessionId)}/ws`;
  const token = getAuthToken();
  return token ? `${base}?token=${encodeURIComponent(token)}` : base;
}

/**
 * PTY HTTP 直送输入（对照源 bundle aD()：POST /api/v1/pty/{id}/input/send {data}）
 * - 用途：WS 不可达时的 HTTP 兜底，或一次性输入无需建长连的场景
 * - 非阻塞：对照源同此用 .catch(()=>{}) 吞错，调用方不感知
 * @param {string} sessionId
 * @param {string} data
 */
export async function ptySendInputHttp(sessionId, data) {
  if (!sessionId) return;
  const { requestCodeBuddy } = await import('./acp');
  await requestCodeBuddy(`/api/v1/pty/${encodeURIComponent(sessionId)}/input/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data }),
    timeoutMs: 10000,
  }).catch(() => null);
}

export class PtySocket {
  constructor(sessionId) {
    this.sessionId = sessionId;
    this.socket = null;
    this.listeners = new Map();
    this._reconnecting = false;
    this._maxReconnectAttempts = 5;
    this._reconnectInterval = 1000;
    this._reconnectAttempts = 0;
    this._reconnectTimer = null;
  }

  get readyState() {
    return this.socket?.readyState ?? WebSocket.CLOSED;
  }

  isConnected() {
    return this.socket !== null && this.socket.readyState === WebSocket.OPEN;
  }

  on(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(listener);
    return () => this.listeners.get(type)?.delete(listener);
  }

  emit(type, payload) {
    const set = this.listeners.get(type);
    if (!set) return;
    for (const listener of set) listener(payload);
  }

  connect() {
    if (this.socket) return;
    const url = buildPtyWebSocketUrl(this.sessionId);
    const socket = new WebSocket(url);
    this.socket = socket;

    socket.onopen = () => {
      this.emit('open', { sessionId: this.sessionId });
    };
    socket.onclose = (event) => {
      this.emit('close', event);
      // 非主动关闭时尝试重连
      if (!this._reconnecting && event.code !== 1000) {
        this._tryReconnect();
      }
    };
    socket.onerror = (event) => this.emit('error', event);
    socket.onmessage = (event) => {
      let payload = event.data;
      try {
        payload = JSON.parse(event.data);
      } catch (_) {}
      this.emit('message', payload);
      if (payload?.type) this.emit(payload.type, payload);
    };
  }

  sendInput(data) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error('PTY socket is not connected');
    }
    this.socket.send(JSON.stringify({ type: 'input', data }));
  }

  resize(cols, rows) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error('PTY socket is not connected');
    }
    this.socket.send(JSON.stringify({ type: 'resize', cols, rows }));
  }

  close() {
    this._reconnecting = false;
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }

  _tryReconnect() {
    if (this._reconnecting) return;
    this._reconnecting = true;
    this._reconnectAttempts = 0;
    this._doReconnectAttempt();
  }

  _doReconnectAttempt() {
    this._reconnectAttempts++;
    if (this._reconnectAttempts > this._maxReconnectAttempts) {
      this._reconnecting = false;
      this.emit('reconnect_failed', { attempts: this._maxReconnectAttempts });
      return;
    }

    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;

      // 清理旧 socket
      if (this.socket) {
        try { this.socket.close(); } catch (_) {}
        this.socket = null;
      }

      this.emit('reconnecting', { attempt: this._reconnectAttempts, max: this._maxReconnectAttempts });

      try {
        const url = buildPtyWebSocketUrl(this.sessionId);
        const socket = new WebSocket(url);
        this.socket = socket;

        socket.onopen = () => {
          this._reconnecting = false;
          this._reconnectAttempts = 0;
          this.emit('reconnected', { sessionId: this.sessionId });
          this.emit('open', { sessionId: this.sessionId });
        };

        socket.onclose = (event) => {
          this.emit('close', event);
          // 非主动关闭时尝试重连
          if (!this._reconnecting && event.code !== 1000) {
            this._tryReconnect();
          }
        };

        socket.onerror = (event) => {
          this.emit('error', event);
        };

        socket.onmessage = (event) => {
          let payload = event.data;
          try {
            payload = JSON.parse(event.data);
          } catch (_) {}
          this.emit('message', payload);
          if (payload?.type) this.emit(payload.type, payload);
        };

        // 如果连接在一定时间内没建立，继续重试
        const connectTimeout = setTimeout(() => {
          if (this._reconnecting && socket.readyState !== WebSocket.OPEN) {
            try { socket.close(); } catch (_) {}
            this._doReconnectAttempt();
          }
        }, 3000);

        // 连接成功时清理超时
        const originalOnOpen = socket.onopen;
        socket.onopen = (event) => {
          clearTimeout(connectTimeout);
          if (originalOnOpen) originalOnOpen.call(socket, event);
        };

      } catch (_) {
        this._doReconnectAttempt();
      }
    }, this._reconnectInterval);
  }

  reconnect() {
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    this._reconnecting = true;
    this._reconnectAttempts = 0;

    if (this.socket) {
      try { this.socket.close(); } catch (_) {}
      this.socket = null;
    }

    this._doReconnectAttempt();
  }
}
