import React from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useStore } from '../store';
import { loadSkillsInventory } from '../lib/skills';
import { resolveLocaleMode, translate } from '../lib/i18n';

export default function ReplicaSkillsView() {
  const { plugins, guiSettings, activeProjectId } = useStore(useShallow((state) => ({
    plugins: state.plugins,
    guiSettings: state.guiSettings,
    activeProjectId: state.activeProjectId,
  })));
  const locale = resolveLocaleMode(guiSettings?.locale);
  const t = React.useCallback((key, vars) => translate(locale, key, vars), [locale]);
  const [skills, setSkills] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  const [query, setQuery] = React.useState('');

  const refresh = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await loadSkillsInventory(plugins);
      setSkills(Array.isArray(list) ? list : []);
    } catch (err) {
      setSkills([]);
      setError(err?.message || t('skills.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [plugins, t]);

  React.useEffect(() => {
    refresh();
  }, [activeProjectId, refresh]);

  const filtered = React.useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return skills;
    return skills.filter((skill) => {
      const hay = [skill.name, skill.source, skill.description, skill.plugin]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(term);
    });
  }, [skills, query]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto">
      <div className="page-header">
        <div>
          <h1 className="text-base font-semibold text-[var(--color-text-primary)]">{t('skills.title')}</h1>
          <p className="mt-1 text-xs text-[var(--color-text-muted)]">{t('skills.subtitle')}</p>
        </div>
        <button type="button" className="btn-ghost text-xs" onClick={refresh} disabled={loading}>
          {loading ? t('skills.loading') : t('skills.refresh')}
        </button>
      </div>
      <div className="page-content space-y-4">
        <div className="rounded-md border border-[var(--color-border-muted)] bg-[var(--color-bg-secondary)] px-3 py-2 text-xs leading-5 text-[var(--color-text-secondary)]">
          {t('skills.readonlyHint')}
        </div>
        <input
          className="input-field max-w-sm"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('skills.searchPlaceholder')}
          aria-label={t('skills.searchPlaceholder')}
        />
        {error ? <div className="text-xs text-[var(--color-error)]">{error}</div> : null}
        {loading && skills.length === 0 ? (
          <div className="text-sm text-[var(--color-text-muted)]">{t('skills.loading')}</div>
        ) : filtered.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[var(--color-border-muted)] py-12 text-center text-sm text-[var(--color-text-muted)]">
            {t('skills.empty')}
          </div>
        ) : (
          <div className="overflow-auto rounded-lg border border-[var(--color-border-default)]">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-[var(--color-bg-secondary)] text-[var(--color-text-muted)]">
                <tr>
                  <th className="px-3 py-2 font-medium">{t('skills.col.name')}</th>
                  <th className="px-3 py-2 font-medium">{t('skills.col.source')}</th>
                  <th className="px-3 py-2 font-medium">{t('skills.col.modelDefault')}</th>
                  <th className="px-3 py-2 font-medium">{t('skills.col.menu')}</th>
                  <th className="px-3 py-2 font-medium">{t('skills.col.description')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((skill) => (
                  <tr key={`${skill.source}:${skill.id}`} className="border-t border-[var(--color-border-muted)]">
                    <td className="px-3 py-2 font-medium text-[var(--color-text-primary)]">{skill.name}</td>
                    <td className="px-3 py-2 text-[var(--color-text-secondary)]">{skill.source}</td>
                    <td className="px-3 py-2">
                      {skill.disabled ? (
                        <span className="text-[var(--color-accent-yellow)]">{t('skills.disabled')}</span>
                      ) : (
                        <span className="text-[var(--color-accent-green)]">{t('skills.enabled')}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-[var(--color-text-secondary)]">
                      {skill.userInvocable ? t('skills.menuVisible') : t('skills.menuHidden')}
                    </td>
                    <td className="max-w-md truncate px-3 py-2 text-[var(--color-text-muted)]" title={skill.description}>
                      {skill.description || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
