// 消息级 content-hash 去重：SSE 通知流和 POST 内联 SSE 可能推送同一 chunk。
const _seenContent = new Map();
export function resetSeenContent() { _seenContent.clear(); }

function isDuplicateChunk(messageId, content) {
  if (!messageId) return false;
  const hash = JSON.stringify(content);
  const last = _seenContent.get(messageId);
  if (last === hash) return true;
  _seenContent.set(messageId, hash);
  return false;
}

function getText(c) {
  if (typeof c === 'string') return c;
  if (c === null || c === undefined) return '';
  // 处理 ContentBlock 数组: [{type:'text', text:'hello'}, ...]
  if (Array.isArray(c)) {
    return c.map((block) => {
      if (typeof block === 'string') return block;
      if (typeof block === 'object' && block !== null) {
        return (block.type === 'text' ? (block.text || block.content || '') : (block.text || block.content || ''));
      }
      return String(block);
    }).join('');
  }
  // 处理单个 ContentBlock: {type:'text', text:'hello'}
  if (typeof c === 'object') {
    return c.text || c.content || '';
  }
  return String(c);
}

export function createTimelineEntry(partial = {}) {
  return {
    id: partial.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type: partial.type || 'message',
    role: partial.role || 'assistant',
    content: getText(partial.content),
    streaming: Boolean(partial.streaming),
    createdAt: partial.createdAt || Date.now(),
    raw: partial.raw || null,
    meta: partial.meta || {},
    messageId: partial.messageId || null,
    toolCallId: partial.toolCallId || null,
    status: partial.status || null,
    title: partial.title || null,
    kind: partial.kind || null,
    rawInput: partial.rawInput || null,
    rawOutput: partial.rawOutput || null,
    locations: partial.locations || null,
  };
}

function findLastByMessageId(timeline, type, messageId) {
  if (!messageId) return null;
  for (let i = timeline.length - 1; i >= 0; i -= 1) {
    const item = timeline[i];
    if (item.type === type && item.messageId === messageId) return item;
  }
  return null;
}

function findLastByToolCallId(timeline, toolCallId) {
  if (!toolCallId) return null;
  for (let i = timeline.length - 1; i >= 0; i -= 1) {
    const item = timeline[i];
    if (item.type === 'tool_call' && item.toolCallId === toolCallId) return item;
  }
  return null;
}

export function closeAssistantStream(timeline) {
  return timeline.map((item) =>
    item.type === 'message' && item.role === 'assistant'
      ? { ...item, streaming: false }
      : item,
  );
}

export function pushUserMessage(timeline, content) {
  return [
    ...timeline,
    createTimelineEntry({
      type: 'message',
      role: 'user',
      content,
      streaming: false,
    }),
  ];
}

export function pushSystemEvent(timeline, type, payload) {
  return [
    ...timeline,
    createTimelineEntry({
      type,
      role: 'system',
      raw: payload,
      meta: payload,
      content: typeof payload === 'string' ? payload : payload?.message || '',
      streaming: false,
    }),
  ];
}

function mergeUserChunk(timeline, payload) {
  const next = [...timeline];
  const messageId = payload?.messageId || null;
  const target = findLastByMessageId(next, 'message', messageId);
  if (target && target.role === 'user') {
    if (isDuplicateChunk(messageId, payload?.content)) return next;
    const index = next.lastIndexOf(target);
    next[index] = {
      ...target,
      content: target.content + getText(payload?.content),
      meta: { ...(target.meta || {}), ...(payload || {}) },
    };
    return next;
  }
  next.push(
    createTimelineEntry({
      type: 'message',
      role: 'user',
      content: getText(payload?.content),
      streaming: false,
      raw: payload,
      meta: payload,
      messageId,
    }),
  );
  return next;
}

function mergeAssistantChunk(timeline, payload) {
  const next = [...timeline];
  const messageId = payload?.messageId || null;
  const target = findLastByMessageId(next, 'message', messageId);
  if (target && target.role === 'assistant') {
    if (isDuplicateChunk(messageId, payload?.content)) return next;
    const index = next.lastIndexOf(target);
    next[index] = {
      ...target,
      content: target.content + getText(payload?.content),
      streaming: true,
      meta: { ...(target.meta || {}), ...(payload || {}) },
    };
    return next;
  }
  next.push(
    createTimelineEntry({
      type: 'message',
      role: 'assistant',
      content: getText(payload?.content),
      streaming: true,
      raw: payload,
      meta: payload,
      messageId,
    }),
  );
  return next;
}

function mergeThinkingChunk(timeline, payload) {
  const next = [...timeline];
  const messageId = payload?.messageId || null;
  const target = findLastByMessageId(next, 'thinking', messageId);
  if (target) {
    if (isDuplicateChunk(messageId, payload?.content)) return next;
    const index = next.lastIndexOf(target);
    next[index] = {
      ...target,
      content: target.content + getText(payload?.content),
      meta: { ...(target.meta || {}), ...(payload || {}) },
    };
    return next;
  }
  next.push(
    createTimelineEntry({
      type: 'thinking',
      role: 'assistant',
      content: getText(payload?.content) || payload?.message || '',
      raw: payload,
      meta: payload,
      messageId,
    }),
  );
  return next;
}

function mergeToolCall(timeline, payload, isUpdate = false) {
  const next = [...timeline];
  const toolCallId = payload?.toolCallId || null;
  const target = findLastByToolCallId(next, toolCallId);
  if (target) {
    const index = next.lastIndexOf(target);
    next[index] = {
      ...target,
      status: payload?.status || target.status,
      title: payload?.title || target.title,
      kind: payload?.kind || target.kind,
      content: payload?.content != null ? getText(payload.content) : target.content,
      rawInput: payload?.rawInput ?? target.rawInput,
      rawOutput: payload?.rawOutput ?? target.rawOutput,
      locations: payload?.locations ?? target.locations,
      meta: { ...(target.meta || {}), ...(payload || {}) },
      raw: payload,
    };
    return next;
  }
  next.push(
    createTimelineEntry({
      type: 'tool_call',
      role: 'assistant',
      raw: payload,
      meta: payload,
      messageId: payload?.messageId || null,
      toolCallId,
      status: payload?.status || (isUpdate ? 'update' : 'created'),
      title: payload?.title || null,
      kind: payload?.kind || null,
      content: getText(payload?.content),
      rawInput: payload?.rawInput || null,
      rawOutput: payload?.rawOutput || null,
      locations: payload?.locations || null,
    }),
  );
  return next;
}

export function reduceAcpEvent(timeline, eventType, payload) {
  if (eventType === 'message') {
    if (payload?.messageId && payload?.content) {
      return mergeAssistantChunk(timeline, payload);
    }
    return pushSystemEvent(timeline, 'message', payload);
  }

  if (eventType === 'agent_thought_chunk' || payload?.sessionUpdate === 'agent_thought_chunk') {
    return mergeThinkingChunk(timeline, payload);
  }

  if (eventType === 'agent_message_chunk' || payload?.sessionUpdate === 'agent_message_chunk') {
    return mergeAssistantChunk(timeline, payload);
  }

  if (eventType === 'user_message_chunk' || payload?.sessionUpdate === 'user_message_chunk') {
    return mergeUserChunk(timeline, payload);
  }

  if (eventType === 'tool_call' || payload?.sessionUpdate === 'tool_call') {
    return mergeToolCall(timeline, payload, false);
  }

  if (eventType === 'tool_call_update' || payload?.sessionUpdate === 'tool_call_update') {
    return mergeToolCall(timeline, payload, true);
  }

  if (eventType === 'thinking' || payload?.type === 'thinking' || payload?.sessionUpdate === 'thinking') {
    return mergeThinkingChunk(timeline, payload);
  }

  if (eventType === 'interruption_request' || payload?.sessionUpdate === 'interruption_request' || payload?.type === 'interruption') {
    return [
      ...timeline,
      createTimelineEntry({
        type: 'interruption',
        role: 'assistant',
        raw: payload,
        meta: payload,
        messageId: payload?.messageId || null,
        toolCallId: payload?.toolCallId || null,
      }),
    ];
  }

  if (eventType === 'question_request' || payload?.sessionUpdate === 'question_request' || payload?.type === 'question') {
    return [
      ...timeline,
      createTimelineEntry({
        type: 'question',
        role: 'assistant',
        raw: payload,
        meta: payload,
        messageId: payload?.messageId || null,
        toolCallId: payload?.toolCallId || null,
      }),
    ];
  }

  if (eventType === 'config_option_update' || payload?.sessionUpdate === 'config_option_update') {
    return pushSystemEvent(timeline, 'config_option_update', payload);
  }

  if (eventType === 'session_info_update' || payload?.sessionUpdate === 'session_info_update') {
    return pushSystemEvent(timeline, 'session_info_update', payload);
  }

  if (eventType === 'available_commands_update' || payload?.sessionUpdate === 'available_commands_update') {
    return pushSystemEvent(timeline, 'available_commands_update', payload);
  }

  if (eventType === 'usage_update' || payload?.sessionUpdate === 'usage_update') {
    return pushSystemEvent(timeline, 'usage_update', payload);
  }

  if (eventType === 'artifact' || payload?.type === 'artifact') {
    return pushSystemEvent(timeline, 'artifact', payload);
  }

  if (eventType === 'checkpoint' || payload?.type === 'checkpoint') {
    return pushSystemEvent(timeline, 'checkpoint', payload);
  }

  if (eventType === 'taskCreated' || eventType === 'taskStatus' || payload?.type === 'taskCreated' || payload?.type === 'taskStatus') {
    return pushSystemEvent(timeline, eventType, payload);
  }

  if (eventType === 'goal-progress' || eventType === 'goal-status' || payload?.type === 'goal-progress' || payload?.type === 'goal-status') {
    return pushSystemEvent(timeline, eventType, payload);
  }

  if (eventType === 'question_answered' || payload?.type === 'question_answered') {
    return [
      ...timeline,
      createTimelineEntry({
        type: 'question_answered',
        role: 'system',
        content: '已回答问题',
        raw: payload,
        meta: payload,
        streaming: false,
      }),
    ];
  }

  if (eventType === 'promptSuggestion' || payload?.type === 'promptSuggestion') {
    const suggestion = payload?.suggestion || (typeof payload === 'string' ? payload : '');
    return [
      ...timeline,
      createTimelineEntry({
        type: 'promptSuggestion',
        role: 'system',
        content: suggestion ? `建议: ${suggestion}` : '收到建议',
        raw: payload,
        meta: payload,
        streaming: false,
      }),
    ];
  }

  if (eventType === 'teamUpdate' || payload?.type === 'teamUpdate') {
    return [
      ...timeline,
      createTimelineEntry({
        type: 'teamUpdate',
        role: 'system',
        content: '团队更新',
        raw: payload,
        meta: payload,
        streaming: false,
      }),
    ];
  }

  if (eventType === 'initialized') return timeline; // 系统内部事件，不渲染到对话

  if (eventType === 'status_change' || eventType === 'model_update' || eventType === 'mode_update' || eventType === 'current_mode_update') {
    return pushSystemEvent(timeline, eventType, payload);
  }

  return pushSystemEvent(timeline, eventType, payload);
}
