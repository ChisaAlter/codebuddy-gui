import { AcpClient } from './acp';

const FORWARDED_EVENTS = [
  'connected',
  'reconnecting',
  'reconnected',
  'reconnect_failed',
  'initialized',
  'session/update',
  'interruption_request',
  'question_request',
  'interaction_requests_invalidated',
  'message',
  'thinking',
  'model_update',
  'mode_update',
  'current_mode_update',
  'status_change',
  'promptSuggestion',
  'teamUpdate',
  '_codebuddy.ai/artifact',
  'checkpoint',
];

export class ConversationManager {
  constructor() {
    this.entries = new Map();
    this.eventTarget = new EventTarget();
  }

  onEvent(listener) {
    const handler = (event) => listener(event.detail);
    this.eventTarget.addEventListener('conversation-event', handler);
    return () => this.eventTarget.removeEventListener('conversation-event', handler);
  }

  emit(detail) {
    this.eventTarget.dispatchEvent(new CustomEvent('conversation-event', { detail }));
  }

  getClient(threadId, apiBase) {
    if (!threadId) throw new Error('threadId is required');
    let entry = this.entries.get(threadId);
    if (entry && entry.apiBase !== apiBase) {
      this.dispose(threadId);
      entry = null;
    }
    if (entry) return entry.client;

    const client = new AcpClient({ apiBase });
    const disposers = FORWARDED_EVENTS.map((type) => client.on(type, (event) => {
      this.emit({ threadId, type, detail: event.detail });
    }));
    this.entries.set(threadId, { apiBase, client, disposers });
    return client;
  }

  peek(threadId) {
    return this.entries.get(threadId)?.client || null;
  }

  async dispose(threadId) {
    const entry = this.entries.get(threadId);
    if (!entry) return;
    this.entries.delete(threadId);
    entry.client.invalidateInteractiveRequests('client-disposed');
    for (const dispose of entry.disposers) dispose();
    await entry.client.disconnect().catch(() => null);
  }

  async disposeProject(threadIds) {
    await Promise.allSettled((threadIds || []).map((threadId) => this.dispose(threadId)));
  }

  async disposeAll() {
    await Promise.allSettled(Array.from(this.entries.keys(), (threadId) => this.dispose(threadId)));
  }
}
