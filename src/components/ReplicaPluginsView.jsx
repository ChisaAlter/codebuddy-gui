import React from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useStore } from '../store';
import { copyTextToClipboard } from '../lib/clipboard';
import { previewPluginDependencyPrune, prunePluginDependencies, updateInstalledPlugin } from '../lib/plugin-maintenance';

const PLUGIN_SCOPE_LABELS = {
  user: '用户全局',
  project: '项目共享',
  local: '项目本机',
};

function normalizedPluginScope(value) {
  return Object.hasOwn(PLUGIN_SCOPE_LABELS, value) ? value : 'user';
}

function validMaintenancePluginId(value) {
  const plugin = String(value || '').trim();
  return plugin.length > 0 && plugin.length <= 256 && /^[A-Za-z0-9][A-Za-z0-9._/@-]*$/.test(plugin);
}

export default function ReplicaPluginsView() {
  const { plugins, refreshPlugins, marketplaces, pluginError, marketplaceError, pluginBusy, installPluginByName, uninstallPluginByName, togglePluginByName, addMarketplaceById, removeMarketplaceById, refreshMarketplaces, restartProjectRuntime } = useStore(useShallow((state) => ({
    plugins: state.plugins,
    refreshPlugins: state.refreshPlugins,
    marketplaces: state.marketplaces,
    pluginError: state.pluginError,
    marketplaceError: state.marketplaceError,
    pluginBusy: state.pluginBusy,
    installPluginByName: state.installPluginByName,
    uninstallPluginByName: state.uninstallPluginByName,
    togglePluginByName: state.togglePluginByName,
    addMarketplaceById: state.addMarketplaceById,
    removeMarketplaceById: state.removeMarketplaceById,
    refreshMarketplaces: state.refreshMarketplaces,
    restartProjectRuntime: state.restartProjectRuntime,
  })));
  const activeProjectId = useStore((state) => state.activeProjectId);
  const activeWorkspacePath = useStore((state) => state.projectsById[state.activeProjectId]?.workspacePath || '');
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
  const [actionDialog, setActionDialog] = React.useState(null);
  const [actionDialogError, setActionDialogError] = React.useState('');
  const [maintenanceScope, setMaintenanceScope] = React.useState('user');
  const [maintenanceBusy, setMaintenanceBusy] = React.useState('');
  const [maintenanceNotice, setMaintenanceNotice] = React.useState(null);
  const [maintenanceOutput, setMaintenanceOutput] = React.useState(null);
  const [restartNeeded, setRestartNeeded] = React.useState(false);
  // 市场增删表单态
  const [newMktId, setNewMktId] = React.useState('');
  const [newMktUrl, setNewMktUrl] = React.useState('');
  const [mktBusy, setMktBusy] = React.useState(false);
  const [mktMsg, setMktMsg] = React.useState(null);
  const projectGenerationRef = React.useRef(0);
  const refreshRequestRef = React.useRef(0);
  const refreshInFlightRef = React.useRef(null);
  const pluginActionInFlightRef = React.useRef(null);
  const marketplaceActionInFlightRef = React.useRef(null);

  const handleRefresh = React.useCallback(async () => {
    if (refreshInFlightRef.current) return false;
    const operation = {};
    refreshInFlightRef.current = operation;
    const projectId = activeProjectId;
    const requestId = ++refreshRequestRef.current;
    setRefreshing(true);
    setActionError(null);
    useStore.setState({ pluginError: null, marketplaceError: null });
    try {
      const results = await Promise.all([refreshPlugins(), refreshMarketplaces?.()]);
      if (requestId !== refreshRequestRef.current || useStore.getState().activeProjectId !== projectId) return false;
      if (results.some((ok) => ok === false)) {
        const current = useStore.getState();
        setActionError(current.pluginError || current.marketplaceError || '部分插件数据加载失败');
        return false;
      }
      return true;
    } catch (error) {
      if (requestId !== refreshRequestRef.current || useStore.getState().activeProjectId !== projectId) return false;
      setActionError(error?.message || '插件数据加载失败');
      return false;
    } finally {
      if (refreshInFlightRef.current === operation) {
        refreshInFlightRef.current = null;
        if (requestId === refreshRequestRef.current && useStore.getState().activeProjectId === projectId) {
          setRefreshing(false);
          setLoading(false);
        }
      }
    }
  }, [activeProjectId, refreshMarketplaces, refreshPlugins]);

  React.useEffect(() => {
    projectGenerationRef.current += 1;
    refreshRequestRef.current += 1;
    setLoading(true);
    setRefreshing(false);
    setShowInstallModal(false);
    setInstallId('');
    setInstallMarketplace('');
    setInstalling(false);
    setInstallMsg(null);
    setActionError(null);
    setActionDialog(null);
    setActionDialogError('');
    setMaintenanceScope('user');
    setMaintenanceBusy('');
    setMaintenanceNotice(null);
    setMaintenanceOutput(null);
    setRestartNeeded(false);
    setNewMktId('');
    setNewMktUrl('');
    setMktBusy(false);
    setMktMsg(null);
    refreshInFlightRef.current = null;
    pluginActionInFlightRef.current = null;
    marketplaceActionInFlightRef.current = null;
    handleRefresh();
  }, [activeProjectId, handleRefresh]);

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

  const pluginOperationActive = Boolean(pluginBusy || maintenanceBusy);

  const beginPluginAction = () => {
    if (pluginActionInFlightRef.current || marketplaceActionInFlightRef.current || useStore.getState().pluginBusy) return null;
    const operation = {};
    pluginActionInFlightRef.current = operation;
    return operation;
  };

  const finishPluginAction = (operation) => {
    if (pluginActionInFlightRef.current === operation) pluginActionInFlightRef.current = null;
  };

  const beginMarketplaceAction = () => {
    if (marketplaceActionInFlightRef.current || pluginActionInFlightRef.current || useStore.getState().pluginBusy) return null;
    const operation = {};
    marketplaceActionInFlightRef.current = operation;
    return operation;
  };

  const finishMarketplaceAction = (operation) => {
    if (marketplaceActionInFlightRef.current === operation) marketplaceActionInFlightRef.current = null;
  };

  const openActionDialog = (action) => {
    if (pluginActionInFlightRef.current || marketplaceActionInFlightRef.current || useStore.getState().pluginBusy || mktBusy) return;
    setActionDialog(action);
    setActionDialogError('');
  };

  const closeActionDialog = () => {
    if (pluginActionInFlightRef.current || useStore.getState().pluginBusy) return;
    setActionDialog(null);
    setActionDialogError('');
  };

  const confirmActionDialog = async () => {
    if (!actionDialog || marketplaceActionInFlightRef.current) return;
    const operation = beginPluginAction();
    if (!operation) return;
    const projectId = activeProjectId;
    const generation = projectGenerationRef.current;
    const action = actionDialog;
    setActionDialogError('');
    setActionError(null);
    setMktMsg(null);
    try {
      let ok = true;
      if (action.type === 'uninstall') {
        ok = await uninstallPluginByName(action.id, action.marketplace);
      } else if (action.type === 'remove-marketplace') {
        ok = await removeMarketplaceById(action.id);
      } else if (action.type === 'update') {
        setMaintenanceBusy(`update:${action.id}`);
        const result = await updateInstalledPlugin({
          plugin: action.id,
          scope: action.scope,
          cwd: activeWorkspacePath,
        });
        if (projectId !== useStore.getState().activeProjectId || generation !== projectGenerationRef.current) return;
        setMaintenanceOutput({ title: `更新输出 · ${action.label}`, content: result.output, truncated: result.truncated });
        setMaintenanceNotice({ type: 'success', message: `${action.label} 更新命令已完成。重启当前项目运行时后生效。` });
        setRestartNeeded(true);
      } else if (action.type === 'prune') {
        setMaintenanceBusy('prune');
        const result = await prunePluginDependencies({ scope: action.scope, cwd: activeWorkspacePath });
        if (projectId !== useStore.getState().activeProjectId || generation !== projectGenerationRef.current) return;
        setMaintenanceOutput({ title: `依赖清理输出 · ${PLUGIN_SCOPE_LABELS[action.scope]}`, content: result.output, truncated: result.truncated });
        setMaintenanceNotice({ type: 'success', message: `${PLUGIN_SCOPE_LABELS[action.scope]}的失效插件依赖已清理。重启当前项目运行时后完全生效。` });
        setRestartNeeded(true);
      }
      if (projectId !== useStore.getState().activeProjectId || generation !== projectGenerationRef.current) return;
      if (!ok) {
        const current = useStore.getState();
        const message = (action.type === 'uninstall' ? current.pluginError : current.marketplaceError)
          || (action.type === 'uninstall' ? '卸载插件失败' : '删除市场失败');
        setActionDialogError(message);
        return;
      }
      setActionDialog(null);
    } catch (error) {
      if (projectId === useStore.getState().activeProjectId && generation === projectGenerationRef.current) {
        setActionDialogError(error?.message || '插件维护操作失败');
      }
    } finally {
      if (projectId === useStore.getState().activeProjectId && generation === projectGenerationRef.current) setMaintenanceBusy('');
      finishPluginAction(operation);
    }
  };

  const previewDependencyPrune = async () => {
    const operation = beginPluginAction();
    if (!operation) return;
    const projectId = activeProjectId;
    const generation = projectGenerationRef.current;
    setMaintenanceBusy('preview-prune');
    setMaintenanceNotice({ type: 'busy', message: `正在检查${PLUGIN_SCOPE_LABELS[maintenanceScope]}的失效插件依赖...` });
    setMaintenanceOutput(null);
    setActionError(null);
    try {
      const result = await previewPluginDependencyPrune({ scope: maintenanceScope, cwd: activeWorkspacePath });
      if (projectId !== useStore.getState().activeProjectId || generation !== projectGenerationRef.current) return;
      setMaintenanceOutput({ title: `依赖检查输出 · ${PLUGIN_SCOPE_LABELS[maintenanceScope]}`, content: result.output, truncated: result.truncated });
      if (!result.hasChanges) {
        setMaintenanceNotice({ type: 'success', message: `${PLUGIN_SCOPE_LABELS[maintenanceScope]}没有可清理的失效插件依赖。` });
        return;
      }
      setMaintenanceNotice({ type: 'busy', message: `发现 ${result.items.length} 个可清理项，请确认后继续。` });
      setActionDialog({
        type: 'prune',
        id: maintenanceScope,
        scope: maintenanceScope,
        label: `${PLUGIN_SCOPE_LABELS[maintenanceScope]} · ${result.items.length} 个依赖`,
        detail: result.items.map((item) => typeof item === 'string' ? item : (item.id || item.name || JSON.stringify(item))).join('、'),
      });
    } catch (error) {
      if (projectId === useStore.getState().activeProjectId && generation === projectGenerationRef.current) {
        setMaintenanceNotice({ type: 'error', message: error?.message || '检查插件依赖失败' });
      }
    } finally {
      if (projectId === useStore.getState().activeProjectId && generation === projectGenerationRef.current) setMaintenanceBusy('');
      finishPluginAction(operation);
    }
  };

  const restartRuntimeForPluginChanges = async () => {
    const operation = beginPluginAction();
    if (!operation) return;
    const projectId = activeProjectId;
    const generation = projectGenerationRef.current;
    setMaintenanceBusy('restart');
    setMaintenanceNotice({ type: 'busy', message: '正在重启当前项目运行时...' });
    try {
      const restarted = await restartProjectRuntime(projectId);
      if (projectId !== useStore.getState().activeProjectId || generation !== projectGenerationRef.current) return;
      if (!restarted) throw new Error(useStore.getState().error || '当前项目运行时重启失败');
      await Promise.allSettled([refreshPlugins(), refreshMarketplaces?.()]);
      if (projectId !== useStore.getState().activeProjectId || generation !== projectGenerationRef.current) return;
      setRestartNeeded(false);
      setMaintenanceNotice({ type: 'success', message: '当前项目运行时已重启，插件状态已重新加载。' });
    } catch (error) {
      if (projectId === useStore.getState().activeProjectId && generation === projectGenerationRef.current) {
        setMaintenanceNotice({ type: 'error', message: error?.message || '当前项目运行时重启失败' });
      }
    } finally {
      if (projectId === useStore.getState().activeProjectId && generation === projectGenerationRef.current) setMaintenanceBusy('');
      finishPluginAction(operation);
    }
  };

  const copyMaintenanceOutput = async () => {
    if (!maintenanceOutput?.content) return;
    try {
      await copyTextToClipboard(maintenanceOutput.content);
      setMaintenanceNotice({ type: 'success', message: '插件维护输出已复制。' });
    } catch (error) {
      setMaintenanceNotice({ type: 'error', message: error?.message || '复制插件维护输出失败' });
    }
  };

  const actionDialogDestructive = actionDialog?.type === 'uninstall' || actionDialog?.type === 'remove-marketplace';
  const actionDialogTitle = actionDialog?.type === 'uninstall'
    ? '卸载插件？'
    : actionDialog?.type === 'remove-marketplace'
      ? '删除插件市场？'
      : actionDialog?.type === 'update'
        ? '更新插件？'
        : '清理失效插件依赖？';
  const actionDialogConfirmLabel = actionDialog?.type === 'uninstall'
    ? '卸载插件'
    : actionDialog?.type === 'remove-marketplace'
      ? '删除市场'
      : actionDialog?.type === 'update'
        ? '更新插件'
        : '执行清理';

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-[var(--color-bg-primary)]">
      <div className="mx-auto w-full max-w-5xl px-8 py-8">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-lg font-semibold text-[var(--color-text-primary)]">插件</h1>
          <div className="flex items-center gap-2">
            <select
              className="h-8 rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] px-2 text-xs text-[var(--color-text-secondary)] outline-none"
              value={maintenanceScope}
              disabled={pluginOperationActive || mktBusy}
              aria-label="插件维护作用域"
              onChange={(event) => setMaintenanceScope(event.target.value)}
            >
              {Object.entries(PLUGIN_SCOPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <button
              className="btn-ghost text-xs"
              disabled={pluginOperationActive || mktBusy || !activeWorkspacePath}
              onClick={previewDependencyPrune}
            >
              {maintenanceBusy === 'preview-prune' ? '检查中...' : maintenanceBusy === 'prune' ? '清理中...' : '清理依赖'}
            </button>
            <button
              className="btn-primary text-xs"
              disabled={pluginOperationActive || mktBusy}
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
              disabled={refreshing || pluginOperationActive || mktBusy}
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
        {(pluginError || marketplaceError || actionError) && (
          <div className="mb-4 rounded-lg border border-[rgba(248,113,113,0.2)] bg-[rgba(248,113,113,0.1)] px-4 py-2.5 text-sm text-[#f87171]">
            {actionError || pluginError || marketplaceError}
            <button className="ml-3 underline text-xs" onClick={() => { setActionError(null); handleRefresh(); }}>重试</button>
          </div>
        )}

        {maintenanceNotice ? (
          <div className={`mb-4 flex flex-wrap items-center gap-2 rounded-md border px-4 py-3 text-xs ${maintenanceNotice.type === 'error' ? 'border-[rgba(248,113,113,0.25)] bg-[rgba(248,113,113,0.08)] text-[var(--color-accent-red)]' : maintenanceNotice.type === 'success' ? 'border-[rgba(74,222,128,0.25)] bg-[rgba(74,222,128,0.08)] text-[var(--color-accent-green)]' : 'border-[rgba(250,204,21,0.25)] bg-[rgba(250,204,21,0.08)] text-[var(--color-accent-yellow)]'}`}>
            <span className="min-w-0 flex-1">{maintenanceNotice.message}</span>
            {restartNeeded ? (
              <button className="btn-primary shrink-0 px-2 py-1 text-[11px]" disabled={pluginOperationActive} onClick={restartRuntimeForPluginChanges}>
                {maintenanceBusy === 'restart' ? '重启中...' : '重启当前运行时'}
              </button>
            ) : null}
          </div>
        ) : null}

        {maintenanceOutput ? (
          <div className="mb-4 overflow-hidden rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-code)]">
            <div className="flex items-center justify-between border-b border-[var(--color-border-default)] px-3 py-2">
              <span className="text-xs font-medium text-[var(--color-text-primary)]">{maintenanceOutput.title}</span>
              <div className="flex items-center gap-1">
                <button className="btn-ghost px-2 py-1 text-[11px]" onClick={copyMaintenanceOutput}>复制</button>
                <button className="btn-icon" title="关闭输出" aria-label="关闭插件维护输出" onClick={() => setMaintenanceOutput(null)}>×</button>
              </div>
            </div>
            {maintenanceOutput.truncated ? <div className="border-b border-[var(--color-border-default)] px-3 py-2 text-[11px] text-[var(--color-accent-yellow)]">输出过长，仅保留最新内容。</div> : null}
            <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words px-3 py-3 font-mono text-[11px] leading-5 text-[var(--color-text-secondary)]">{maintenanceOutput.content}</pre>
          </div>
        ) : null}

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
              const pluginId = p.id || p.name;
              const pluginScope = normalizedPluginScope(scope);
              const updateAvailable = validMaintenancePluginId(pluginId);
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
                      className={`toggle-switch shrink-0 ${enabled ? 'toggle-switch-on' : 'toggle-switch-off'} ${pluginOperationActive ? 'opacity-50 pointer-events-none' : ''}`}
                      disabled={pluginOperationActive}
                      onClick={async () => {
                        const operation = beginPluginAction();
                        if (!operation) return;
                        const projectId = activeProjectId;
                        const generation = projectGenerationRef.current;
                        setActionError(null);
                        try {
                          const ok = await togglePluginByName(p.name, !enabled, p.marketplace);
                          if (projectId !== useStore.getState().activeProjectId || generation !== projectGenerationRef.current) return;
                          if (!ok) setActionError(useStore.getState().pluginError || '操作失败');
                        } finally {
                          finishPluginAction(operation);
                        }
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

                  {/* Maintenance actions */}
                  <div className="mt-auto flex items-center justify-between gap-2 border-t border-[var(--color-border-muted)] pt-2">
                    <button
                      className={`text-xs text-[var(--color-accent-blue)] hover:underline ${pluginOperationActive ? 'opacity-50 pointer-events-none' : ''}`}
                      disabled={pluginOperationActive || !updateAvailable || !activeWorkspacePath}
                      title={updateAvailable ? '更新到最新版本' : '当前插件未提供可用于 CLI 更新的 ID'}
                      onClick={() => openActionDialog({
                        type: 'update',
                        id: pluginId,
                        scope: pluginScope,
                        label: p.name || pluginId,
                        detail: `${PLUGIN_SCOPE_LABELS[pluginScope]}${p.version ? ` · 当前 v${p.version}` : ''}`,
                      })}
                    >
                      {maintenanceBusy === `update:${pluginId}` ? '更新中...' : '更新'}
                    </button>
                    <button
                      className={`text-xs text-[var(--color-error)] hover:underline ${pluginOperationActive ? 'opacity-50 pointer-events-none' : ''}`}
                      disabled={pluginOperationActive}
                      onClick={() => openActionDialog({
                        type: 'uninstall',
                        id: p.name,
                        marketplace: p.marketplace,
                        label: p.name || '未命名插件',
                        detail: p.description || '',
                      })}
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
          <div className="overlay" onClick={(e) => { if (!installing && e.target === e.currentTarget) setShowInstallModal(false); }}>
            <div className="modal-content w-[420px]">
              <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border-default)]">
                <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">安装插件</h3>
                <button
                  className="btn-icon"
                  onClick={() => setShowInstallModal(false)}
                  disabled={installing}
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
                <button className="btn-ghost text-xs" disabled={installing} onClick={() => setShowInstallModal(false)}>取消</button>
                <button
                  className="btn-primary text-xs"
                  disabled={!installId.trim() || installing || pluginOperationActive}
                  onClick={async () => {
                    const pluginId = installId.trim();
                    if (!pluginId || installing) return;
                    const operation = beginPluginAction();
                    if (!operation) return;
                    const marketplace = installMarketplace;
                    const projectId = activeProjectId;
                    const generation = projectGenerationRef.current;
                    setInstalling(true);
                    setInstallMsg(null);
                    try {
                      const ok = await installPluginByName(pluginId, marketplace);
                      if (projectId !== useStore.getState().activeProjectId || generation !== projectGenerationRef.current) return;
                      if (ok) {
                        setShowInstallModal(false);
                        setInstallId('');
                      } else {
                        setInstallMsg(useStore.getState().pluginError || '安装失败');
                      }
                    } finally {
                      finishPluginAction(operation);
                      if (projectId === useStore.getState().activeProjectId && generation === projectGenerationRef.current) setInstalling(false);
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


        {actionDialog ? (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4"
            role="dialog"
            aria-modal="true"
            aria-label={actionDialogTitle}
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) closeActionDialog();
            }}
          >
            <div className="w-full max-w-sm rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] p-5 shadow-xl">
              <div className="text-sm font-semibold text-[var(--color-text-primary)]">
                {actionDialogTitle}
              </div>
              <div className="mt-3 text-xs leading-5 text-[var(--color-text-secondary)]">
                <div className="font-medium text-[var(--color-text-primary)]">{actionDialog.label}</div>
                {actionDialog.detail ? <div className="mt-1 break-words text-[var(--color-text-muted)]">{actionDialog.detail}</div> : null}
                <p className="mt-2">
                  {actionDialog.type === 'uninstall'
                    ? '插件及其提供的技能将从本机移除，需要时可以重新安装。'
                    : actionDialog.type === 'remove-marketplace'
                      ? '该市场来源将从配置中删除，已安装插件不会在此操作中卸载。'
                      : actionDialog.type === 'update'
                        ? '将调用 CodeBuddy CLI 更新到该来源的最新版本。更新完成后需要重启项目运行时才能应用。'
                        : '将删除 dry-run 已确认的失效自动依赖。主动安装的插件不会被此操作移除。'}
                </p>
              </div>
              {actionDialogError ? <div className="mt-3 text-xs text-[var(--color-accent-red)]">{actionDialogError}</div> : null}
              <div className="mt-5 flex justify-end gap-2">
                <button className="btn-ghost px-3 py-1.5 text-xs" disabled={pluginOperationActive} onClick={closeActionDialog}>取消</button>
                <button
                  className={actionDialogDestructive ? 'rounded-md px-3 py-1.5 text-xs font-medium text-white' : 'btn-primary px-3 py-1.5 text-xs'}
                  style={actionDialogDestructive ? { background: 'var(--color-accent-red)' } : undefined}
                  disabled={pluginOperationActive}
                  onClick={confirmActionDialog}
                >
                  {pluginOperationActive ? '处理中...' : actionDialogConfirmLabel}
                </button>
              </div>
            </div>
          </div>
        ) : null}
        {/* Plugin Marketplaces 增删（对照源 POST/DELETE /api/v1/plugins/marketplaces/{id}）*/}
        <div className="mt-8 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">插件市场</h2>
            <button
              onClick={async () => {
                const operation = beginMarketplaceAction();
                if (!operation) return;
                const projectId = activeProjectId;
                const generation = projectGenerationRef.current;
                setMktBusy(true);
                setMktMsg(null);
                useStore.setState({ marketplaceError: null });
                try {
                  const ok = await refreshMarketplaces?.();
                  if (projectId !== useStore.getState().activeProjectId || generation !== projectGenerationRef.current) return;
                  if (ok === false) setMktMsg(useStore.getState().marketplaceError || '刷新市场失败');
                } catch (error) {
                  if (projectId === useStore.getState().activeProjectId && generation === projectGenerationRef.current) {
                    setMktMsg(error?.message || '刷新市场失败');
                  }
                } finally {
                  finishMarketplaceAction(operation);
                  if (projectId === useStore.getState().activeProjectId && generation === projectGenerationRef.current) setMktBusy(false);
                }
              }}
              disabled={mktBusy || pluginOperationActive}
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
              disabled={mktBusy || pluginOperationActive || !newMktId.trim() || !newMktUrl.trim()}
              onClick={async () => {
                const marketplaceId = newMktId.trim();
                const marketplaceUrl = newMktUrl.trim();
                if (!marketplaceId || !marketplaceUrl) return;
                const operation = beginMarketplaceAction();
                if (!operation) return;
                const projectId = activeProjectId;
                const generation = projectGenerationRef.current;
                setMktBusy(true);
                setMktMsg(null);
                try {
                  const ok = await addMarketplaceById(marketplaceId, { url: marketplaceUrl });
                  if (projectId !== useStore.getState().activeProjectId || generation !== projectGenerationRef.current) return;
                  if (ok) {
                    setNewMktId((current) => current.trim() === marketplaceId ? '' : current);
                    setNewMktUrl((current) => current.trim() === marketplaceUrl ? '' : current);
                  } else {
                    setMktMsg(useStore.getState().marketplaceError || '新增市场失败');
                  }
                } finally {
                  finishMarketplaceAction(operation);
                  if (projectId === useStore.getState().activeProjectId && generation === projectGenerationRef.current) setMktBusy(false);
                }
              }}
            >
              {mktBusy && pluginBusy?.startsWith('addMkt:') ? '添加中...' : '添加市场'}
            </button>
          </div>
          {mktMsg && <div className="mb-3 text-xs text-[var(--color-error)]">{mktMsg}</div>}
          {marketplaceError && pluginBusy?.startsWith('rmMkt:') && <div className="mb-3 text-xs text-[var(--color-error)]">{marketplaceError}</div>}

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
                      disabled={mktBusy || pluginOperationActive}
                      className="btn-ghost shrink-0 text-xs text-[var(--color-error)]"
                      onClick={() => openActionDialog({
                        type: 'remove-marketplace',
                        id,
                        label: mkt.name || id,
                        detail: mkt.source || mkt.url || mkt.description || '',
                      })}
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
