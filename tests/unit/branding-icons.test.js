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
  it('uses the brand icon asset throughout the renderer and Windows package', () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    const appSource = fs.readFileSync(path.join(root, 'src', 'App.jsx'), 'utf8');
    const sidebarSource = fs.readFileSync(path.join(root, 'src', 'components', 'ReplicaSidebar.jsx'), 'utf8');
    const mainSource = fs.readFileSync(path.join(root, 'electron', 'main.cjs'), 'utf8');

    expect(packageJson.build.win.icon).toBe('build/icon.ico');
    expect(packageJson.build.files).toContain('build/icon.ico');
    expect(appSource).toContain("import appIconUrl from '../build/icon.png'");
    expect(sidebarSource).toContain("import appIconUrl from '../../build/icon.png'");
    expect(mainSource).toContain("app.setAppUserModelId('com.codebuddy.gui.cathead')");
    expect(sha256('build/icon.png')).toBe('8E73A06713B5DBF1E19F5D54BE30334FEDE0D2FEF4C7045E03E5DA5DAB2180AC');
    expect(sha256('build/icon.ico')).toBe('71FBBAEF584DE05037FC4C4983BE766AC2331B1DD1B2348F204791E13B07BBCB');
  });
});
