import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useStore } from '../../src/store';

function runtime(overrides = {}) {
  return {
    connectionState: 'connected',
    sessionId: 'session-ready',
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
    currentModel: 'hy3',
    currentMode: 'default',
    capabilities: {},
    ...overrides,
  };
}

describe('store prompt session selection', () => {
  let request;

  beforeEach(() => {
    request = vi.fn().mockResolvedValue({ stopReason: 'end_turn' });
    useStore.setState({
      activeProjectId: 'project-1',
      activeThreadId: 'thread-1',
      projectsById: {
        'project-1': { id: 'project-1', workspacePath: 'C:/Project' },
      },
      threadsById: {
        'thread-1': { id: 'thread-1', projectId: 'project-1', sessionId: null, metadata: {} },
      },
      threadRuntimeById: {
        'thread-1': runtime(),
      },
      ...runtime(),
      error: null,
      getThreadClient: () => ({ request }),
      updateThreadRecord: vi.fn().mockResolvedValue(true),
      notifyThreadResult: vi.fn(),
    });
  });

  it('uses the connected runtime session while the persisted thread record is still catching up', async () => {
    await expect(useStore.getState().runThreadPrompt('thread-1', 'hello')).resolves.toBe(true);

    expect(request).toHaveBeenCalledWith('session/prompt', {
      sessionId: 'session-ready',
      prompt: [{ type: 'text', text: 'hello' }],
    });
  });
});
