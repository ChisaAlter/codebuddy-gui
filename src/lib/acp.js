import { name as appName, version as appVersion } from '../../package.json';

// 后端基址兜底值：仅当 Electron 主进程 IPC 不可达时使用。
// 正常运行时 store.bootstrap() 会按活动项目请求 Electron 运行时管理器，并用该项目的随机端口覆盖此值。
let _apiBase = 'http://127.0.0.1:63918';

const LONG_RUNNING_ACP_METHODS = new Set(['session/prompt']);
const DEFAULT_REQUEST_TIMEOUT_MS = 30000;
const LONG_REQUEST_IDLE_TIMEOUT_MS = 0;

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

// 鉴权 token：对照源 sessionStorage 持久化，所有请求带 Authorization: Bearer ${token}
let _authToken = null;
const AUTH_TOKEN_STORAGE_KEY = 'codebuddy-auth-token';
export function setAuthToken(token) {
  _authToken = token || null;
  try {
    if (token) sessionStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
    else sessionStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
  } catch (_) { /* sessionStorage 不可达不阻塞 */ }
}
export function getAuthToken() {
  if (_authToken) return _authToken;
  try { return sessionStorage.getItem(AUTH_TOKEN_STORAGE_KEY) || null; } catch (_) { return null; }
}
export function clearAuthToken() { setAuthToken(null); }

function announceAuthRequired(url, status) {
  if (status !== 401 || typeof window === 'undefined') return;
  if (url.includes('/api/v1/auth/login') || url.includes('/api/v1/auth/status')) return;
  window.dispatchEvent(new CustomEvent('codebuddy:auth-required'));
}

function makeHeaders(extra = {}, includeAcpSessionToken = true, includeAuthToken = true) {
  const headers = {
    'X-CodeBuddy-Request': '1',
    ...extra,
  };
  if (includeAcpSessionToken && _acpSessionToken) {
    headers['acp-session-token'] = _acpSessionToken;
  }
  const bearer = includeAuthToken ? getAuthToken() : null;
  if (bearer) headers['Authorization'] = `Bearer ${bearer}`;
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
      ...makeHeaders({}, !init.omitAcpSessionToken, !init.omitAuthToken),
      ...(init.headers || {}),
    },
  };
  delete request.timeoutMs;
  delete request.omitAcpSessionToken;
  delete request.omitAuthToken;

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
      const headers = new Headers(proxied?.headers || {});
      announceAuthRequired(url, proxied?.status || 0);
      const bodyBytes = proxied?.bodyBase64
        ? Uint8Array.from(atob(proxied.bodyBase64), (character) => character.charCodeAt(0))
        : null;
      const readText = () => bodyBytes
        ? new TextDecoder().decode(bodyBytes)
        : (proxied?.body || '');
      const readArrayBuffer = () => {
        const bytes = bodyBytes || new TextEncoder().encode(proxied?.body || '');
        return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      };
      return {
        ok: !!proxied?.ok,
        status: proxied?.status || 0,
        statusText: proxied?.statusText || 'CodeBuddy request failed',
        headers,
        text: async () => readText(),
        json: async () => readText() ? JSON.parse(readText()) : null,
        blob: async () => new Blob([bodyBytes || proxied?.body || ''], { type: headers.get('content-type') || '' }),
        arrayBuffer: async () => readArrayBuffer(),
        truncated: Boolean(proxied?.truncated),
      };
    } finally {
      cleanup();
    }
  }

  try {
    const response = await fetch(url, { ...request, signal: controller.signal });
    announceAuthRequired(url, response.status);
    return response;
  } finally {
    cleanup();
  }
}

export function parseEventStreamMessages(text) {
  const chunks = text.split(/\r?\n\r?\n/).filter(Boolean);
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

  if (messages.length === 0 && text.trim()) {
    try {
      const parsed = JSON.parse(text.trim());
      if (Array.isArray(parsed)) messages.push(...parsed);
      else messages.push(parsed);
    } catch (_) {}
  }

  return messages;
}

function consumeEventStreamChunk(buffer, chunk, flush = false) {
  const combined = `${buffer}${chunk}`;
  const parts = combined.split(/\r?\n\r?\n/);
  let remainder = parts.pop() || '';
  if (flush && remainder.trim()) {
    parts.push(remainder);
    remainder = '';
  }
  return {
    buffer: remainder,
    messages: parts.flatMap((part) => parseEventStreamMessages(part)),
  };
}

export class AcpClient {
  constructor(options = {}) {
    this.apiBase = options.apiBase || getApiBase();
    this.connectionId = null;
    this.sessionToken = null;
    this.eventTarget = new EventTarget();
    this.connected = false;
    this.initialized = false;
    this.requestCounter = 0;
    this.permissionRequestIds = new Map();
    this.permissionRequestToolCallIds = new Map();
    this.questionRequestIds = new Map();

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

    // GET SSE 通知流：连接后保持 /api/v1/acp 长连接；通知流和 POST 内联 SSE 可能推送同一事件。
    this._sseAbortController = null;
    this._sseRetryAttempt = 0;
    this._sseBuffer = '';
    this._sseIpcStream = null;
  }

  get connectionState() {
    if (this.reconnecting) return 'reconnecting';
    if (this._connecting) return 'connecting';
    if (this.connected) return 'connected';
    if (this._connectionError) return 'error';
    return 'disconnected';
  }

  setApiBase(base) {
    if (base) this.apiBase = base;
  }

  requestHttp(pathOrUrl, init = {}) {
    const url = /^https?:\/\//.test(pathOrUrl) ? pathOrUrl : `${this.apiBase}${pathOrUrl}`;
    return requestCodeBuddy(url, {
      ...init,
      omitAcpSessionToken: true,
      headers: {
        ...(this.sessionToken ? { 'acp-session-token': this.sessionToken } : {}),
        ...(init.headers || {}),
      },
    });
  }

  async fetchJson(path, init = {}) {
    const response = await this.requestHttp(path, init);
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return response.json();
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

    if (message.method && message.id !== undefined && message.id !== null) {
      if (message.method === 'session/request_permission') {
        this.handlePermissionRequest(message.id, message.params || {});
        return;
      }
      if (message.method === '_codebuddy.ai/question') {
        this.handleQuestionRequest(message.id, message.params || {});
        return;
      }
      return;
    }

    if (message.method === 'session/update') {
      const params = message.params || {};
      const update = params.update || {};
      const sessionUpdate = update.sessionUpdate;
      this.emit('session/update', params);
      const interruption = update._meta?.['codebuddy.ai/interruptionRequest'];
      if (interruption) {
        this.emit('interruption_request', {
          sessionUpdate: 'interruption_request',
          sessionId: params.sessionId,
          interruptionId: interruption.interruptionId || ('ir-' + interruption.toolCallId),
          reason: 'Tool requires approval',
          options: interruption.options || [],
          toolName: interruption.toolName,
          toolTitle: interruption.toolTitle,
          toolInput: interruption.toolInput,
          toolCallId: interruption.toolCallId,
          workflowSourceText: interruption.workflowSourceText,
          mcpUiIntercept: interruption.mcpUiIntercept === true,
          responseMode: 'extension',
        });
      }
      if (sessionUpdate) this.emit(sessionUpdate, update);
      return;
    }

    if (message.method === '_codebuddy.ai/checkpoint') {
      this.emit('checkpoint', message.params || {});
      return;
    }

    if (message.method) this.emit(message.method, message.params || message);
  }

  handlePermissionRequest(requestId, params) {
    const toolCall = params?.toolCall || {};
    const interruptionId = 'perm-' + String(requestId);
    const toolCallId = toolCall.toolCallId || null;
    const toolName = toolCall._meta?.['codebuddy.ai/toolName'] || toolCall.toolName || 'tool';
    this.permissionRequestIds.set(interruptionId, requestId);
    if (toolCallId) this.permissionRequestToolCallIds.set(toolCallId, interruptionId);
    this.emit('interruption_request', {
      sessionUpdate: 'interruption_request',
      sessionId: params?.sessionId || null,
      interruptionId,
      reason: 'Tool requires approval',
      options: (params?.options || []).map((option) => option?.optionId || option?.name || option).filter(Boolean),
      toolName,
      toolTitle: toolCall.title || toolName,
      toolInput: toolCall.rawInput,
      toolCallId,
      responseMode: 'json-rpc',
    });
  }

  handleQuestionRequest(requestId, params) {
    const toolCallId = params?.toolCallId || ('question-' + String(requestId));
    const questions = (params?.schema?.questions || []).map((question, index) => ({
      id: question.id || ('q_' + index),
      question: question.question || '',
      header: question.header || '',
      options: (question.options || []).map((option) => (
        typeof option === 'string'
          ? { label: option, value: option, description: '' }
          : {
              label: option.label || option.value || option.id || '',
              value: option.value || option.id || option.label || '',
              description: option.description || '',
            }
      )).filter((option) => option.value),
      multiSelect: Boolean(question.multiSelect),
    }));
    this.questionRequestIds.set(toolCallId, requestId);
    this.emit('question_request', {
      toolCallId,
      sessionId: params?.sessionId || null,
      questions,
      responseMode: 'json-rpc',
    });
  }

  invalidateInteractiveRequests(reason = 'connection-replaced') {
    const interruptionIds = Array.from(this.permissionRequestIds.keys());
    const questionToolCallIds = Array.from(this.questionRequestIds.keys());
    if (!interruptionIds.length && !questionToolCallIds.length) return false;
    this.permissionRequestIds.clear();
    this.permissionRequestToolCallIds.clear();
    this.questionRequestIds.clear();
    this.emit('interaction_requests_invalidated', { interruptionIds, questionToolCallIds, reason });
    return true;
  }

  async sendJsonRpcResult(requestId, result) {
    const response = await this.requestHttp('/api/v1/acp', {
      method: 'POST',
      headers: makeHeaders({
        Accept: 'application/json, text/event-stream',
        'Content-Type': 'application/json',
        'acp-connection-id': this.connectionId,
      }),
      body: JSON.stringify({ jsonrpc: '2.0', id: requestId, result }),
      timeoutMs: DEFAULT_REQUEST_TIMEOUT_MS,
    });
    if (!response.ok) {
      let message = '';
      try {
        const payload = await response.json();
        message = payload?.error?.message || '';
      } catch (_) {}
      throw new Error(message || ('ACP response failed: ' + response.status + ' ' + response.statusText));
    }
  }

  mapPermissionDecisionToOptionId(decision) {
    if (decision === 'allowAll') return 'allow_always';
    if (decision === 'allow') return 'allow';
    if (decision === 'rejectAndExitPlan') return 'reject_and_exit_plan';
    return 'reject';
  }

  async respondToPermissionRequest(interruptionId, toolCallId, decision) {
    const mappedInterruptionId = this.permissionRequestIds.has(interruptionId)
      ? interruptionId
      : this.permissionRequestToolCallIds.get(toolCallId);
    if (!mappedInterruptionId) return false;
    const requestId = this.permissionRequestIds.get(mappedInterruptionId);
    if (requestId === undefined) return false;
    this.permissionRequestIds.delete(mappedInterruptionId);
    for (const [id, value] of this.permissionRequestToolCallIds.entries()) {
      if (value === mappedInterruptionId) this.permissionRequestToolCallIds.delete(id);
    }
    await this.sendJsonRpcResult(requestId, {
      outcome: { outcome: 'selected', optionId: this.mapPermissionDecisionToOptionId(decision) },
    });
    return true;
  }

  async submitQuestionAnswers(toolCallId, answers) {
    const requestId = this.questionRequestIds.get(toolCallId);
    if (requestId === undefined) return false;
    await this.sendJsonRpcResult(requestId, { outcome: 'submitted', answers });
    this.questionRequestIds.delete(toolCallId);
    return true;
  }

  async cancelQuestionAnswers(toolCallId) {
    const requestId = this.questionRequestIds.get(toolCallId);
    if (requestId === undefined) return false;
    await this.sendJsonRpcResult(requestId, { outcome: 'cancelled' });
    this.questionRequestIds.delete(toolCallId);
    return true;
  }

  async connect() {
    if (this.connected) return;

    this._connecting = true;
    this._connectionError = false;
    this.reconnectAttempts = 0;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await this.requestHttp('/api/v1/acp/connect', {
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
        this.invalidateInteractiveRequests('connection-replaced');
        this.releaseConnection(previousConnectionId);
        this.emit('connection/replaced', { previousConnectionId, connectionId: this.connectionId });
      }
      this.emit('connected', payload);

      // 连接成功后自动启用心跳 + GET SSE 通知流
      this.startHeartbeat();
      this.startNotificationStream();
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
    this.stopNotificationStream();

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
        await this.fetchJson('/api/v1/health');
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

  startNotificationStream(resetRetry = true) {
    this.stopNotificationStream();
    if (!this.connectionId) return;
    if (resetRetry) this._sseRetryAttempt = 0;
    this._sseAbortController = new AbortController();

    const onMessage = (message) => {
      this._sseRetryAttempt = 0;
      this.handleIncomingRpc(message);
    };
    const onError = () => this._scheduleNotificationReconnect();

    if (typeof window !== 'undefined' && window.electronAPI?.openCodeBuddyStream) {
      this._sseIpcStream = window.electronAPI.openCodeBuddyStream({
        url: `${this.apiBase}/api/v1/acp`,
        timeoutMs: 0,
        headers: makeHeaders({
          Accept: 'text/event-stream',
          'acp-connection-id': this.connectionId,
          ...(this.sessionToken ? { 'acp-session-token': this.sessionToken } : {}),
        }),
      }, { onMessage, onError });
      return;
    }

    this._openFetchNotificationStream(onMessage, onError).catch((err) => {
      if (err?.name !== 'AbortError') onError(err);
    });
  }

  stopNotificationStream() {
    if (this._sseReconnectTimer) {
      clearTimeout(this._sseReconnectTimer);
      this._sseReconnectTimer = null;
    }
    if (this._sseIpcStream) {
      try { this._sseIpcStream.close?.(); } catch (_) {}
      this._sseIpcStream = null;
    }
    if (this._sseAbortController) {
      this._sseAbortController.abort();
      this._sseAbortController = null;
    }
    this._sseBuffer = '';
  }

  _scheduleNotificationReconnect() {
    if (!this.connected || this.reconnecting || this._sseReconnectTimer) return;
    const delay = Math.min(2000 * (2 ** this._sseRetryAttempt), 60000);
    this._sseRetryAttempt = Math.min(this._sseRetryAttempt + 1, 10);
    this._sseReconnectTimer = setTimeout(() => {
      this._sseReconnectTimer = null;
      if (this.connected && !this.reconnecting) this.startNotificationStream(false);
    }, delay);
  }

  async _openFetchNotificationStream(onMessage, onError) {
    const response = await fetch(`${this.apiBase}/api/v1/acp`, {
      headers: makeHeaders({
        Accept: 'text/event-stream',
        'acp-connection-id': this.connectionId,
        ...(this.sessionToken ? { 'acp-session-token': this.sessionToken } : {}),
      }),
      signal: this._sseAbortController?.signal,
    });
    if (!response.ok) {
      onError(new Error(`ACP notification stream failed: ${response.status}`));
      return;
    }
    await this.readSseStream(response, onMessage);
    onError(new Error('ACP notification stream closed'));
  }

  _consumeSseText(chunk, onMessage) {
    this._sseBuffer += chunk;
    const parts = this._sseBuffer.split(/\r?\n\r?\n/);
    this._sseBuffer = parts.pop() || '';
    for (const part of parts) {
      const data = part
        .split(/\r?\n/)
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trim())
        .join('');
      if (!data) continue;
      try {
        onMessage(JSON.parse(data));
      } catch (_) { console.warn('ACP notification SSE JSON parse failed:', _); }
    }
  }

  async readSseStream(response, onMessage = (message) => this.handleIncomingRpc(message)) {
    const reader = response.body?.getReader?.();
    if (!reader) return;
    const decoder = new TextDecoder();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        this._consumeSseText(decoder.decode(value, { stream: true }), onMessage);
      }
      const tail = decoder.decode();
      if (tail) this._consumeSseText(tail, onMessage);
      if (this._sseBuffer.trim()) this._consumeSseText('\n\n', onMessage);
    } finally {
      reader.releaseLock?.();
    }
  }

  async initialize() {
    if (this.initialized) return;
    const result = await this.request('initialize', {
      protocolVersion: 1,
      clientInfo: { name: appName, version: appVersion },
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
    this.permissionRequestIds.clear();
    this.permissionRequestToolCallIds.clear();
    this.questionRequestIds.clear();

    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }

    this.stopHeartbeat();
    this.stopNotificationStream();
    if (previousConnectionId) await this.releaseConnection(previousConnectionId);
  }

  async releaseConnection(connectionId) {
    if (!connectionId) return;
    await this.requestHttp(`/api/v1/acp/connect/${encodeURIComponent(connectionId)}`, {
      method: 'DELETE',
      timeoutMs: 5000,
    }).catch(() => null);
  }

  requestStreamingIpc(payload, id, timeoutMs) {
    return new Promise((resolve, reject) => {
      let settled = false;
      let stream = null;
      let timeoutId = null;
      const cleanup = () => {
        if (timeoutId) clearTimeout(timeoutId);
        stream?.close?.();
      };
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        cleanup();
        callback(value);
      };
      const armTimeout = () => {
        if (timeoutId) clearTimeout(timeoutId);
        if (timeoutMs <= 0) return;
        timeoutId = setTimeout(() => {
          finish(reject, new Error(`ACP request idle timeout: ${payload.method}`));
        }, timeoutMs);
      };
      armTimeout();

      try {
        stream = window.electronAPI.openCodeBuddyStream({
          url: `${this.apiBase}/api/v1/acp`,
          method: 'POST',
          headers: makeHeaders({
            Accept: 'application/json, text/event-stream',
            'Content-Type': 'application/json',
            'acp-connection-id': this.connectionId,
            ...(this.sessionToken ? { 'acp-session-token': this.sessionToken } : {}),
          }),
          body: JSON.stringify(payload),
          timeoutMs,
          rpcId: id,
        }, {
          onMessage: (message) => {
            if (settled) return;
            armTimeout();
            if (!message?.method && message?.id !== undefined && message?.id !== null && String(message.id) === id) {
              if (message.error) {
                finish(reject, new Error(message.error.message || `ACP rpc error: ${payload.method}`));
              } else {
                finish(resolve, message.result ?? null);
              }
              return;
            }
            this.handleIncomingRpc(message);
          },
          onError: (error) => {
            finish(reject, new Error(typeof error === 'string' ? error : error?.message || `ACP stream failed: ${payload.method}`));
          },
          onEnd: (result) => {
            if (result?.ok === false) {
              finish(reject, new Error(`ACP POST failed: ${result.status || 0} ${result.statusText || ''}`.trim()));
            } else {
              finish(resolve, null);
            }
          },
        });
      } catch (error) {
        finish(reject, error);
      }
    });
  }

  async request(method, params = {}) {
    if (!this.connected || !this.connectionId) {
      throw new Error('ACP client is not connected');
    }

    const id = String(++this.requestCounter);
    const payload = { jsonrpc: '2.0', method, params, id };
    const isLongRunning = LONG_RUNNING_ACP_METHODS.has(method);
    if (isLongRunning && typeof window !== 'undefined' && window.electronAPI?.openCodeBuddyStream) {
      return this.requestStreamingIpc(payload, id, LONG_REQUEST_IDLE_TIMEOUT_MS);
    }

    const controller = new AbortController();
    let timeoutId = null;
    const armTimeout = () => {
      if (timeoutId) clearTimeout(timeoutId);
      const timeoutMs = isLongRunning ? LONG_REQUEST_IDLE_TIMEOUT_MS : DEFAULT_REQUEST_TIMEOUT_MS;
      if (timeoutMs <= 0) return;
      timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    };
    armTimeout();

    try {
      const response = await this.requestHttp('/api/v1/acp', {
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
      let eventBuffer = '';
      let matchedResult = null;
      let matchedResponse = false;
      const processMessages = (messages) => {
        for (const message of messages) {
          if (!message.method && message.id !== undefined && message.id !== null && String(message.id) === id) {
            matchedResponse = true;
            if (message.error) {
              throw new Error(message.error.message || `ACP rpc error: ${method}`);
            }
            matchedResult = message.result ?? null;
          } else {
            this.handleIncomingRpc(message);
          }
        }
      };
      const consumeChunk = (chunk, flush = false) => {
        text += chunk;
        const consumed = consumeEventStreamChunk(eventBuffer, chunk, flush);
        eventBuffer = consumed.buffer;
        processMessages(consumed.messages);
      };

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          armTimeout();
          consumeChunk(decoder.decode(value, { stream: true }));
        }
        consumeChunk(decoder.decode());
        consumeChunk('', true);
      } else {
        text = await response.text();
        processMessages(parseEventStreamMessages(text));
      }

      if (matchedResponse) return matchedResult;
      if (response.truncated) {
        throw new Error(`ACP 响应流意外中断: ${method}`);
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

// ===== 鉴权 =====
// 对照源：POST /api/v1/auth/login {password} -> {success, token?, error?}
// 成功后 token 存 sessionStorage（setAuthToken），所有请求经 makeHeaders 注入 Bearer
export async function authLogin(password, options = {}) {
  const baseUrl = String(options.baseUrl || '').replace(/\/$/, '');
  const response = await requestCodeBuddy(`${baseUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: makeHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ password }),
    timeoutMs: 15000,
  });
  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`;
    try { const err = await response.json(); if (err?.error) message = err.error; } catch (_) {}
    return { success: false, error: message };
  }
  const payload = await response.json();
  if (payload?.success) {
    // 仅当后端真发 token 才持久化为 Bearer；无 token 字段时**不**把密码当 bearer 落 sessionStorage
    // 旧兜底“用 password 作 bearer”会让明文密码长期驻留 sessionStorage，并在每次请求中重复携带；
    // 后端不返回 token 时，当前会话不需要 Bearer 鉴权。
    if (payload.token && options.persistToken !== false) setAuthToken(payload.token);
    return { success: true, token: payload.token || null };
  }
  return { success: false, error: payload?.error || 'login.error.incorrect' };
}

export function authLogout() { clearAuthToken(); }

// 查后端鉴权态：GET /api/v1/auth/status -> {authEnabled, authenticated}。
// 旧版服务没有该接口时继续兼容；其余网络或服务错误必须交给界面明确恢复。
export async function checkAuth() {
  const response = await requestCodeBuddy('/api/v1/auth/status');
  if (response.status === 404) return 'authenticated';
  if (response.status === 401) return 'login';
  if (!response.ok) throw new Error(`无法检查 CodeBuddy 登录状态 (${response.status || '无响应'})`);
  const payload = await response.json();
  const data = payload?.data ?? payload ?? {};
  return data.authEnabled && !data.authenticated ? 'login' : 'authenticated';
}

// API_BASE is now dynamic — use getApiBase() / setApiBase() instead
