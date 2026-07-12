import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  saveSelectedFile: vi.fn(),
}));

vi.mock('@monaco-editor/react', () => ({
  default: () => null,
}));

vi.mock('../../src/store', () => ({
  useStore(selector) {
    return selector({
      selectedFile: 'src/example.js',
      filePreview: 'const value = true;\n',
      filePreviewLoading: false,
      fileDirty: true,
      fileSaving: false,
      setFilePreview: vi.fn(),
      saveSelectedFile: mocks.saveSelectedFile,
    });
  },
}));

import { EditorPane } from '../../src/components/ReplicaWorkspaceView';

describe('workspace editor saving', () => {
  let container;
  let root;

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    mocks.saveSelectedFile.mockReset();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  });

  it('invokes the real save action from the editor toolbar', async () => {
    await act(async () => root.render(React.createElement(EditorPane)));

    const saveButton = container.querySelector('button[title="保存文件 (Ctrl+S)"]');
    expect(saveButton).toBeTruthy();
    expect(saveButton.disabled).toBe(false);

    await act(async () => {
      saveButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(mocks.saveSelectedFile).toHaveBeenCalledTimes(1);
  });
});
