'use strict';

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp'];

/**
 * Build Electron dialog.showOpenDialog options for attachment:choose.
 * Pure helper so unit tests can lock kind → title/filters without mocking dialog.
 *
 * @param {{ kind?: string } | null | undefined} options
 * @returns {{ properties: string[], title: string, filters?: { name: string, extensions: string[] }[] }}
 */
function buildAttachmentChooseDialogOptions(options = {}) {
  const kind = String(options?.kind || 'all').toLowerCase();
  const dialogOptions = {
    properties: ['openFile', 'multiSelections'],
    title: '选择要发送的文件或图片',
  };
  if (kind === 'image') {
    dialogOptions.title = '选择图片';
    dialogOptions.filters = [{ name: 'Images', extensions: [...IMAGE_EXTENSIONS] }];
  } else if (kind === 'file') {
    dialogOptions.title = '选择文件';
  }
  return dialogOptions;
}

module.exports = {
  IMAGE_EXTENSIONS,
  buildAttachmentChooseDialogOptions,
};
