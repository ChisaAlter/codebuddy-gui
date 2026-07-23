import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fetchJson: vi.fn(),
}));

vi.mock('../../src/lib/acp', () => ({
  fetchJson: mocks.fetchJson,
}));

import { loadAgentsInventory, normalizeAgent } from '../../src/lib/agents';
import { loadSkillsInventory, skillsFromPlugins } from '../../src/lib/skills';

describe('skills inventory', () => {
  beforeEach(() => {
    mocks.fetchJson.mockReset();
  });

  it('derives skills from plugins when HTTP is 404', async () => {
    mocks.fetchJson.mockRejectedValue(new Error('404 not found'));
    const list = await loadSkillsInventory([
      { name: 'pack', marketplace: 'official', skills: [{ name: 'review', userInvocable: false }] },
    ]);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ name: 'review', userInvocable: false, plugin: 'pack' });
  });

  it('skillsFromPlugins marks disabled skills', () => {
    const list = skillsFromPlugins([{ name: 'p', skills: [{ name: 'x', disabled: true }] }]);
    expect(list[0].disabled).toBe(true);
  });
});

describe('agents inventory', () => {
  beforeEach(() => {
    mocks.fetchJson.mockReset();
  });

  it('returns empty list when agents API is missing', async () => {
    mocks.fetchJson.mockRejectedValue(new Error('404'));
    await expect(loadAgentsInventory()).resolves.toEqual([]);
  });

  it('normalizes mcpServers on agent definition', () => {
    const agent = normalizeAgent({
      name: 'researcher',
      mcpServers: [{ name: 'docs', command: 'npx' }],
      model: 'm1',
    });
    expect(agent.mcpServers).toHaveLength(1);
    expect(agent.model).toBe('m1');
  });
});
