import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();

function sha256(relativePath) {
  return crypto
    .createHash('sha256')
    .update(fs.readFileSync(path.join(root, relativePath)))
    .digest('hex')
    .toUpperCase();
}

describe('CodeBuddy branding icons', () => {
  it('uses the cat head asset throughout the renderer and Windows package', () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    const appSource = fs.readFileSync(path.join(root, 'src', 'App.jsx'), 'utf8');
    const sidebarSource = fs.readFileSync(path.join(root, 'src', 'components', 'ReplicaSidebar.jsx'), 'utf8');
    const mainSource = fs.readFileSync(path.join(root, 'electron', 'main.cjs'), 'utf8');

    expect(packageJson.build.win.icon).toBe('build/icon.ico');
    expect(packageJson.build.files).toContain('build/icon.ico');
    expect(appSource).toContain("import appIconUrl from '../build/icon.png'");
    expect(sidebarSource).toContain("import appIconUrl from '../../build/icon.png'");
    expect(mainSource).toContain("app.setAppUserModelId('com.codebuddy.gui.cathead')");
    expect(sha256('build/icon.png')).toBe('7A9542907105481D79D827A423FFC45999763A65B6E15B8F1BA152FE7582DFD8');
    expect(sha256('build/icon.ico')).toBe('5CBCD9004CF5FE791581FEB6697FF5B8143932E23FA1B84BEC845964BE97DD04');
  });
});
