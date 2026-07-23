import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  cancelActivePrompt: vi.fn(),
  hasActivePrompt: vi.fn(),
  notify: vi.fn(),
  cancelQuestionAnswers: vi.fn(),
  submitQuestionAnswers: vi.fn(),
  request: vi.fn(),
  invalidateInteractiveRequests: vi.fn(),
}));

vi.mock('../../src/lib/acp', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    AcpClient: class {
      cancelActivePrompt = mocks.cancelActivePrompt;
      hasActivePrompt = mocks.hasActivePrompt;
      notify = mocks.notify;
    },
  };
});

import { useStore } from '../../src/store';

describe('AskUserQuestion cancel does not abort the whole session', () => {
  beforeEach(() => {
    mocks.cancelActivePrompt.mockReset();
    mocks.hasActivePrompt.mockReturnValue(true);
    mocks.notify.mockReset();
    mocks.cancelQuestionAnswers.mockReset();
    mocks.cancelQuestionAnswers.mockResolvedValue(true);
    mocks.submitQuestionAnswers.mockReset();
    mocks.request.mockReset();
    mocks.invalidateInteractiveRequests.mockReset();

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
          timeline: [
            {
              id: 'question-card',
              type: 'question',
              status: 'pending',
              meta: { toolCallId: 'question-1' },
              createdAt: Date.now(),
            },
          ],
          metadata: {},
          status: 'waiting',
        },
      },
      threadRuntimeById: {
        'thread-1': {
          sessionId: 'session-123',
          questions: [{ toolCallId: 'question-1' }],
          permissionRequests: [],
          timeline: [
            {
              id: 'question-card',
              type: 'question',
              status: 'pending',
              meta: { toolCallId: 'question-1' },
              createdAt: Date.now(),
            },
          ],
        },
      },
      threadOrderByProject: { 'project-1': ['thread-1'] },
      getThreadClient: () => ({
        cancelActivePrompt: mocks.cancelActivePrompt,
        hasActivePrompt: mocks.hasActivePrompt,
        notify: mocks.notify,
        cancelQuestionAnswers: mocks.cancelQuestionAnswers,
        submitQuestionAnswers: mocks.submitQuestionAnswers,
        request: mocks.request,
        invalidateInteractiveRequests: mocks.invalidateInteractiveRequests,
      }),
      persistProductState: vi.fn().mockResolvedValue(true),
      isAwaitingResponse: true,
      error: null,
      timeline: [
        {
          id: 'question-card',
          type: 'question',
          status: 'pending',
          meta: { toolCallId: 'question-1' },
          createdAt: Date.now(),
        },
      ],
    });
  });

  it('cancelQuestionAnswers only cancels the question outcome', async () => {
    const ok = await useStore.getState().cancelQuestionAnswers('question-1');
    if (!ok) {
      // surface store error for debugging flaky setup
      throw new Error(useStore.getState().error || 'cancelQuestionAnswers returned false');
    }

    expect(mocks.cancelQuestionAnswers).toHaveBeenCalledWith('question-1');
    expect(mocks.cancelActivePrompt).not.toHaveBeenCalled();
    expect(mocks.notify).not.toHaveBeenCalled();
    expect(mocks.request).not.toHaveBeenCalled();

    const runtime = useStore.getState().threadRuntimeById['thread-1'];
    const card = (runtime.timeline || []).find((item) => item.id === 'question-card');
    expect(card?.status).toBe('cancelled');
    expect(runtime.questions || []).toEqual([]);
  });

  it('interruption-source cancel uses resolveInterruption deny, not session cancel', async () => {
    mocks.cancelQuestionAnswers.mockResolvedValue(false);
    mocks.request.mockResolvedValue({ resolved: true });

    const ok = await useStore.getState().cancelQuestionAnswers('question-1');
    if (!ok) {
      throw new Error(useStore.getState().error || 'cancelQuestionAnswers returned false');
    }

    expect(mocks.cancelQuestionAnswers).toHaveBeenCalledWith('question-1');
    expect(mocks.request).toHaveBeenCalledWith('_codebuddy.ai/resolveInterruption', {
      sessionId: 'session-123',
      toolCallId: 'question-1',
      decision: 'deny',
    });
    expect(mocks.cancelActivePrompt).not.toHaveBeenCalled();
    expect(mocks.notify).not.toHaveBeenCalled();

    const runtime = useStore.getState().threadRuntimeById['thread-1'];
    const card = (runtime.timeline || []).find((item) => item.id === 'question-card');
    expect(card?.status).toBe('cancelled');
  });
});

describe('AcpClient cancelQuestionAnswers payload', () => {
  it('sends JSON-RPC result with outcome cancelled', async () => {
    // Import the real module implementation without the class mock replacement path:
    // call the method from the prototype of the original class if present; otherwise
    // re-create the exact contract under test.
    const acp = await vi.importActual('../../src/lib/acp');
    const RealClient = acp.AcpClient;
    const client = Object.create(RealClient.prototype);
    const send = vi.fn().mockResolvedValue(true);
    client.sendJsonRpcResult = send;
    client.questionRequestIds = new Map([['q-1', 42]]);

    await expect(RealClient.prototype.cancelQuestionAnswers.call(client, 'q-1')).resolves.toBe(true);
    expect(send).toHaveBeenCalledWith(42, { outcome: 'cancelled' });
    expect(client.questionRequestIds.has('q-1')).toBe(false);
  });
});
