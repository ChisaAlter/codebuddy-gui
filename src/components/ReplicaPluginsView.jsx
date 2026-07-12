import React from 'react';
import { useStore } from '../store';

export default function ReplicaPluginsView() {
  const { plugins, refreshPlugins, marketplaces, pluginError, pluginBusy, installPluginByName, uninstallPluginByName, togglePluginByName, addMarketplaceById, removeMarketplaceById, refreshMarketplaces } = useStore();
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [searchTerm, setSearchTerm] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState('all'); // 'all' | 'enabled' | 'disabled'
  const [showInstallModal, setShowInstallModal] = React.useState(false);
  const [installId, setInstallId] = React.useState('');
  const [installMarketplace, setInstallMarketplace] = React.useState('');
  const [installing, setInstalling] = React.useState(false);
  const [installMsg, setInstallMsg] = React.useState(null);
  const [actionError, setActionError] = React.useState(null);
  // 市场增删表单态
  const [newMktId, setNewMktId] = React.useState('');
  const [newMktUrl, setNewMktUrl] = React.useState('');
  const [mktBusy, setMktBusy] = React.useState(false);
  const [mktMsg, setMktMsg] = React.useState(null);

  const handleRefresh = React.useCallback(async () => {
    setRefreshing(true);
    setActionError(null);
    useStore.setState({ pluginError: null });
    try {
      const results = await Promise.all([refreshPlugins(), refreshMarketplaces?.()]);
      if (results.some((ok) => ok === false)) {
        setActionError(useStore.getState().pluginError || '部分插件数据加载失败');
      }
    } catch (error) {
      setActionError(error?.message || '插件数据加载失败');
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, [refreshMarketplaces, refreshPlugins]);

  React.useEffect(() => {
    handleRefresh();
  }, [handleRefresh]);

  const pluginsList = Array.isArray(plugins) ? plugins : [];

  // Search + status filter
  const filtered = pluginsList.filter((p) => {
    if (statusFilter === 'enabled' && !(p.status === 'enabled' || p.enabled)) return false;
    if (statusFilter === 'disabled' && (p.status === 'enabled' || p.enabled)) return false;
    if (!searchTerm.trim()) return true;
    const q = searchTerm.toLowerCase();
    const searchable = [
      p.name,
      p.description,
      p.marketplace,
      p.installScope || p.scope,
      typeof p.author === 'string' ? p.author : p.author?.name,
      ...(Array.isArray(p.keywords) ? p.keywords : []),
      ...(Array.isArray(p.skills) ? p.skills.map((skill) => skill.name) : []),
    ].filter(Boolean).join(' ').toLowerCase();
    return searchable.includes(q);
  });

  const isEnabled = (p) => p.status === 'enabled' || p.enabled;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-[var(--color-bg-primary)]">
      <div className="mx-auto w-full max-w-5xl px-8 py-8">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-lg font-semibold text-[var(--color-text-primary)]">插件</h1>
          <div className="flex items-center gap-2">
            <button
              className="btn-primary text-xs"
              onClick={() => {
                setInstallId('');
                setInstallMarketplace('');
                setShowInstallModal(true);
              }}
            >
              + 安装插件
            </button>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center gap-1.5 rounded-md border border-[var(--color-border-default)] px-3 py-1.5 text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)] transition-colors disabled:opacity-50"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className={refreshing ? 'animate-spin' : ''}>
                <path d="M1 8a7 7 0 0113.29-4M15 8a7 7 0 01-13.29 4" />
                <path d="M13 1v4h-4M3 15v-4h4" />
              </svg>
              {refreshing ? '刷新中...' : '刷新'}
            </button>
          </div>
        </div>

        {/* Error banner */}
        {(pluginError || actionError) && (
          <div className="mb-4 rounded-lg border border-[rgba(248,113,113,0.2)] bg-[rgba(248,113,113,0.1)] px-4 py-2.5 text-sm text-[#f87171]">
            {actionError || pluginError}
            <button className="ml-3 underline text-xs" onClick={() => { setActionError(null); handleRefresh(); }}>重试</button>
          </div>
        )}

        {/* Toolbar: search + filter tabs */}
        <div className="mb-4 flex items-center gap-3 flex-wrap">
          <input
            className="input-field max-w-[260px]"
            type="text"
            placeholder="搜索插件名称或描述..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <div className="tab-group">
            <button
              className={`tab ${statusFilter === 'all' ? 'active' : ''}`}
              onClick={() => setStatusFilter('all')}
            >
              全部
            </button>
            <button
              className={`tab ${statusFilter === 'enabled' ? 'active' : ''}`}
              onClick={() => setStatusFilter('enabled')}
            >
              已启用
            </button>
            <button
              className={`tab ${statusFilter === 'disabled' ? 'active' : ''}`}
              onClick={() => setStatusFilter('disabled')}
            >
              已禁用
            </button>
          </div>
        </div>

        {/* Loading skeleton */}
        {loading && pluginsList.length === 0 && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] p-4 flex flex-col"
              >
                {/* Plugin name + status badge + toggle row */}
                <div className="flex items-center gap-2 mb-2">
                  <div className="skeleton h-4 w-28" />
                  <div className="skeleton h-5 w-14 rounded-full ml-auto" />
                  <div className="skeleton h-5 w-8 rounded-full" />
                </div>
                {/* Description lines */}
                <div className="skeleton h-3 w-full mb-2" />
                <div className="skeleton h-3 w-3/4 mb-2" />
                {/* Meta badges area */}
                <div className="flex items-center gap-2 mb-3">
                  <div className="skeleton h-4 w-12 rounded" />
                  <div className="skeleton h-4 w-16 rounded" />
                </div>
                {/* Bottom actions area */}
                <div className="mt-auto pt-3 border-t border-[var(--color-border-muted)]">
                  <div className="skeleton h-3 w-10" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && (filtered.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[var(--color-border-muted)] py-16 text-center">
            <p className="text-sm text-[var(--color-text-muted)]">
              {pluginsList.length === 0 ? '暂无已安装插件' : '无匹配插件'}
            </p>
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">
              {pluginsList.length === 0 ? '插件将在扫描后自动列出' : '尝试更换筛选条件'}
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((p, idx) => {
              const enabled = isEnabled(p);
              const scope = p.installScope || p.scope;
              const author = typeof p.author === 'string' ? p.author : p.author?.name;
              const skillCount = Array.isArray(p.skills) ? p.skills.length : 0;
              return (
                <div
                  key={p.name || idx}
                  className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] p-4 flex flex-col"
                >
                  {/* Name + status + toggle */}
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm font-medium text-[var(--color-text-primary)] truncate flex-1">
                      {p.name || `插件 ${idx + 1}`}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium shrink-0 ${
                        enabled
                          ? 'bg-[rgba(74,222,128,0.1)] text-[#4ade80]'
                          : 'bg-[rgba(113,113,122,0.1)] text-[var(--color-text-muted)]'
                      }`}
                    >
                      {enabled ? '已启用' : '已禁用'}
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={enabled}
                      aria-label={`${enabled ? '禁用' : '启用'}插件 ${p.name}`}
                      className={`toggle-switch shrink-0 ${enabled ? 'toggle-switch-on' : 'toggle-switch-off'} ${pluginBusy === `toggle:${p.name}` ? 'opacity-50 pointer-events-none' : ''}`}
                      disabled={pluginBusy === `toggle:${p.name}`}
                      onClick={async () => {
                        setActionError(null);
                        const ok = await togglePluginByName(p.name, !enabled);
                        if (!ok) setActionError(useStore.getState().pluginError || '操作失败');
                      }}
                      title={enabled ? '点击禁用' : '点击启用'}
                    >
                      <div className={`toggle-knob ${enabled ? 'toggle-knob-on' : ''}`} />
                    </button>
                  </div>

                  {/* Description */}
                  {p.description && (
                    <p className="text-xs text-[var(--color-text-muted)] line-clamp-2 mb-2">{p.description}</p>
                  )}

                  {/* Meta info */}
                  <div className="mb-2 flex flex-wrap items-center gap-2 text-[10px] text-[var(--color-text-muted)]">
                    {scope && <span className="rounded bg-[var(--color-bg-tertiary)] px-1.5 py-0.5">{scope}</span>}
                    {p.marketplace && <span>{p.marketplace}</span>}
                    {p.version && <span>v{p.version}</span>}
                    {skillCount > 0 && <span>{skillCount} 个技能</span>}
                    {p.license && <span>{p.license}</span>}
                  </div>
                  {author ? <div className="mb-1 truncate text-[10px] text-[var(--color-text-muted)]" title={author}>作者：{author}</div> : null}
                  {p.installedPath ? <div className="mb-3 truncate text-[10px] text-[var(--color-text-muted)]" title={p.installedPath}>安装位置：{p.installedPath}</div> : null}

                  {/* Uninstall */}
                  <div className="mt-auto pt-2 border-t border-[var(--color-border-muted)]">
                    <button
                      className={`text-xs text-[var(--color-error)] hover:underline ${pluginBusy === `uninstall:${p.name}` ? 'opacity-50 pointer-events-none' : ''}`}
                      onClick={async () => {
                        if (!window.confirm(`确定要卸载插件 "${p.name}" 吗？`)) return;
                        setActionError(null);
                        const ok = await uninstallPluginByName(p.name);
                        if (!ok) setActionError(useStore.getState().pluginError || '卸载失败');
                      }}
                    >
                      {pluginBusy === `uninstall:${p.name}` ? '卸载中...' : '卸载'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ))}

        {/* Install Modal */}
        {showInstallModal && (
          <div className="overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowInstallModal(false); }}>
            <div className="modal-content w-[420px]">
              <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border-default)]">
                <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">安装插件</h3>
                <button
                  className="btn-icon"
                  onClick={() => setShowInstallModal(false)}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M4 4l8 8M12 4l-8 8" />
                  </svg>
                </button>
              </div>
              <div className="px-5 py-4 space-y-3">
                <div>
                  <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5">插件 ID</label>
                  <input
                    className="input-field"
                    type="text"
                    placeholder="输入插件 ID"
                    value={installId}
                    onChange={(e) => setInstallId(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5">Marketplace</label>
                  <select
                    className="input-field"
                    value={installMarketplace}
                    onChange={(e) => setInstallMarketplace(e.target.value)}
                  >
                    <option value="">默认来源</option>
                    {(marketplaces || []).map((marketplace, index) => {
                      const id = marketplace.id || marketplace.name || marketplace.marketplaceId || `market-${index}`;
                      return <option key={id} value={id}>{marketplace.name || id}</option>;
                    })}
                  </select>
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-[var(--color-border-default)]">
                <button className="btn-ghost text-xs" onClick={() => setShowInstallModal(false)}>取消</button>
                <button
                  className="btn-primary text-xs"
                  disabled={!installId.trim() || installing}
                  onClick={async () => {
                    if (!installId.trim()) return;
                    setInstalling(true);
                    setInstallMsg(null);
                    const ok = await installPluginByName(installId.trim(), installMarketplace);
                    setInstalling(false);
                    if (ok) {
                      setShowInstallModal(false);
                      setInstallId('');
                    } else {
                      setInstallMsg(useStore.getState().pluginError || '安装失败');
                    }
                  }}
                >
                  {installing ? '安装中...' : '安装'}
                </button>
              </div>
              {installMsg && <div className="px-5 pb-3 text-xs text-[var(--color-error)]">{installMsg}</div>}
            </div>
          </div>
        )}

        {/* Plugin Marketplaces 增删（对照源 POST/DELETE /api/v1/plugins/marketplaces/{id}）*/}
        <div className="mt-8 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">插件市场</h2>
            <button
              onClick={async () => {
                setMktBusy(true);
                setMktMsg(null);
                useStore.setState({ pluginError: null });
                try {
                  const ok = await refreshMarketplaces?.();
                  if (ok === false) setMktMsg(useStore.getState().pluginError || '刷新市场失败');
                } catch (error) {
                  setMktMsg(error?.message || '刷新市场失败');
                } finally {
                  setMktBusy(false);
                }
              }}
              disabled={mktBusy}
              className="btn-ghost text-xs"
              title="刷新市场列表"
            >
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className={mktBusy ? 'animate-spin inline-block mr-1' : 'inline-block mr-1'}>
                <path d="M1 8a7 7 0 0113.29-4M15 8a7 7 0 01-13.29 4" />
                <path d="M13 1v4h-4M3 15v-4h4" />
              </svg>
              刷新
            </button>
          </div>

          {/* 新增市场表单 */}
          <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_2fr_auto]">
            <input
              value={newMktId}
              onChange={(e) => setNewMktId(e.target.value)}
              placeholder="市场 ID（如 my-mkt）"
              className="input-field"
              aria-label="市场 ID"
            />
            <input
              value={newMktUrl}
              onChange={(e) => setNewMktUrl(e.target.value)}
              placeholder="市场 URL（https://...）"
              className="input-field"
              aria-label="市场 URL"
            />
            <button
              className="btn-primary text-xs"
              disabled={mktBusy || !newMktId.trim() || !newMktUrl.trim()}
              onClick={async () => {
                setMktBusy(true);
                setMktMsg(null);
                try {
                  const ok = await addMarketplaceById(newMktId.trim(), newMktUrl.trim() ? { url: newMktUrl.trim() } : {});
                  if (ok) { setNewMktId(''); setNewMktUrl(''); }
                  else setMktMsg(useStore.getState().pluginError || '新增市场失败');
                } finally {
                  setMktBusy(false);
                }
              }}
            >
              {mktBusy && pluginBusy?.startsWith('addMkt:') ? '添加中...' : '添加市场'}
            </button>
          </div>
          {mktMsg && <div className="mb-3 text-xs text-[var(--color-error)]">{mktMsg}</div>}
          {pluginError && pluginBusy?.startsWith('rmMkt:') && <div className="mb-3 text-xs text-[var(--color-error)]">{pluginError}</div>}

          {/* 市场列表 */}
          {(marketplaces || []).length === 0 ? (
            <div className="rounded-md border border-dashed border-[var(--color-border-muted)] py-6 text-center text-xs text-[var(--color-text-muted)]">
              暂无市场，添加上方表单注册一个
            </div>
          ) : (
            <div className="space-y-1.5">
              {(marketplaces || []).map((mkt, idx) => {
                const id = mkt.id || mkt.marketplaceId || mkt.name || `mkt-${idx}`;
                const busy = pluginBusy === `rmMkt:${id}`;
                return (
                  <div key={id} className="flex items-center gap-2 rounded-md border border-[var(--color-border-muted)] bg-[var(--color-bg-primary)] px-3 py-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex min-w-0 items-center gap-2">
                        <div className="truncate text-xs font-medium text-[var(--color-text-primary)]">{mkt.name || id}</div>
                        {mkt.type && <span className="shrink-0 rounded bg-[var(--color-bg-tertiary)] px-1.5 py-0.5 text-[10px] text-[var(--color-text-muted)]">{mkt.type}</span>}
                      </div>
                      {mkt.description && <div className="mt-0.5 truncate text-[11px] text-[var(--color-text-muted)]" title={mkt.description}>{mkt.description}</div>}
                      {(mkt.source || mkt.url) && <div className="truncate text-[11px] text-[var(--color-text-muted)]" title={mkt.source || mkt.url}>{mkt.source || mkt.url}</div>}
                    </div>
                    <button
                      disabled={busy}
                      className="btn-ghost shrink-0 text-xs text-[var(--color-error)]"
                      onClick={async () => {
                        if (!window.confirm(`确定删除市场 "${id}" 吗？`)) return;
                        setMktMsg(null);
                        const ok = await removeMarketplaceById(id);
                        if (!ok) setMktMsg(useStore.getState().pluginError || '删除市场失败');
                      }}
                    >
                      {busy ? '删除中...' : '删除'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
