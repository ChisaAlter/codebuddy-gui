import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SETTINGS_GROUPS, WEBUI_MK_SETTING_KEYS } from '../../src/lib/codebuddy-schema.js';

/** Exact Mk key order from CLI 2.124 web-ui bundle (`Mk=[...]`). */
const WEBUI_MK_2_124 = [
  'model',
  'reasoningEffort',
  'alwaysThinkingEnabled',
  'autoCompactEnabled',
  'includeCoAuthoredBy',
  'fileCheckpointingEnabled',
  'promptSuggestionEnabled',
  'ignoreGitIgnore',
  'deferToolLoading',
  'hookOutputCollapsed',
  'memory.enabled',
  'memory.autoMemoryEnabled',
  'language',
  'cleanupPeriodDays',
  'imageHistoryRetainRounds',
  'env',
  'sandbox.enabled',
  'sandbox.autoAllowBashIfSandboxed',
];

const WEBUI_MK_GROUP_ORDER = [
  'modelAndReasoning',
  'behavior',
  'memory',
  'language',
  'advanced',
  'sandbox',
];

describe('WebUI 2.124 Mk settings schema', () => {
  it('exports the exact 18 Mk keys in order', () => {
    expect(WEBUI_MK_SETTING_KEYS).toEqual(WEBUI_MK_2_124);
    expect(WEBUI_MK_SETTING_KEYS).toHaveLength(18);
  });

  it('SETTINGS_GROUPS Mk groups match key order and contain no extras', () => {
    const mkGroups = SETTINGS_GROUPS.filter((group) => group.id !== 'appearance');
    expect(mkGroups.map((group) => group.id)).toEqual(WEBUI_MK_GROUP_ORDER);

    const keys = mkGroups.flatMap((group) => group.items.map((item) => item.key));
    expect(keys).toEqual(WEBUI_MK_2_124);
  });

  it('ReplicaSettingsView wires all 18 keys via updateSetting and section ids', () => {
    const viewPath = resolve(process.cwd(), 'src/components/ReplicaSettingsView.jsx');
    const source = readFileSync(viewPath, 'utf8');
    const updateKeys = [...source.matchAll(/updateSetting\('([^']+)'/g)].map((match) => match[1]);
    // preserve first-seen order
    const ordered = [];
    for (const key of updateKeys) {
      if (!ordered.includes(key)) ordered.push(key);
    }
    expect(ordered).toEqual(WEBUI_MK_2_124);

    for (const groupId of WEBUI_MK_GROUP_ORDER) {
      expect(source).toContain(`id="settings-section-settings-group-${groupId}"`);
    }
    for (const fixed of ['connection', 'appearance', 'model', 'mode', 'system']) {
      expect(source).toContain(`id="settings-section-${fixed}"`);
    }
    expect(source).toContain('data-desktop-only="true"');
  });
});
