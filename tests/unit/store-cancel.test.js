import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  request: vi.fn(),
}));

vi.mock('../../src/lib/acp', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    AcpClient: class {
      request = mocks.request;
    },
  };
});

import { useStore } from '../../src/store';

describe('store cancellation', () => {
  beforeEach(() => {
    mocks.request.mockReset();
    mocks.request.mockResolvedValue({ ok: true });
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
          timeline: [{
            id: 'assistant-1',
            type: 'message',
            role: 'assistant',
            content: 'Working',
            streaming: true,
            createdAt: Date.now(),
          }],
        },
      },
      getThreadClient: () => ({ request: mocks.request }),
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

  it('sends session/cancel before ending the local streaming state', async () => {
    await useStore.getState().cancelSession();

    expect(mocks.request).toHaveBeenCalledWith('session/cancel', {
      sessionId: 'session-123',
    });
    expect(useStore.getState().isAwaitingResponse).toBe(false);
    expect(useStore.getState().timeline.find((item) => item.role === 'assistant')?.streaming).toBe(false);
  });
});
