/**
 * Pure helpers for plugin list filtering and client-side infinite scroll.
 */

export const PLUGIN_KIND_ALL = 'all';
export const PLUGIN_KIND_OPTIONS = [
  { id: 'all', labelKey: 'plugins.kind.all' },
  { id: 'skills', labelKey: 'plugins.kind.skills' },
  { id: 'mcp', labelKey: 'plugins.kind.mcp' },
  { id: 'hooks', labelKey: 'plugins.kind.hooks' },
  { id: 'tools', labelKey: 'plugins.kind.tools' },
  { id: 'other', labelKey: 'plugins.kind.other' },
];

export function detectPluginKind(plugin) {
  if (!plugin || typeof plugin !== 'object') return 'other';
  const explicit = String(plugin.kind || plugin.type || plugin.category || '').toLowerCase();
  if (['skill', 'skills'].includes(explicit)) return 'skills';
  if (['mcp', 'mcp-server', 'mcpserver'].includes(explicit)) return 'mcp';
  if (['hook', 'hooks'].includes(explicit)) return 'hooks';
  if (['tool', 'tools'].includes(explicit)) return 'tools';

  const skillCount = Array.isArray(plugin.skills) ? plugin.skills.length : 0;
  const mcpCount = Array.isArray(plugin.mcpServers)
    ? plugin.mcpServers.length
    : plugin.mcp
      ? 1
      : 0;
  const hookCount = Array.isArray(plugin.hooks) ? plugin.hooks.length : 0;
  const toolCount = Array.isArray(plugin.tools) ? plugin.tools.length : 0;

  const hits = [
    skillCount > 0 ? 'skills' : null,
    mcpCount > 0 ? 'mcp' : null,
    hookCount > 0 ? 'hooks' : null,
    toolCount > 0 ? 'tools' : null,
  ].filter(Boolean);

  if (hits.length === 1) return hits[0];
  if (hits.length > 1) {
    // Prefer the largest contribution.
    const scored = [
      ['skills', skillCount],
      ['mcp', mcpCount],
      ['hooks', hookCount],
      ['tools', toolCount],
    ].sort((a, b) => b[1] - a[1]);
    if (scored[0][1] > 0) return scored[0][0];
  }
  return 'other';
}

export function filterPlugins(list, { query = '', status = 'all', kind = 'all' } = {}) {
  const term = String(query || '').trim().toLowerCase();
  return (Array.isArray(list) ? list : []).filter((p) => {
    if (!p) return false;
    const enabled = p.status === 'enabled' || p.enabled === true;
    if (status === 'enabled' && !enabled) return false;
    if (status === 'disabled' && enabled) return false;
    if (kind && kind !== 'all' && detectPluginKind(p) !== kind) return false;
    if (!term) return true;
    const hay = [
      p.name,
      p.id,
      p.description,
      p.marketplace,
      p.version,
      ...(Array.isArray(p.skills) ? p.skills.map((s) => s?.name || s) : []),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return hay.includes(term);
  });
}

/**
 * Client-side infinite scroll window.
 * @returns {{ items: any[], visible: number, total: number, hasMore: boolean }}
 */
export function slicePluginPage(list, visibleCount, pageSize = 30) {
  const total = Array.isArray(list) ? list.length : 0;
  const size = Math.max(1, Number(pageSize) || 30);
  const visible = Math.min(total, Math.max(0, Number(visibleCount) || size));
  return {
    items: (list || []).slice(0, visible),
    visible,
    total,
    hasMore: visible < total,
    nextVisible: Math.min(total, visible + size),
  };
}
