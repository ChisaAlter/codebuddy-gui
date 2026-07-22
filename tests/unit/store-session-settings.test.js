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
    promptStartedAt: null,
    activePromptRunId: null,
    promptDispatched: false,
    promptQueue: [],
    pendingAttachments: [],
    promptSuggestion: null,
    teamState: null,
    agentPhase: null,
    progress: null,
    historyReplayActive: false,
    models: [
      { id: 'hy3', name: 'Hy3' },
      { id: 'grok-4.5', name: 'Grok' },
    ],
    modes: [
      { id: 'default', name: 'Always Ask' },
      { id: 'plan', name: 'Plan' },
    ],
    currentModel: 'hy3',
    currentMode: 'default',
    thoughtLevel: 'enabled',
    capabilities: {},
    ...overrides,
  };
}

async function flushQueue() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('store session settings optimistic updates', () => {
  let request;

  beforeEach(() => {
    request = vi.fn().mockResolvedValue({});
    useStore.setState({
      activeProjectId: 'project-1',
      activeThreadId: 'thread-1',
      sessionId: 'session-ready',
      currentModel: 'hy3',
      currentMode: 'default',
      thoughtLevel: 'enabled',
      projectsById: {
        'project-1': { id: 'project-1', workspacePath: 'C:/Project' },
      },
      threadsById: {
        'thread-1': {
          id: 'thread-1',
          projectId: 'project-1',
          sessionId: 'session-ready',
          modelId: 'hy3',
          modeId: 'default',
          status: 'idle',
          metadata: {},
        },
      },
      threadRuntimeById: {
        'thread-1': runtime(),
      },
      error: null,
      getThreadClient: () => ({ request }),
      updateThreadRecord: vi.fn().mockImplementation(async (threadId, patch) => {
        useStore.setState((state) => ({
          threadsById: {
            ...state.threadsById,
            [threadId]: { ...state.threadsById[threadId], ...patch },
          },
        }));
        return true;
      }),
      persistProductState: vi.fn().mockResolvedValue(true),
    });
  });

  it('optimistically updates model before RPC resolves, then persists record', async () => {
    let release;
    request.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );

    const pending = useStore.getState().setModel('grok-4.5');
    await flushQueue();
    expect(useStore.getState().currentModel).toBe('grok-4.5');
    expect(useStore.getState().threadRuntimeById['thread-1'].currentModel).toBe('grok-4.5');

    release({});
    await expect(pending).resolves.toBe(true);
    expect(request).toHaveBeenCalledWith('session/set_model', {
      sessionId: 'session-ready',
      modelId: 'grok-4.5',
    });
    expect(useStore.getState().threadsById['thread-1'].modelId).toBe('grok-4.5');
  });

  it('rolls back model on RPC failure', async () => {
    request.mockRejectedValueOnce(new Error('model unavailable'));
    await expect(useStore.getState().setModel('grok-4.5')).resolves.toBe(false);
    expect(useStore.getState().currentModel).toBe('hy3');
    expect(useStore.getState().threadRuntimeById['thread-1'].currentModel).toBe('hy3');
    expect(useStore.getState().error).toContain('model unavailable');
  });

  it('no-ops when selecting the same model', async () => {
    await expect(useStore.getState().setModel('hy3')).resolves.toBe(true);
    expect(request).not.toHaveBeenCalled();
  });

  it('optimistically updates mode and rolls back on failure', async () => {
    request.mockRejectedValueOnce(new Error('mode denied'));
    await expect(useStore.getState().setMode('plan')).resolves.toBe(false);
    expect(useStore.getState().currentMode).toBe('default');
    expect(useStore.getState().threadRuntimeById['thread-1'].currentMode).toBe('default');
    expect(useStore.getState().error).toContain('mode denied');
  });

  it('optimistically updates thought level without persisting thread record', async () => {
    await expect(useStore.getState().setThoughtLevel('ultracode')).resolves.toBe(true);
    expect(request).toHaveBeenCalledWith('session/set_config_option', {
      sessionId: 'session-ready',
      configId: 'thought_level',
      value: 'ultracode',
    });
    expect(useStore.getState().thoughtLevel).toBe('ultracode');
    expect(useStore.getState().threadRuntimeById['thread-1'].thoughtLevel).toBe('ultracode');
    expect(useStore.getState().updateThreadRecord).not.toHaveBeenCalled();
  });

  it('rolls back thought level on RPC failure', async () => {
    request.mockRejectedValueOnce(new Error('thought level rejected'));
    await expect(useStore.getState().setThoughtLevel('ultracode')).resolves.toBe(false);
    expect(useStore.getState().thoughtLevel).toBe('enabled');
    expect(useStore.getState().threadRuntimeById['thread-1'].thoughtLevel).toBe('enabled');
    expect(useStore.getState().error).toContain('thought level rejected');
  });

  it('blocks thought level changes while a response is in progress', async () => {
    useStore.setState((state) => ({
      threadsById: {
        ...state.threadsById,
        'thread-1': { ...state.threadsById['thread-1'], status: 'running' },
      },
    }));
    await expect(useStore.getState().setThoughtLevel('ultracode')).resolves.toBe(false);
    expect(request).not.toHaveBeenCalled();
    expect(useStore.getState().error).toContain('当前回复进行中');
  });

  it('returns false when session is missing for setMode', async () => {
    useStore.setState({ sessionId: null });
    await expect(useStore.getState().setMode('plan')).resolves.toBe(false);
    expect(request).not.toHaveBeenCalled();
  });
});
