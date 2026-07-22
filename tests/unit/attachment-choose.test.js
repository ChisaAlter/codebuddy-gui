import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  IMAGE_EXTENSIONS,
  buildAttachmentChooseDialogOptions,
} = require('../../electron/attachment-choose.cjs');

describe('buildAttachmentChooseDialogOptions', () => {
  it('defaults to all files without image filters', () => {
    const options = buildAttachmentChooseDialogOptions();
    expect(options.properties).toEqual(['openFile', 'multiSelections']);
    expect(options.title).toBe('选择要发送的文件或图片');
    expect(options.filters).toBeUndefined();
  });

  it('uses image title and png/jpg/jpeg/gif/webp filters for kind=image', () => {
    const options = buildAttachmentChooseDialogOptions({ kind: 'image' });
    expect(options.title).toBe('选择图片');
    expect(options.filters).toEqual([{ name: 'Images', extensions: [...IMAGE_EXTENSIONS] }]);
    expect(IMAGE_EXTENSIONS).toEqual(['png', 'jpg', 'jpeg', 'gif', 'webp']);
  });

  it('uses file title without filters for kind=file', () => {
    const options = buildAttachmentChooseDialogOptions({ kind: 'file' });
    expect(options.title).toBe('选择文件');
    expect(options.filters).toBeUndefined();
  });

  it('is case-insensitive for kind and treats unknown kinds as all', () => {
    expect(buildAttachmentChooseDialogOptions({ kind: 'IMAGE' }).title).toBe('选择图片');
    expect(buildAttachmentChooseDialogOptions({ kind: 'weird' }).title).toBe('选择要发送的文件或图片');
    expect(buildAttachmentChooseDialogOptions(null).title).toBe('选择要发送的文件或图片');
  });
});
