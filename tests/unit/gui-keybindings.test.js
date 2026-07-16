import { describe, expect, it } from 'vitest';
import { guiShortcutAllowedInInput } from '../../src/lib/gui-keybindings';

describe('GUI keybindings in text inputs', () => {
  it('allows command-modified shortcuts without capturing normal typing', () => {
    expect(guiShortcutAllowedInInput('ctrl+b')).toBe(true);
    expect(guiShortcutAllowedInInput('ctrl+alt+n')).toBe(true);
    expect(guiShortcutAllowedInInput('meta+1')).toBe(true);
    expect(guiShortcutAllowedInInput('alt+ArrowLeft')).toBe(true);
    expect(guiShortcutAllowedInInput('b')).toBe(false);
    expect(guiShortcutAllowedInInput('shift+b')).toBe(false);
  });
});