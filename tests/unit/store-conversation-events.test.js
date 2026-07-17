import { beforeEach, describe, expect, it } from 'vitest';
import { useStore } from '../../src/store';

function runtime() {
  return {
    connectionState: 'connected',
    timeline: [],
    permissionRequests: [],
    questions: [],
    usage: null,
    availableCommands: [],
    isAwaitingResponse: false,
    promptQueue: [],
    pendingAttachments: [],
    promptSuggestion: null,
    teamState: null,
    agentPhase: null,
    progress: null,
    historyReplayActive: false,
    models: [],
    modes: [],
    currentModel: null,
    currentMode: 'default',
    capabilities: {},
  };
}

describe('store conversation event routing', () => {
  beforeEach(() => {
    useStore.setState({
      activeProjectId: 'project-1',
      activeThreadId: 'thread-1',
      projectsById: {
        'project-1': { id: 'project-1', workspacePath: 'C:/Project' },
      },
      threadsById: {
        'thread-1': { id: 'thread-1', projectId: 'project-1', sessionId: 'session-1', metadata: {} },
        'thread-2': { id: 'thread-2', projectId: 'project-1', sessionId: 'session-2', metadata: {} },
      },
      threadRuntimeById: {
        'thread-1': runtime(),
        'thread-2': runtime(),
      },
      ...runtime(),
      sessionId: 'session-1',
      error: null,
    });
  });

  it('ignores session updates broadcast to a client for a different thread session', () => {
    useStore.getState().handleConversationEvent({
      threadId: 'thread-1',
      type: 'session/update',
      detail: {
        sessionId: 'session-2',
        update: {
          sessionUpdate: 'agent_message_chunk',
          messageId: 'message-2',
          content: { type: 'text', text: 'belongs to thread 2' },
        },
      },
    });

    expect(useStore.getState().threadRuntimeById['thread-1'].timeline).toEqual([]);
  });

  it('keeps thought chunks streaming after the initial response wait ends', () => {
    useStore.getState().patchThreadRuntime('thread-1', { isAwaitingResponse: true });

    useStore.getState().handleConversationEvent({
      threadId: 'thread-1',
      type: 'session/update',
      detail: {
        sessionId: 'session-1',
        update: {
          sessionUpdate: 'agent_thought_chunk',
          messageId: 'thought-1',
          content: { type: 'text', text: '' },
        },
      },
    });

    const state = useStore.getState().threadRuntimeById['thread-1'];
    expect(state.isAwaitingResponse).toBe(false);
    expect(state.timeline[0]).toMatchObject({ type: 'thinking', streaming: true });
  });

  it('renders extension and JSON-RPC permission notifications for one tool call only once', () => {
    const extension = {
      sessionUpdate: 'interruption_request',
      sessionId: 'session-1',
      interruptionId: 'ir-tool-1',
      toolCallId: 'tool-1',
      responseMode: 'extension',
    };
    const jsonRpc = {
      sessionUpdate: 'interruption_request',
      sessionId: 'session-1',
      interruptionId: 'perm-7',
      toolCallId: 'tool-1',
      responseMode: 'json-rpc',
    };

    useStore.getState().handleConversationEvent({ threadId: 'thread-1', type: 'interruption_request', detail: extension });
    useStore.getState().handleConversationEvent({ threadId: 'thread-1', type: 'interruption_request', detail: jsonRpc });

    const state = useStore.getState().threadRuntimeById['thread-1'];
    expect(state.permissionRequests).toHaveLength(1);
    expect(state.timeline.filter((item) => item.type === 'interruption')).toHaveLength(1);
  });
});
