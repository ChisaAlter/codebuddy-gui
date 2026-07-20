import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useStore } from '../../src/store';

function runtime(overrides = {}) {
  return {
    connectionState: 'connected',
    sessionId: 'session-1',
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
    models: [],
    modes: [],
    currentModel: null,
    currentMode: 'default',
    capabilities: {},
    ...overrides,
  };
}

describe('store product state flush', () => {
  let saveProductState;
  let saveProductStateSync;

  beforeEach(() => {
    saveProductState = vi.fn().mockResolvedValue({ ok: true });
    saveProductStateSync = vi.fn().mockReturnValue({ ok: true, state: {} });
    window.electronAPI = {
      saveProductState,
      saveProductStateSync,
    };
    useStore.setState({
      activeProjectId: 'project-1',
      activeThreadId: 'thread-1',
      projectOrder: ['project-1'],
      threadOrderByProject: { 'project-1': ['thread-1'] },
      projectsById: {
        'project-1': {
          id: 'project-1',
          name: 'Project',
          workspacePath: 'C:/Project',
          preferences: {},
        },
      },
      threadsById: {
        'thread-1': {
          id: 'thread-1',
          projectId: 'project-1',
          sessionId: 'session-1',
          title: 'Chat',
          draft: 'pending draft',
          timeline: [],
          metadata: {},
          status: 'idle',
        },
      },
      threadRuntimeById: {
        'thread-1': runtime({
          timeline: [{ id: 'msg-1', type: 'message', role: 'user', content: 'hello', createdAt: 1 }],
        }),
      },
      guiSettings: {},
      error: null,
    });
  });

  afterEach(() => {
    delete window.electronAPI;
  });

  it('returns false when saveProductStateSync is unavailable', () => {
    delete window.electronAPI.saveProductStateSync;
    expect(useStore.getState().flushProductStateSync()).toBe(false);
  });

  it('surfaces save failures and returns false', () => {
    saveProductStateSync.mockReturnValueOnce({ ok: false, error: 'disk full' });
    expect(useStore.getState().flushProductStateSync()).toBe(false);
    expect(useStore.getState().error).toContain('disk full');
  });

  it('flushes pending timeline timers into the sync snapshot', () => {
    useStore.getState().scheduleThreadTimelinePersist('thread-1');
    useStore.getState().patchThreadRuntime('thread-1', {
      timeline: [
        { id: 'msg-1', type: 'message', role: 'user', content: 'hello', createdAt: 1 },
        { id: 'msg-2', type: 'message', role: 'assistant', content: 'world', createdAt: 2 },
      ],
    });

    expect(useStore.getState().flushProductStateSync()).toBe(true);

    expect(saveProductStateSync).toHaveBeenCalledTimes(1);
    const snapshot = saveProductStateSync.mock.calls[0][0];
    expect(snapshot.threadsById['thread-1'].timeline.map((item) => item.id)).toEqual(['msg-1', 'msg-2']);
    expect(useStore.getState().threadsById['thread-1'].timeline.map((item) => item.id)).toEqual(['msg-1', 'msg-2']);
  });

  it('awaits concurrent async persist then flushes without throwing', async () => {
    let releaseSave;
    const saveStarted = new Promise((resolve) => {
      saveProductState.mockImplementationOnce(
        () =>
          new Promise((resolveSave) => {
            releaseSave = () => resolveSave({ ok: true });
            resolve();
          }),
      );
    });

    const pending = useStore.getState().persistProductState();
    await saveStarted;
    expect(useStore.getState().flushProductStateSync()).toBe(true);
    releaseSave();
    await expect(pending).resolves.toBe(true);
    expect(saveProductStateSync).toHaveBeenCalled();
  });
});
