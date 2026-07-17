import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  cancelActivePrompt: vi.fn(),
}));

vi.mock('../../src/lib/acp', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    AcpClient: class {
      cancelActivePrompt = mocks.cancelActivePrompt;
    },
  };
});

import { useStore } from '../../src/store';

describe('store cancellation', () => {
  beforeEach(() => {
    mocks.cancelActivePrompt.mockReset();
    mocks.cancelActivePrompt.mockReturnValue(true);
    useStore.setState({
      activeProjectId: 'project-1',
      activeThreadId: 'thread-1',
      sessionId: 'session-123',
      projectsById: {
        'project-1': { id: 'project-1', workspacePath: 'C:/Project' },
      },
      threadsById: {
        'thread-1': {
          id: 'thread-1',
          projectId: 'project-1',
          sessionId: 'session-123',
          timeline: [],
          metadata: {},
        },
      },
      threadRuntimeById: {
        'thread-1': {
          timeline: [
            {
              id: 'assistant-1',
              type: 'message',
              role: 'assistant',
              content: 'Working',
              streaming: true,
              createdAt: Date.now(),
            },
          ],
        },
      },
      threadOrderByProject: { 'project-1': ['thread-1'] },
      getThreadClient: () => ({ cancelActivePrompt: mocks.cancelActivePrompt }),
      persistProductState: vi.fn().mockResolvedValue(true),
      isAwaitingResponse: true,
      error: null,
      timeline: [
        {
          id: 'assistant-1',
          type: 'message',
          role: 'assistant',
          content: 'Working',
          streaming: true,
          createdAt: Date.now(),
        },
      ],
    });
  });

  it('aborts the local prompt stream without calling an unsupported RPC method', async () => {
    await useStore.getState().cancelSession();

    expect(mocks.cancelActivePrompt).toHaveBeenCalledWith('session-123');
    expect(useStore.getState().isAwaitingResponse).toBe(false);
    expect(useStore.getState().timeline.find((item) => item.role === 'assistant')?.streaming).toBe(false);
  });

  it('closes stale assistant streams when a project disconnects', async () => {
    await useStore.getState().disconnectProjectThreads('project-1');

    const runtime = useStore.getState().threadRuntimeById['thread-1'];
    expect(runtime.connectionState).toBe('disconnected');
    expect(runtime.isAwaitingResponse).toBe(false);
    expect(runtime.timeline.find((item) => item.role === 'assistant')?.streaming).toBe(false);
  });
});
