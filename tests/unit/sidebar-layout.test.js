import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  replicaSidebarFooterItems,
  replicaSidebarGroupInitiallyExpanded,
  replicaSidebarMainGroups,
  replicaSidebarWidthStyle,
} from '../../src/components/ReplicaSidebar';

const testRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('ReplicaSidebar layout', () => {
  it('lets the application shell follow the resized window instead of pinning the initial viewport width', () => {
    const appSource = fs.readFileSync(path.join(testRoot, 'src', 'App.jsx'), 'utf8');
    const cssSource = fs.readFileSync(path.join(testRoot, 'src', 'index.css'), 'utf8');

    expect(appSource).toContain('app-shell flex h-full w-full min-w-0');
    expect(appSource).not.toContain('app-shell flex h-screen w-screen');
    // rem root stays on html (16px); body/#root carry width fill + WebUI 15px type
    expect(cssSource).toMatch(/html\s*\{[\s\S]*?width:\s*100%;[\s\S]*?min-width:\s*0;/);
    expect(cssSource).toMatch(/body,\s*#root\s*\{[\s\S]*?width:\s*100%;[\s\S]*?min-width:\s*0;/);
    expect(cssSource).toMatch(/\.app-shell\s*\{[\s\S]*?width:\s*100%;[\s\S]*?max-width:\s*none;/);
  });
  it('pins collapsed and expanded widths against flex min-content growth', () => {
    expect(replicaSidebarWidthStyle(true)).toEqual({ width: 60, minWidth: 60, maxWidth: 60 });
    expect(replicaSidebarWidthStyle(false)).toEqual({
      width: 'clamp(220px, 21vw, 252px)',
      minWidth: 'clamp(220px, 21vw, 252px)',
      maxWidth: 'clamp(220px, 21vw, 252px)',
    });
  });

  it('animates sidebar width and keeps expanded panels mountable for smooth collapse', () => {
    const sidebarSource = fs.readFileSync(path.join(testRoot, 'src', 'components', 'ReplicaSidebar.jsx'), 'utf8');
    const cssSource = fs.readFileSync(path.join(testRoot, 'src', 'index.css'), 'utf8');
    expect(sidebarSource).toMatch(/data-collapsed=\{sidebarCollapsed \? 'true' : 'false'\}/);
    expect(sidebarSource).toContain('sidebar-expand-panel');
    expect(sidebarSource).toContain('sidebar-expand-label');
    expect(cssSource).toMatch(/\.sidebar-nav\s*\{[\s\S]*?transition:[\s\S]*?width/);
    expect(cssSource).toContain('.sidebar-expand-panel.is-collapsed');
    expect(cssSource).toMatch(/prefers-reduced-motion:\s*reduce/);
  });

  it('keeps the long workspace and observability groups folded by default', () => {
    expect(replicaSidebarGroupInitiallyExpanded('primary')).toBe(true);
    expect(replicaSidebarGroupInitiallyExpanded('workspace')).toBe(false);
    expect(replicaSidebarGroupInitiallyExpanded('observability')).toBe(false);
  });

  it('moves settings and keybindings out of the scrolling navigation into the footer', () => {
    expect(replicaSidebarMainGroups().map((group) => group.id)).not.toContain('preferences');
    // models page removed from footer — custom models live under Settings → 模型选择
    expect(replicaSidebarFooterItems().map((item) => item.id)).toEqual(['docs', 'settings', 'keybindings']);
  });

  it('omits the redundant chat button from primary navigation', () => {
    const primary = replicaSidebarMainGroups().find((group) => group.id === 'primary');
    expect(primary.items.map((item) => item.id)).toEqual(['instances', 'remote-control']);
  });
});
