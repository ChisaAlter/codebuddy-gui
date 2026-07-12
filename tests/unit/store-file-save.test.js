import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fsWrite: vi.fn(),
  fsList: vi.fn(),
}));

vi.mock('../../src/lib/fs', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    fsWrite: mocks.fsWrite,
    fsList: mocks.fsList,
  };
});

import { useStore } from '../../src/store';

describe('workspace file saving', () => {
  beforeEach(() => {
    mocks.fsWrite.mockReset();
    mocks.fsWrite.mockResolvedValue({ ok: true });
    mocks.fsList.mockReset();
    mocks.fsList.mockResolvedValue([]);
    useStore.setState({
      selectedFile: 'src/example.js',
      fileCwd: 'src',
      filePreview: 'const before = true;\n',
      fileSavedContent: 'const before = true;\n',
      fileDirty: false,
      fileSaving: false,
      error: null,
    });
  });

  it('marks edited content dirty and writes the selected file', async () => {
    useStore.getState().setFilePreview('const after = true;\n');
    expect(useStore.getState().fileDirty).toBe(true);

    await expect(useStore.getState().saveSelectedFile()).resolves.toBe(true);

    expect(mocks.fsWrite).toHaveBeenCalledWith('src/example.js', 'const after = true;\n');
    expect(useStore.getState()).toMatchObject({
      fileSavedContent: 'const after = true;\n',
      fileDirty: false,
      fileSaving: false,
    });
  });

  it('keeps newer edits dirty when they arrive while a save is in flight', async () => {
    let finishWrite;
    mocks.fsWrite.mockImplementation(() => new Promise((resolve) => { finishWrite = resolve; }));
    useStore.getState().setFilePreview('first edit\n');

    const saving = useStore.getState().saveSelectedFile();
    useStore.getState().setFilePreview('second edit\n');
    finishWrite({ ok: true });
    await saving;

    expect(useStore.getState()).toMatchObject({
      fileSavedContent: 'first edit\n',
      filePreview: 'second edit\n',
      fileDirty: true,
      fileSaving: false,
    });
  });
});
