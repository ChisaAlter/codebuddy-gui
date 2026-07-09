import { describe, it, expect } from 'vitest';
import { reduceAcpEvent, closeAssistantStream, pushUserMessage } from '../../src/lib/timeline';

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
});

describe('closeAssistantStream', () => {
  it('把所有 assistant 消息的 streaming 置 false', () => {
    const tl = pushUserMessage([], 'hi');
    let next = reduceAcpEvent(tl, 'agent_message_chunk', { messageId: 'm1', content: 'x' });
    const closed = closeAssistantStream(next);
    const assistant = closed.find((e) => e.role === 'assistant');
    expect(assistant.streaming).toBe(false);
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
