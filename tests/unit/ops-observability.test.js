import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fetchJson: vi.fn(),
  requestCodeBuddy: vi.fn(),
}));

vi.mock('../../src/lib/acp', () => ({
  getApiBase: () => 'http://127.0.0.1:9',
  fetchJson: mocks.fetchJson,
  requestCodeBuddy: mocks.requestCodeBuddy,
}));

import {
  createScheduledTask,
  deleteSession,
  fetchScheduledTasks,
  fetchSessionStats,
  fetchStats,
  fetchTraceList,
  fetchWorkerLogs,
  renameSession,
} from '../../src/lib/ops';

describe('ops observability and session APIs', () => {
  beforeEach(() => {
    mocks.fetchJson.mockReset();
    mocks.requestCodeBuddy.mockReset();
  });

  it('fetchStats/sessionStats unwrap data payloads', async () => {
    mocks.fetchJson.mockResolvedValueOnce({ data: { sessions: 3 } });
    await expect(fetchStats()).resolves.toEqual({ sessions: 3 });

    mocks.fetchJson.mockResolvedValueOnce({ data: { tokens: 9 } });
    await expect(fetchSessionStats('s1')).resolves.toEqual({ tokens: 9 });
    await expect(fetchSessionStats('')).resolves.toBeNull();
  });

  it('fetchScheduledTasks returns empty without session and unwraps tasks', async () => {
    await expect(fetchScheduledTasks('')).resolves.toEqual([]);
    mocks.fetchJson.mockResolvedValueOnce({ data: { tasks: [{ id: 1 }] } });
    await expect(fetchScheduledTasks('s1')).resolves.toEqual([{ id: 1 }]);
  });

  it('createScheduledTask posts durable recurring task body', async () => {
    mocks.fetchJson.mockResolvedValueOnce({ data: { ok: true } });
    await createScheduledTask('s1', '0 9 * * *', 'hello');
    expect(mocks.fetchJson).toHaveBeenCalledWith(
      '/api/v1/scheduled-tasks',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          sessionId: 's1',
          cron: '0 9 * * *',
          prompt: 'hello',
          recurring: true,
          durable: true,
        }),
      }),
    );
  });

  it('fetchTraceList unwraps traces list', async () => {
    mocks.fetchJson.mockResolvedValueOnce({ traces: [{ id: 't1' }] });
    await expect(fetchTraceList()).resolves.toEqual([{ id: 't1' }]);
  });

  it('fetchWorkerLogs normalizes string and object payloads', async () => {
    await expect(fetchWorkerLogs('')).resolves.toBe('');
    mocks.fetchJson.mockResolvedValueOnce({ data: 'line1\nline2' });
    await expect(fetchWorkerLogs(42)).resolves.toMatchObject({
      content: 'line1\nline2',
      type: 'stdout',
    });
    mocks.fetchJson.mockResolvedValueOnce({
      data: { content: 'err', type: 'stderr', availableTypes: ['stderr'], logPath: '/tmp/a.log' },
    });
    await expect(fetchWorkerLogs(42, 'stderr')).resolves.toEqual({
      content: 'err',
      type: 'stderr',
      availableTypes: ['stderr'],
      logPath: '/tmp/a.log',
    });
  });

  it('deleteSession and renameSession guard empty ids/names', async () => {
    await expect(deleteSession('')).resolves.toBeUndefined();
    mocks.requestCodeBuddy.mockResolvedValueOnce({
      ok: true,
      status: 204,
      text: async () => '',
    });
    await deleteSession('s1');
    expect(mocks.requestCodeBuddy).toHaveBeenCalledWith(
      '/api/v1/sessions/s1',
      expect.objectContaining({ method: 'DELETE' }),
    );

    await expect(renameSession('s1', '  ')).rejects.toThrow(/会话名不能为空/);
    mocks.fetchJson.mockResolvedValueOnce({ data: { name: 'n' } });
    await expect(renameSession('s1', 'n')).resolves.toEqual({ name: 'n' });
  });
});
