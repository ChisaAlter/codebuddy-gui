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
  it('uses white tile for shell chrome and transparent mark inside the app', () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    const appSource = fs.readFileSync(path.join(root, 'src', 'App.jsx'), 'utf8');
    const sidebarSource = fs.readFileSync(path.join(root, 'src', 'components', 'ReplicaSidebar.jsx'), 'utf8');
    const mainSource = fs.readFileSync(path.join(root, 'electron', 'main.cjs'), 'utf8');

    expect(packageJson.build.win.icon).toBe('build/icon.ico');
    expect(packageJson.build.files).toContain('build/icon.ico');
    expect(packageJson.build.files).toContain('build/icon-mark.png');
    // In-app UI uses transparent mark only.
    expect(appSource).toContain("import appIconUrl from '../build/icon-mark.png'");
    expect(sidebarSource).toContain("import appIconMarkUrl from '../../build/icon-mark.png'");
    // Desktop / tray / window still use white-tile assets.
    expect(mainSource).toContain("path.join(__dirname, '..', 'build', 'icon.png')");
    expect(mainSource).toContain("app.setAppUserModelId('com.codebuddy.gui.cathead')");
    // Rounded white tile + green mark (desktop / taskbar / tray).
    expect(sha256('build/icon.png')).toBe('4AFFF4E20F31E9AA615D75155C79B885410EEE84B0A46C3C59D4BB55BCB96118');
    expect(sha256('build/icon.ico')).toBe('41FA2BD811158A7D67717EBD28539C5E3892095BF1CC39BC545743A25DD51FBA');
    // Transparent in-app mark (no white tile).
    expect(sha256('build/icon-mark.png')).toBe('97AE192DEA62DF95602DBE7D502933A2C17BC074BD090148CBD80F6BE49562B3');
  });
});
