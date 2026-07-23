/**
 * Agents / subagent definitions (CLI 2.125 scoped MCP). Read-only.
 */
import { fetchJson } from './acp';

function normalizeAgent(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const name = String(raw.name || raw.id || raw.agent || '').trim();
  if (!name) return null;
  const mcpServers = Array.isArray(raw.mcpServers)
    ? raw.mcpServers
    : Array.isArray(raw.mcp_servers)
      ? raw.mcp_servers
      : Array.isArray(raw.mcp)
        ? raw.mcp
        : [];
  return {
    id: String(raw.id || name),
    name,
    description: String(raw.description || raw.prompt || '').slice(0, 500),
    model: raw.model || raw.modelId || null,
    source: String(raw.source || raw.scope || raw.origin || 'unknown'),
    mcpServers,
    raw,
  };
}

function extractAgents(payload) {
  const data = payload?.data ?? payload;
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.agents)) return data.agents;
  if (Array.isArray(data?.subagents)) return data.subagents;
  if (Array.isArray(data?.items)) return data.items;
  return [];
}

/** GET /api/v1/agents when present; null on 404. */
export async function fetchAgentsHttp() {
  try {
    const payload = await fetchJson('/api/v1/agents');
    return extractAgents(payload).map(normalizeAgent).filter(Boolean);
  } catch (error) {
    const message = String(error?.message || error || '');
    if (/\b404\b/.test(message) || /not found/i.test(message)) return null;
    throw error;
  }
}

export async function loadAgentsInventory() {
  const list = await fetchAgentsHttp();
  return Array.isArray(list) ? list : [];
}

export { normalizeAgent };
