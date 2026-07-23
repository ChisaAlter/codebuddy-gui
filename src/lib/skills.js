/**
 * Skills discovery (CLI 2.125+). Read-only aggregation for Desktop.
 * Prefer HTTP if available; otherwise derive from installed plugins metadata.
 */
import { fetchJson } from './acp';

function normalizeSkill(raw, fallbackSource = 'unknown') {
  if (!raw || typeof raw !== 'object') {
    if (typeof raw === 'string' && raw.trim()) {
      return {
        id: raw.trim(),
        name: raw.trim(),
        source: fallbackSource,
        disabled: false,
        userInvocable: true,
        description: '',
      };
    }
    return null;
  }
  const name = String(raw.name || raw.id || raw.skill || '').trim();
  if (!name) return null;
  const disabled = raw.disabled === true
    || raw.enabled === false
    || raw.disable === true
    || String(raw.status || '').toLowerCase() === 'disabled';
  const userInvocable = raw.userInvocable !== false
    && raw.user_invocable !== false
    && raw.menuVisible !== false;
  return {
    id: String(raw.id || name),
    name,
    source: String(raw.source || raw.scope || raw.origin || fallbackSource),
    disabled,
    userInvocable,
    description: String(raw.description || ''),
    plugin: raw.plugin || raw.pluginName || null,
    raw,
  };
}

function extractSkillList(payload) {
  const data = payload?.data ?? payload;
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.skills)) return data.skills;
  if (Array.isArray(data?.items)) return data.items;
  return [];
}

/** GET /api/v1/skills when present; null on 404 so callers can fall back. */
export async function fetchSkillsHttp() {
  try {
    const payload = await fetchJson('/api/v1/skills');
    return extractSkillList(payload).map((item) => normalizeSkill(item)).filter(Boolean);
  } catch (error) {
    const message = String(error?.message || error || '');
    if (/\b404\b/.test(message) || /not found/i.test(message)) return null;
    throw error;
  }
}

/** Build a readonly skill inventory from plugin metadata. */
export function skillsFromPlugins(plugins) {
  const out = [];
  for (const plugin of Array.isArray(plugins) ? plugins : []) {
    const pluginName = plugin?.name || plugin?.id || 'plugin';
    const source = plugin?.marketplace
      ? `plugin:${plugin.marketplace}`
      : `plugin:${pluginName}`;
    const skills = Array.isArray(plugin?.skills) ? plugin.skills : [];
    for (const skill of skills) {
      const normalized = normalizeSkill(skill, source);
      if (!normalized) continue;
      out.push({
        ...normalized,
        plugin: pluginName,
        source: normalized.source === 'unknown' ? source : normalized.source,
      });
    }
  }
  return out;
}

export async function loadSkillsInventory(plugins = []) {
  const fromHttp = await fetchSkillsHttp();
  if (Array.isArray(fromHttp)) return fromHttp;
  return skillsFromPlugins(plugins);
}

export { normalizeSkill };
