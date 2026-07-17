import { describe, it, expect, vi } from 'vitest';
import {
  reduceAcpEvent,
  closeAssistantStream,
  executionGroupSummary,
  groupTimelineForDisplay,
  pushUserMessage,
} from '../../src/lib/timeline';

describe('reduceAcpEvent - timeline 归并', () => {
  it('agent_message_chunk 追加到同 messageId 的 assistant 消息', () => {
    const tl = pushUserMessage([], '你好');
    const next = reduceAcpEvent(tl, 'agent_message_chunk', {
      messageId: 'm1',
      content: 'Hello',
    });
    // 应新增一条 assistant 消息，streaming=true，content='Hello'
    const assistant = next.find((e) => e.role === 'assistant');
    expect(assistant).toBeTruthy();
    expect(assistant.content).toBe('Hello');
    expect(assistant.streaming).toBe(true);
    expect(assistant.messageId).toBe('m1');
  });

  it('思考 chunk 在正文开始前保持流式，并在正文开始时记录结束时间', () => {
    const now = vi.spyOn(Date, 'now');
    now.mockReturnValueOnce(1000).mockReturnValueOnce(1000).mockReturnValue(4000);

    let next = reduceAcpEvent([], 'agent_thought_chunk', { messageId: 'thought-1', content: '' });
    expect(next[0]).toMatchObject({ type: 'thinking', streaming: true, createdAt: 1000 });

    next = reduceAcpEvent(next, 'agent_message_chunk', { messageId: 'answer-1', content: '完成' });
    expect(next[0]).toMatchObject({ type: 'thinking', streaming: false, completedAt: 4000 });
    expect(next[1]).toMatchObject({ type: 'message', role: 'assistant', streaming: true });
    now.mockRestore();
  });

  it('同 messageId 的多次 chunk 合并 content', () => {
    const tl = pushUserMessage([], '你好');
    let next = reduceAcpEvent(tl, 'agent_message_chunk', { messageId: 'm1', content: 'Hello' });
    next = reduceAcpEvent(next, 'agent_message_chunk', { messageId: 'm1', content: ' World' });
    const assistant = next.find((e) => e.role === 'assistant');
    expect(assistant.content).toBe('Hello World');
    // 仍 streaming
    expect(assistant.streaming).toBe(true);
  });

  it('未知事件类型走 pushSystemEvent 返新数组不崩', () => {
    const tl = pushUserMessage([], 'x');
    const next = reduceAcpEvent(tl, 'unknown_event_type', { foo: 'bar' });
    // 兜底走 pushSystemEvent：返新数组（含原 timeline + 新 system 条目），不返原引用
    expect(Array.isArray(next)).toBe(true);
    expect(next.length).toBeGreaterThanOrEqual(tl.length);
  });

  it('payload 缺字段不崩（mergeAssistantChunk 兜底）', () => {
    const tl = pushUserMessage([], 'x');
    // payload=null：mergeAssistantChunk 内部应兜底不崩，返回数组（可能新数组）
    const next = reduceAcpEvent(tl, 'agent_message_chunk', null);
    expect(Array.isArray(next)).toBe(true);
  });

  it('重复加载同一条 assistant 历史消息时不再次拼接内容', () => {
    const payload = {
      sessionUpdate: 'agent_message_chunk',
      messageId: 'history-assistant',
      content: { type: 'text', text: '历史回复' },
      _meta: { 'codebuddy.ai': { mode: 'history' } },
    };
    let next = reduceAcpEvent([], 'agent_message_chunk', payload);
    next = reduceAcpEvent(next, 'agent_message_chunk', payload);

    expect(next[0].content).toBe('历史回复');
  });

  it('重复加载同一条 user 历史消息时不再次拼接内容', () => {
    const payload = {
      sessionUpdate: 'user_message_chunk',
      messageId: 'history-user',
      content: { type: 'text', text: '历史问题' },
      _meta: { 'codebuddy.ai': { mode: 'history' } },
    };
    let next = reduceAcpEvent([], 'user_message_chunk', payload);
    next = reduceAcpEvent(next, 'user_message_chunk', payload);

    expect(next[0].content).toBe('历史问题');
  });
});

describe('closeAssistantStream', () => {
  it('把所有 assistant 消息的 streaming 置 false', () => {
    const tl = pushUserMessage([], 'hi');
    let next = reduceAcpEvent(tl, 'agent_message_chunk', { messageId: 'm1', content: 'x' });
    const closed = closeAssistantStream(next);
    const assistant = closed.find((e) => e.role === 'assistant');
    expect(assistant.streaming).toBe(false);
  });

  it('结束响应时同时结束仍在计时的思考流', () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(5000);
    const closed = closeAssistantStream([
      { id: 'thought', type: 'thinking', role: 'assistant', createdAt: 1000, streaming: true },
    ]);

    expect(closed[0]).toMatchObject({ streaming: false, completedAt: 5000 });
    now.mockRestore();
  });

  it('非 assistant 条目不变', () => {
    const tl = pushUserMessage([], 'hi');
    const closed = closeAssistantStream(tl);
    const user = closed.find((e) => e.role === 'user');
    expect(user).toBeTruthy();
  });
});

describe('pushUserMessage', () => {
  it('追加一条 user 消息到 timeline 末尾', () => {
    const tl = pushUserMessage([], '测试');
    expect(tl).toHaveLength(1);
    expect(tl[0].role).toBe('user');
    expect(tl[0].content).toBe('测试');
  });

  it('不修改原 timeline 数组（返回新数组）', () => {
    const orig = pushUserMessage([], 'a');
    const next = pushUserMessage(orig, 'b');
    expect(orig).toHaveLength(1);
    expect(next).toHaveLength(2);
    expect(orig[0].content).toBe('a');
  });
});

describe('execution timeline grouping', () => {
  it('groups consecutive tool and activity events into one execution record', () => {
    const grouped = groupTimelineForDisplay([
      { id: 'answer', type: 'message', role: 'assistant', content: '完成' },
      { id: 'write', type: 'tool_call', status: 'completed', title: 'Write file' },
      { id: 'checkpoint', type: 'checkpoint', meta: { event: 'created' } },
      { id: 'run', type: 'tool_call', status: 'completed', title: 'Run tests' },
      { id: 'next', type: 'message', role: 'user', content: '继续' },
    ]);

    expect(grouped).toHaveLength(3);
    expect(grouped[1]).toMatchObject({ type: 'execution_group' });
    expect(grouped[1].items.map((item) => item.id)).toEqual(['write', 'checkpoint', 'run']);
  });

  it('summarizes completed and failed execution records in user-facing language', () => {
    expect(executionGroupSummary([
      { type: 'tool_call', status: 'completed' },
      { type: 'checkpoint' },
    ])).toEqual({ detail: '1 个工具 · 1 个检查点', status: '已完成', tone: 'success' });

    expect(executionGroupSummary([
      { type: 'tool_call', status: 'failed' },
    ])).toMatchObject({ status: '有失败项', tone: 'error' });
  });
});
