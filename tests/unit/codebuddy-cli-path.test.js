import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  findOnPath,
  quoteForCmd,
  resolveCodeBuddyJsEntry,
  resolveCodeBuddySpawnSpec,
  withAugmentedPath,
} = require('../../electron/codebuddy-cli-path.cjs');

function makeTempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

describe('codebuddy-cli-path', () => {
  const cleanup = [];

  afterEach(() => {
    while (cleanup.length) {
      const dir = cleanup.pop();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('quotes cmd arguments with spaces', () => {
    expect(quoteForCmd('C:\\Program Files\\app\\codebuddy.cmd')).toBe('"C:\\Program Files\\app\\codebuddy.cmd"');
    expect(quoteForCmd('plain')).toBe('plain');
  });

  it('finds codebuddy.cmd on PATH and resolves the npm JS entry', () => {
    const root = makeTempDir('codebuddy-cli-path-');
    cleanup.push(root);
    const binDir = path.join(root, 'npm');
    const entryDir = path.join(binDir, 'node_modules', '@tencent-ai', 'codebuddy-code', 'bin');
    fs.mkdirSync(entryDir, { recursive: true });
    const cmdPath = path.join(binDir, 'codebuddy.cmd');
    const entryPath = path.join(entryDir, 'codebuddy');
    const nodePath = path.join(binDir, 'node.exe');
    fs.writeFileSync(cmdPath, '@ECHO off\r\n');
    fs.writeFileSync(entryPath, '#!/usr/bin/env node\nconsole.log("ok")\n');
    fs.writeFileSync(nodePath, 'fake');

    const env = {
      Path: binDir,
      PATH: binDir,
      USERPROFILE: root,
      APPDATA: path.join(root, 'AppData', 'Roaming'),
      ProgramFiles: path.join(root, 'Program Files'),
      'ProgramFiles(x86)': path.join(root, 'Program Files (x86)'),
    };

    expect(findOnPath('codebuddy', env)).toBe(cmdPath);
    expect(resolveCodeBuddyJsEntry(cmdPath)).toBe(entryPath);

    const spec = resolveCodeBuddySpawnSpec(['--version'], env);
    expect(spec.resolved).toBe(true);
    expect(spec.command).toBe(nodePath);
    expect(spec.args).toEqual([entryPath, '--version']);
    expect(spec.source).toBe(cmdPath);
  });

  it('augments PATH with npm global dirs when missing', () => {
    if (process.platform !== 'win32') return;
    const root = makeTempDir('codebuddy-cli-augment-');
    cleanup.push(root);
    const npmDir = path.join(root, 'AppData', 'Roaming', 'npm');
    fs.mkdirSync(npmDir, { recursive: true });
    const env = {
      Path: 'C:\\Windows\\System32',
      PATH: 'C:\\Windows\\System32',
      USERPROFILE: root,
      APPDATA: path.join(root, 'AppData', 'Roaming'),
      ProgramFiles: path.join(root, 'Program Files'),
      'ProgramFiles(x86)': path.join(root, 'Program Files (x86)'),
    };
    const next = withAugmentedPath(env);
    expect(String(next.Path).toLowerCase()).toContain(npmDir.toLowerCase());
  });
});
