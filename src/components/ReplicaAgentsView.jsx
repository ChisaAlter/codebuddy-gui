import React from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useStore } from '../store';
import { loadAgentsInventory } from '../lib/agents';
import { resolveLocaleMode, translate } from '../lib/i18n';

export default function ReplicaAgentsView() {
  const { guiSettings, activeProjectId } = useStore(useShallow((state) => ({
    guiSettings: state.guiSettings,
    activeProjectId: state.activeProjectId,
  })));
  const locale = resolveLocaleMode(guiSettings?.locale);
  const t = React.useCallback((key, vars) => translate(locale, key, vars), [locale]);
  const [agents, setAgents] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  const [expandedId, setExpandedId] = React.useState(null);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await loadAgentsInventory();
      setAgents(Array.isArray(list) ? list : []);
    } catch (err) {
      setAgents([]);
      setError(err?.message || t('agents.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  React.useEffect(() => {
    refresh();
  }, [activeProjectId, refresh]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto">
      <div className="page-header">
        <div>
          <h1 className="text-base font-semibold text-[var(--color-text-primary)]">{t('agents.title')}</h1>
          <p className="mt-1 text-xs text-[var(--color-text-muted)]">{t('agents.subtitle')}</p>
        </div>
        <button type="button" className="btn-ghost text-xs" onClick={refresh} disabled={loading}>
          {loading ? t('agents.loading') : t('agents.refresh')}
        </button>
      </div>
      <div className="page-content space-y-4">
        <div className="rounded-md border border-[var(--color-border-muted)] bg-[var(--color-bg-secondary)] px-3 py-2 text-xs leading-5 text-[var(--color-text-secondary)]">
          {t('agents.readonlyHint')}
        </div>
        {error ? <div className="text-xs text-[var(--color-error)]">{error}</div> : null}
        {loading && agents.length === 0 ? (
          <div className="text-sm text-[var(--color-text-muted)]">{t('agents.loading')}</div>
        ) : agents.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[var(--color-border-muted)] py-12 text-center text-sm text-[var(--color-text-muted)]">
            {t('agents.empty')}
          </div>
        ) : (
          <div className="space-y-2">
            {agents.map((agent) => {
              const open = expandedId === agent.id;
              const mcpCount = Array.isArray(agent.mcpServers) ? agent.mcpServers.length : 0;
              return (
                <div key={agent.id} className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] p-4">
                  <button
                    type="button"
                    className="flex w-full items-start justify-between gap-3 text-left"
                    onClick={() => setExpandedId(open ? null : agent.id)}
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-[var(--color-text-primary)]">{agent.name}</div>
                      <div className="mt-0.5 text-[11px] text-[var(--color-text-muted)]">
                        {agent.source}
                        {agent.model ? ` · ${agent.model}` : ''}
                        {` · MCP ${mcpCount}`}
                      </div>
                      {agent.description ? (
                        <div className="mt-1 line-clamp-2 text-xs text-[var(--color-text-secondary)]">{agent.description}</div>
                      ) : null}
                    </div>
                    <span className="shrink-0 text-xs text-[var(--color-text-muted)]">{open ? '▲' : '▼'}</span>
                  </button>
                  {open ? (
                    <div className="mt-3 rounded-md border border-[var(--color-border-muted)] bg-[var(--color-bg-primary)] p-3">
                      <div className="mb-1 text-[11px] font-medium text-[var(--color-text-secondary)]">
                        {t('agents.scopedMcp')}
                      </div>
                      {mcpCount === 0 ? (
                        <div className="text-xs text-[var(--color-text-muted)]">{t('agents.noMcp')}</div>
                      ) : (
                        <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] text-[var(--color-text-secondary)]">
                          {JSON.stringify(agent.mcpServers, null, 2)}
                        </pre>
                      )}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
