import React from 'react';
import { useStore } from '../store';

export default function ReplicaPluginsView() {
  const { plugins, refreshPlugins, error } = useStore();
  const [refreshing, setRefreshing] = React.useState(false);
  const [searchTerm, setSearchTerm] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState('all'); // 'all' | 'enabled' | 'disabled'
  const [showInstallModal, setShowInstallModal] = React.useState(false);
  const [installId, setInstallId] = React.useState('');
  const [installMarketplace, setInstallMarketplace] = React.useState('codebuddy');

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshPlugins();
    setRefreshing(false);
  };

  const pluginsList = Array.isArray(plugins) ? plugins : [];

  // Search + status filter
  const filtered = pluginsList.filter((p) => {
    if (statusFilter === 'enabled' && !(p.status === 'enabled' || p.enabled)) return false;
    if (statusFilter === 'disabled' && (p.status === 'enabled' || p.enabled)) return false;
    if (!searchTerm.trim()) return true;
    const q = searchTerm.toLowerCase();
    return (
      (p.name || '').toLowerCase().includes(q) ||
      (p.description || '').toLowerCase().includes(q)
    );
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
                setInstallMarketplace('codebuddy');
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
        {error && (
          <div className="mb-4 rounded-lg border border-[rgba(248,113,113,0.2)] bg-[rgba(248,113,113,0.1)] px-4 py-2.5 text-sm text-[#f87171]">
            {error}
            <button className="ml-3 underline text-xs" onClick={handleRefresh}>重试</button>
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

        {/* Empty state */}
        {filtered.length === 0 ? (
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
                    <div
                      className={`toggle-switch shrink-0 ${enabled ? 'toggle-switch-on' : 'toggle-switch-off'}`}
                      onClick={() => window.alert('功能开发中')}
                    >
                      <div className={`toggle-knob ${enabled ? 'toggle-knob-on' : ''}`} />
                    </div>
                  </div>

                  {/* Description */}
                  {p.description && (
                    <p className="text-xs text-[var(--color-text-muted)] line-clamp-2 mb-2">{p.description}</p>
                  )}

                  {/* Meta info */}
                  <div className="flex items-center gap-2 text-[10px] text-[var(--color-text-muted)] mb-3">
                    {p.scope && <span className="rounded bg-[var(--color-bg-tertiary)] px-1.5 py-0.5">{p.scope}</span>}
                    {p.marketplace && <span>{p.marketplace}</span>}
                    {p.version && <span>v{p.version}</span>}
                  </div>

                  {/* Uninstall */}
                  <div className="mt-auto pt-2 border-t border-[var(--color-border-muted)]">
                    <button
                      className="text-xs text-[var(--color-error)] hover:underline"
                      onClick={() => {
                        if (window.confirm(`确定要卸载插件 "${p.name}" 吗？`)) {
                          window.alert('功能开发中');
                        }
                      }}
                    >
                      卸载
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

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
                    <option value="codebuddy">CodeBuddy</option>
                    <option value="npm">npm</option>
                    <option value="github">GitHub</option>
                    <option value="custom">自定义</option>
                  </select>
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-[var(--color-border-default)]">
                <button className="btn-ghost text-xs" onClick={() => setShowInstallModal(false)}>取消</button>
                <button
                  className="btn-primary text-xs"
                  onClick={() => {
                    if (!installId.trim()) return;
                    window.alert('功能开发中');
                    setShowInstallModal(false);
                  }}
                  disabled={!installId.trim()}
                >
                  安装
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
