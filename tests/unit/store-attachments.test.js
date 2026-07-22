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
    models: [],
    modes: [],
    currentModel: 'hy3',
    currentMode: 'default',
    capabilities: {},
    ...overrides,
  };
}

function seedStore(runtimeOverrides = {}) {
  useStore.setState({
    activeProjectId: 'project-1',
    activeThreadId: 'thread-1',
    projectsById: {
      'project-1': { id: 'project-1', workspacePath: 'C:/Project' },
    },
    threadsById: {
      'thread-1': { id: 'thread-1', projectId: 'project-1', sessionId: 'session-ready', metadata: {} },
    },
    threadRuntimeById: {
      'thread-1': runtime(runtimeOverrides),
    },
    ...runtime(runtimeOverrides),
    error: null,
    guiSettings: { enablePasteImageFromClipboard: true },
  });
}

describe('store attachment selection', () => {
  beforeEach(() => {
    seedStore();
    delete window.electronAPI;
  });

  it('rejects chooseAttachments when no thread is selected', async () => {
    useStore.setState({ activeThreadId: null, threadsById: {} });
    const added = await useStore.getState().chooseAttachments({ kind: 'file' });
    expect(added).toEqual([]);
    expect(useStore.getState().error).toContain('请先创建或选择一个会话');
  });

  it('rejects chooseAttachments when electron attachment API is missing', async () => {
    const added = await useStore.getState().chooseAttachments({ kind: 'image' });
    expect(added).toEqual([]);
    expect(useStore.getState().error).toContain('附件选择不可用');
  });

  it('forwards kind options to electronAPI.chooseAttachments', async () => {
    const chooseAttachments = vi.fn().mockResolvedValue([
      { kind: 'text', name: 'a.txt', path: 'C:/Project/a.txt', text: 'hello', size: 5 },
    ]);
    window.electronAPI = { chooseAttachments };

    await useStore.getState().chooseAttachments({ kind: 'file' });

    expect(chooseAttachments).toHaveBeenCalledWith({ kind: 'file' });
    expect(useStore.getState().threadRuntimeById['thread-1'].pendingAttachments).toHaveLength(1);
    expect(useStore.getState().threadRuntimeById['thread-1'].pendingAttachments[0].name).toBe('a.txt');
  });

  it('accepts image attachments when runtime declares image capability', async () => {
    seedStore({
      capabilities: { promptCapabilities: { image: true } },
    });
    window.electronAPI = {
      chooseAttachments: vi.fn().mockResolvedValue([
        {
          kind: 'image',
          name: 'shot.png',
          path: 'C:/Project/shot.png',
          mimeType: 'image/png',
          data: 'abc',
          size: 3,
        },
      ]),
    };

    const added = await useStore.getState().chooseAttachments({ kind: 'image' });
    expect(added).toHaveLength(1);
    expect(useStore.getState().error).toBeNull();
    expect(useStore.getState().threadRuntimeById['thread-1'].pendingAttachments[0]).toMatchObject({
      kind: 'image',
      name: 'shot.png',
    });
  });

  it('rejects image attachments when runtime lacks image capability', async () => {
    seedStore({ capabilities: { promptCapabilities: { image: false } } });
    window.electronAPI = {
      chooseAttachments: vi.fn().mockResolvedValue([
        {
          kind: 'image',
          name: 'shot.png',
          path: 'C:/Project/shot.png',
          mimeType: 'image/png',
          data: 'abc',
          size: 3,
        },
      ]),
    };

    const added = await useStore.getState().chooseAttachments({ kind: 'image' });
    expect(added).toEqual([]);
    expect(useStore.getState().threadRuntimeById['thread-1'].pendingAttachments).toEqual([]);
    expect(useStore.getState().error).toContain('未声明图片输入能力');
  });

  it('also accepts snake_case prompt_capabilities.image', async () => {
    seedStore({
      capabilities: { prompt_capabilities: { image: true } },
    });
    window.electronAPI = {
      chooseAttachments: vi.fn().mockResolvedValue([
        {
          kind: 'image',
          name: 'shot.png',
          path: 'C:/Project/shot.png',
          mimeType: 'image/png',
          data: 'abc',
          size: 3,
        },
      ]),
    };

    const added = await useStore.getState().chooseAttachments({ kind: 'image' });
    expect(added).toHaveLength(1);
    expect(useStore.getState().error).toBeNull();
  });

  it('skips duplicate path+kind attachments and still adds new ones', async () => {
    seedStore({
      pendingAttachments: [
        { kind: 'text', name: 'a.txt', path: 'C:/Project/a.txt', text: 'old', size: 3 },
      ],
      capabilities: { promptCapabilities: { image: true } },
    });
    window.electronAPI = {
      chooseAttachments: vi.fn().mockResolvedValue([
        { kind: 'text', name: 'a.txt', path: 'C:/Project/a.txt', text: 'new', size: 3 },
        { kind: 'text', name: 'b.txt', path: 'C:/Project/b.txt', text: 'b', size: 1 },
        {
          kind: 'image',
          name: 'a.png',
          path: 'C:/Project/a.txt',
          mimeType: 'image/png',
          data: 'x',
          size: 1,
        },
      ]),
    };

    const added = await useStore.getState().chooseAttachments({ kind: 'all' });
    expect(added.map((item) => item.name).sort()).toEqual(['a.png', 'b.txt']);
    const pending = useStore.getState().threadRuntimeById['thread-1'].pendingAttachments;
    expect(pending).toHaveLength(3);
    expect(pending.map((item) => `${item.kind}:${item.path}`).sort()).toEqual([
      'image:C:/Project/a.txt',
      'text:C:/Project/a.txt',
      'text:C:/Project/b.txt',
    ]);
  });

  it('surfaces unsupported attachment errors without clearing accepted files', async () => {
    window.electronAPI = {
      chooseAttachments: vi.fn().mockResolvedValue([
        { kind: 'unsupported', name: 'bin.dat', path: 'C:/Project/bin.dat', error: '该文件类型无法作为文本发送' },
        { kind: 'text', name: 'ok.txt', path: 'C:/Project/ok.txt', text: 'ok', size: 2 },
      ]),
    };

    const added = await useStore.getState().chooseAttachments();
    expect(added).toHaveLength(1);
    expect(useStore.getState().threadRuntimeById['thread-1'].pendingAttachments).toHaveLength(1);
    expect(useStore.getState().error).toContain('bin.dat');
    expect(useStore.getState().error).toContain('该文件类型无法作为文本发送');
  });

  it('applies late dialog results to the originating thread, not the newly active one', async () => {
    let resolveChoose;
    window.electronAPI = {
      chooseAttachments: vi.fn(
        () =>
          new Promise((resolve) => {
            resolveChoose = resolve;
          }),
      ),
    };

    const pending = useStore.getState().chooseAttachments({ kind: 'file' });
    useStore.setState({
      activeThreadId: 'thread-2',
      threadsById: {
        'thread-1': { id: 'thread-1', projectId: 'project-1', sessionId: 'session-ready' },
        'thread-2': { id: 'thread-2', projectId: 'project-1', sessionId: 'session-2' },
      },
      threadRuntimeById: {
        'thread-1': runtime(),
        'thread-2': runtime({ sessionId: 'session-2' }),
      },
    });
    resolveChoose([
      { kind: 'text', name: 'late.txt', path: 'C:/Project/late.txt', text: 'late', size: 4 },
    ]);

    await expect(pending).resolves.toHaveLength(1);
    expect(useStore.getState().threadRuntimeById['thread-1'].pendingAttachments).toHaveLength(1);
    expect(useStore.getState().threadRuntimeById['thread-2'].pendingAttachments).toEqual([]);
  });

  it('discards late dialog results when the originating thread was deleted', async () => {
    let resolveChoose;
    window.electronAPI = {
      chooseAttachments: vi.fn(
        () =>
          new Promise((resolve) => {
            resolveChoose = resolve;
          }),
      ),
    };

    const pending = useStore.getState().chooseAttachments({ kind: 'file' });
    useStore.setState({
      activeThreadId: 'thread-2',
      threadsById: {
        'thread-2': { id: 'thread-2', projectId: 'project-1', sessionId: 'session-2' },
      },
      threadRuntimeById: {
        'thread-2': runtime({ sessionId: 'session-2' }),
      },
    });
    resolveChoose([
      { kind: 'text', name: 'stale.txt', path: 'C:/Project/stale.txt', text: 's', size: 1 },
    ]);

    await expect(pending).resolves.toEqual([]);
    expect(useStore.getState().threadRuntimeById['thread-2'].pendingAttachments).toEqual([]);
  });

  it('merges dropped attachments through readDroppedAttachments', async () => {
    window.electronAPI = {
      readDroppedAttachments: vi.fn().mockResolvedValue([
        { kind: 'text', name: 'drop.txt', path: 'C:/Project/drop.txt', text: 'd', size: 1 },
      ]),
    };
    const files = [{ name: 'drop.txt', path: 'C:/Project/drop.txt' }];
    const result = await useStore.getState().addDroppedAttachments(files);
    expect(window.electronAPI.readDroppedAttachments).toHaveBeenCalledWith(files);
    expect(result.added).toHaveLength(1);
    expect(useStore.getState().threadRuntimeById['thread-1'].pendingAttachments[0].name).toBe('drop.txt');
  });

  it('removePendingAttachment removes only the matching path', () => {
    seedStore({
      pendingAttachments: [
        { kind: 'text', name: 'a.txt', path: 'C:/Project/a.txt', text: 'a', size: 1 },
        { kind: 'text', name: 'b.txt', path: 'C:/Project/b.txt', text: 'b', size: 1 },
      ],
    });
    useStore.getState().removePendingAttachment('C:/Project/a.txt');
    const pending = useStore.getState().threadRuntimeById['thread-1'].pendingAttachments;
    expect(pending).toHaveLength(1);
    expect(pending[0].path).toBe('C:/Project/b.txt');
  });

  it('blocks clipboard image paste when the setting is disabled', async () => {
    useStore.setState({ guiSettings: { enablePasteImageFromClipboard: false } });
    window.electronAPI = {
      saveClipboardImageAttachment: vi.fn(),
    };
    const added = await useStore.getState().addClipboardImageAttachment({
      mimeType: 'image/png',
      dataBase64: 'abc',
    });
    expect(added).toEqual([]);
    expect(window.electronAPI.saveClipboardImageAttachment).not.toHaveBeenCalled();
    expect(useStore.getState().error).toContain('剪贴板贴图未启用');
  });
});
