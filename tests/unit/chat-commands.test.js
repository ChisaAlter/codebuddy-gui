import { describe, expect, it } from 'vitest';
import {
  getSlashCommandSuggestions,
  slashCommandKeyboardAction,
  slashCommandSelectionText,
} from '../../src/lib/chat-commands';

const commands = [
  { name: 'compact', description: '压缩当前上下文', input: { hint: '[说明]' } },
  { name: 'commit', description: '创建 Git 提交' },
  { name: 'verify', description: '验证当前改动' },
];

describe('chat slash commands', () => {
  it('matches command names and descriptions after a slash', () => {
    expect(getSlashCommandSuggestions('/com', commands).map((item) => item.name)).toEqual(['compact', 'commit']);
    expect(getSlashCommandSuggestions('/验证', commands).map((item) => item.name)).toEqual(['verify']);
  });

  it('keeps the menu available with leading whitespace but closes it after arguments begin', () => {
    expect(getSlashCommandSuggestions('  /com', commands)).toHaveLength(2);
    expect(getSlashCommandSuggestions('/compact now', commands)).toEqual([]);
  });

  it('uses Enter and Tab to select a visible command instead of submitting a partial command', () => {
    expect(slashCommandKeyboardAction('Enter', true)).toBe('select');
    expect(slashCommandKeyboardAction('Tab', true)).toBe('select');
    expect(slashCommandKeyboardAction('ArrowDown', true)).toBe('next');
    expect(slashCommandKeyboardAction('ArrowUp', true)).toBe('previous');
    expect(slashCommandKeyboardAction('Escape', true)).toBe('dismiss');
    expect(slashCommandKeyboardAction('Enter', false)).toBe('submit');
  });

  it('normalizes command names when inserting a selection', () => {
    expect(slashCommandSelectionText({ name: 'compact' })).toBe('/compact ');
    expect(slashCommandSelectionText({ name: '/verify' })).toBe('/verify ');
  });
});
