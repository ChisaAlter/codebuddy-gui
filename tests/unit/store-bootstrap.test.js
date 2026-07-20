import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AcpRpcError, getAuthToken, setAuthToken } from '../../src/lib/acp';
import { runtimeAuthScopeChanged, useStore } from '../../src/store';

function successResponse(body) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}

describe('store bootstrap coordination', () => {
  beforeEach(() => {
    setAuthToken(null);
    window.electronAPI = {
      requestCodeBuddy: vi.fn().mockResolvedValue(successResponse({ authEnabled: false, authenticated: true })),
      ensureProjectRuntime: vi.fn().mockResolvedValue({
        projectId: 'project-1',
        status: 'running',
        port: 45678,
        password: null,
      }),
    };
    useStore.setState({
      activeProjectId: 'project-1',
      activeThreadId: 'thread-1',
      productStateLoaded: true,
      apiBase: 'http://127.0.0.1:63918',
      projectsById: {
        'project-1': { id: 'project-1', workspacePath: 'C:/Project', runtimePort: 45678 },
      },
      threadsById: {
        'thread-1': { id: 'thread-1', projectId: 'project-1', sessionId: 'session-1', metadata: {} },
      },
      threadRuntimeById: {},
      ensureProjectRuntime: vi.fn().mockResolvedValue({ projectId: 'project-1', status: 'running', port: 45678 }),
      initializeActiveThread: vi.fn().mockResolvedValue(true),
      initializeWorkspace: vi.fn().mockResolvedValue(true),
      refreshProjectViews: vi.fn().mockResolvedValue(true),
    });
  });

  afterEach(() => {
    setAuthToken(null);
    delete window.electronAPI;
  });

  it('shares one startup operation across StrictMode and reconnect callers', async () => {
    const state = useStore.getState();
    const first = state.bootstrap();
    const second = state.bootstrap();

    expect(second).toBe(first);
    await expect(first).resolves.toBe(true);
    expect(useStore.getState().ensureProjectRuntime).toHaveBeenCalledTimes(1);
    expect(useStore.getState().initializeActiveThread).toHaveBeenCalledTimes(1);
  });

  it('does not reset authentication when reconnecting to the same runtime base', async () => {
    useStore.setState({
      ensureProjectRuntime: useStore.getInitialState().ensureProjectRuntime,
      persistProductState: vi.fn().mockResolvedValue(true),
    });
    await useStore.getState().ensureProjectRuntime('project-1');
    setAuthToken('same-runtime-token');

    await useStore.getState().ensureProjectRuntime('project-1');

    expect(getAuthToken()).toBe('same-runtime-token');
  });

  it('only changes authentication scope when the runtime base changes', () => {
    expect(runtimeAuthScopeChanged('http://127.0.0.1:1000', 'http://127.0.0.1:1000')).toBe(false);
    expect(runtimeAuthScopeChanged('http://127.0.0.1:1000', 'http://127.0.0.1:2000')).toBe(true);
  });

  it('keeps the initialized ACP connection available when account authentication is required', async () => {
    const disconnect = vi.fn();
    const client = {
      connected: true,
      initialized: true,
      connectionState: 'connected',
      authMethods: [{ id: 'iOA', name: 'Login with iOA' }],
      initializeSession: vi
        .fn()
        .mockRejectedValue(
          new AcpRpcError('session/load', {
            code: -32000,
            message: 'Authentication required',
            data: { category: 'auth' },
          }),
        ),
      disconnect,
    };
    useStore.setState({
      activeThreadId: 'thread-auth',
      threadsById: {
        'thread-auth': {
          id: 'thread-auth',
          projectId: 'project-1',
          sessionId: 'session-auth',
          metadata: {},
        },
      },
      initializeActiveThread: useStore.getInitialState().initializeActiveThread,
      getThreadClient: vi.fn().mockReturnValue(client),
      updateActiveThread: vi.fn().mockResolvedValue(true),
      updateThreadRecord: vi.fn().mockResolvedValue(true),
    });

    await expect(useStore.getState().initializeActiveThread()).resolves.toBe(false);
    expect(disconnect).not.toHaveBeenCalled();
    expect(useStore.getState()).toMatchObject({
      connectionState: 'connected',
      codeBuddyAccountAuthState: 'required',
      codeBuddyAccountAuthMethods: [{ id: 'iOA' }],
    });
  });

  it('closes history-replayed message streams when session initialization finishes', async () => {
    const updateThreadRecord = vi.fn().mockResolvedValue(true);
    const client = {
      connected: false,
      initialized: false,
      connectionState: 'disconnected',
      initializeSession: vi.fn().mockImplementation(async () => {
        useStore.getState().handleThreadSessionUpdate('thread-history', {
          sessionUpdate: 'agent_message_chunk',
          messageId: 'history-final',
          content: { type: 'text', text: 'Recovered final answer' },
          _meta: { 'codebuddy.ai': { mode: 'history', offset: 42 } },
        });
        return {
          init: { agentCapabilities: {} },
          loaded: { sessionId: 'session-history', title: '/init' },
        };
      }),
    };
    useStore.setState({
      activeProjectId: 'project-1',
      activeThreadId: 'thread-history',
      projectsById: {
        'project-1': { id: 'project-1', workspacePath: 'C:/Project' },
      },
      threadsById: {
        'thread-history': {
          id: 'thread-history',
          projectId: 'project-1',
          sessionId: 'session-history',
          title: '/init',
          timeline: [],
          metadata: {},
          status: 'idle',
        },
      },
      threadRuntimeById: {},
      initializeActiveThread: useStore.getInitialState().initializeActiveThread,
      getThreadClient: vi.fn().mockReturnValue(client),
      updateActiveThread: vi.fn().mockResolvedValue(true),
      updateThreadRecord,
    });

    await expect(useStore.getState().initializeActiveThread()).resolves.toBe(true);

    const runtime = useStore.getState().threadRuntimeById['thread-history'];
    expect(runtime.timeline).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ content: 'Recovered final answer', streaming: false }),
      ]),
    );
    expect(runtime.historyReplayActive).toBe(false);
    expect(updateThreadRecord).toHaveBeenCalledWith(
      'thread-history',
      expect.objectContaining({
        status: 'idle',
        timeline: expect.arrayContaining([
          expect.objectContaining({ content: 'Recovered final answer', streaming: false }),
        ]),
      }),
    );
  });
  it('preserves persisted model and mode selections when they remain available after session load', async () => {
    const client = {
      connected: false,
      initialized: false,
      connectionState: 'disconnected',
      initializeSession: vi.fn().mockResolvedValue({
        init: { agentCapabilities: {} },
        loaded: {
          sessionId: 'session-persisted',
          title: 'Persisted thread',
          models: {
            currentModelId: 'hy3',
            availableModels: [
              { id: 'grok-4.5', name: 'Grok 4.5' },
              { id: 'hy3', name: 'Hy3' },
            ],
          },
          modes: {
            currentModeId: 'default',
            availableModes: [
              { id: 'default', name: 'Default' },
              { id: 'delegate', name: 'Delegate' },
            ],
          },
        },
      }),
    };
    const updateThreadRecord = vi.fn().mockImplementation(async (threadId, patch) => {
      useStore.setState((state) => ({
        threadsById: {
          ...state.threadsById,
          [threadId]: { ...state.threadsById[threadId], ...patch },
        },
      }));
      return true;
    });
    useStore.setState({
      activeProjectId: 'project-1',
      activeThreadId: 'thread-persisted',
      projectsById: {
        'project-1': { id: 'project-1', workspacePath: 'C:/Project', runtimePort: 45678 },
      },
      threadsById: {
        'thread-persisted': {
          id: 'thread-persisted',
          projectId: 'project-1',
          sessionId: 'session-persisted',
          title: 'Persisted thread',
          modelId: 'custom-local:grok-4.5',
          modeId: 'delegate',
          timeline: [],
          metadata: {},
          status: 'idle',
        },
      },
      threadRuntimeById: {},
      initializeActiveThread: useStore.getInitialState().initializeActiveThread,
      getThreadClient: vi.fn().mockReturnValue(client),
      updateActiveThread: vi.fn().mockResolvedValue(true),
      updateThreadRecord,
    });

    await expect(useStore.getState().initializeActiveThread()).resolves.toBe(true);

    const state = useStore.getState();
    expect(state.currentModel).toBe('grok-4.5');
    expect(state.currentMode).toBe('delegate');
    expect(state.threadRuntimeById['thread-persisted']).toMatchObject({
      currentModel: 'grok-4.5',
      currentMode: 'delegate',
    });
    expect(state.threadsById['thread-persisted']).toMatchObject({
      modelId: 'grok-4.5',
      modeId: 'delegate',
    });
  });

  it('restarts the embedded runtime and bootstraps after account login', async () => {
    const authenticate = vi.fn().mockResolvedValue({
      _meta: {
        'codebuddy.ai/userinfo': { userId: 'user-1', userName: 'user', userNickname: 'User' },
      },
    });
    const client = {
      connected: true,
      initialized: true,
      authMethods: [{ id: 'iOA', name: 'Login with iOA' }],
      authenticate,
    };
    const restartProjectRuntime = vi.fn().mockResolvedValue(true);
    const bootstrap = vi.fn().mockResolvedValue(true);
    useStore.setState({
      restartProjectRuntime,
      bootstrap,
      getThreadClient: vi.fn().mockReturnValue(client),
      codeBuddyAccountAuthState: 'required',
    });

    await expect(useStore.getState().authenticateCodeBuddyAccount()).resolves.toBe(true);
    // 公有云优先 external；fixture 仅提供 iOA 时回退到 iOA
    expect(authenticate).toHaveBeenCalledWith('iOA');
    expect(restartProjectRuntime).toHaveBeenCalledWith('project-1', { deferInitializationUntilAuth: true });
    expect(bootstrap).toHaveBeenCalledTimes(1);
    expect(useStore.getState()).toMatchObject({
      codeBuddyAccountAuthState: 'authenticated',
      codeBuddyAccountUser: { userId: 'user-1' },
    });
  });

  it('prefers external cloud login when multiple auth methods exist', async () => {
    const authenticate = vi.fn().mockResolvedValue({
      _meta: { 'codebuddy.ai/userinfo': { userId: 'user-2' } },
    });
    const client = {
      connected: true,
      initialized: true,
      authMethods: [
        { id: 'iOA', name: 'Login with iOA' },
        { id: 'external', name: 'Login via external browser' },
      ],
      authenticate,
    };
    useStore.setState({
      restartProjectRuntime: vi.fn().mockResolvedValue(true),
      bootstrap: vi.fn().mockResolvedValue(true),
      getThreadClient: vi.fn().mockReturnValue(client),
      codeBuddyAccountAuthState: 'required',
      updateThreadRecord: vi.fn().mockResolvedValue(true),
    });
    await expect(useStore.getState().authenticateCodeBuddyAccount()).resolves.toBe(true);
    expect(authenticate).toHaveBeenCalledWith('external');
  });
});

describe('session config option models', () => {
  it('restores model and mode choices from current CLI config options', () => {
    const patch = useStore.getState().applySessionConfigUpdate([
      {
        id: 'model',
        currentValue: 'hy3',
        options: [
          { value: 'hy3', label: 'HY 3' },
          { value: 'claude', label: 'Claude' },
        ],
      },
      {
        id: 'mode',
        currentValue: 'default',
        options: ['default', 'plan'],
      },
    ]);

    expect(patch).toMatchObject({
      currentModel: 'hy3',
      models: [
        { id: 'hy3', name: 'HY 3' },
        { id: 'claude', name: 'Claude' },
      ],
      currentMode: 'default',
      modes: [
        { id: 'default', name: 'default' },
        { id: 'plan', name: 'plan' },
      ],
    });
  });
});
