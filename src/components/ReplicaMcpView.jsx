import React from 'react';
import ActionConfirmDialog from './ActionConfirmDialog';
import { useStore } from '../store';
import { addMcpServer, fetchMcpStatus, fetchMcpTools, listMcpConfigs, removeMcpServer } from '../lib/mcp';

const SCOPE_LABELS = { local: '当前项目本机', project: '项目共享', user: '用户全局' };
const STATUS_LABELS = {
  connected: '已连接', connecting: '连接中', disconnected: '未连接', unauthorized: '需要认证',
  authorized: '已认证', authorizing: '认证中', pending_approval: '等待批准',
};

function statusClass(status) {
  if (status === 'connected' || status === 'authorized') return 'text-[var(--color-accent-green)]';
  if (status === 'connecting' || status === 'authorizing' || status === 'pending_approval') return 'text-[var(--color-accent-yellow)]';
  return 'text-[var(--color-text-muted)]';
}

function parseStringObject(value, label) {
  const text = String(value || '').trim();
  if (!text) return undefined;
  let parsed;
  try { parsed = JSON.parse(text); } catch (_) { throw new Error(`${label}必须是 JSON 对象`); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(`${label}必须是 JSON 对象`);
  for (const [key, item] of Object.entries(parsed)) {
    if (!key.trim() || typeof item !== 'string') throw new Error(`${label}的键和值都必须是字符串`);
  }
  return parsed;
}

function serverSummary(server) {
  if (server.config.type === 'stdio') return [server.config.command, ...server.config.args].filter(Boolean).join(' ');
  return server.config.url || '未设置 URL';
}

function AddMcpDialog({ open, busy, error, existingServers, onCancel, onSubmit }) {
  const [name, setName] = React.useState('');
  const [scope, setScope] = React.useState('local');
  const [type, setType] = React.useState('stdio');
  const [command, setCommand] = React.useState('');
  const [url, setUrl] = React.useState('');
  const [args, setArgs] = React.useState('');
  const [env, setEnv] = React.useState('');
  const [headers, setHeaders] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [validationError, setValidationError] = React.useState('');

  React.useEffect(() => {
    if (!open) return;
    setName(''); setScope('local'); setType('stdio'); setCommand(''); setUrl('');
    setArgs(''); setEnv(''); setHeaders(''); setDescription(''); setValidationError('');
  }, [open]);

  if (!open) return null;

  const submit = () => {
    try {
      const normalizedName = name.trim();
      if (!/^[a-zA-Z0-9_-]+$/.test(normalizedName)) throw new Error('名称只能包含字母、数字、连字符和下划线');
      if (existingServers.some((server) => server.name === normalizedName && server.scope === scope)) {
        throw new Error(`“${normalizedName}”已存在于${SCOPE_LABELS[scope]}配置`);
      }
      const config = { type };
      if (description.trim()) config.description = description.trim();
      if (type === 'stdio') {
        if (!command.trim()) throw new Error('请输入启动命令');
        config.command = command.trim();
        const parsedArgs = args.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
        if (parsedArgs.length) config.args = parsedArgs;
        const parsedEnv = parseStringObject(env, '环境变量');
        if (parsedEnv) config.env = parsedEnv;
      } else {
        if (!url.trim()) throw new Error('请输入服务器 URL');
        let parsedUrl;
        try { parsedUrl = new URL(url.trim()); } catch (_) { throw new Error('服务器 URL 格式无效'); }
        if (!['http:', 'https:'].includes(parsedUrl.protocol)) throw new Error('服务器 URL 仅支持 HTTP 或 HTTPS');
        config.url = parsedUrl.toString();
        const parsedHeaders = parseStringObject(headers, '请求头');
        if (parsedHeaders) config.headers = parsedHeaders;
      }
      setValidationError('');
      onSubmit({ name: normalizedName, scope, config });
    } catch (submitError) {
      setValidationError(submitError?.message || 'MCP 配置无效');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4" role="dialog" aria-modal="true" aria-label="添加 MCP 服务器" onMouseDown={(event) => { if (!busy && event.target === event.currentTarget) onCancel(); }}>
      <div className="max-h-[88vh] w-full max-w-xl overflow-y-auto rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] p-5 shadow-xl">
        <div className="text-sm font-semibold text-[var(--color-text-primary)]">添加 MCP 服务器</div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <label className="col-span-2 text-xs text-[var(--color-text-secondary)]">名称
            <input className="input-field mt-1 w-full" value={name} disabled={busy} onChange={(event) => setName(event.target.value)} placeholder="filesystem" />
          </label>
          <label className="text-xs text-[var(--color-text-secondary)]">作用域
            <select className="input-field mt-1 w-full" value={scope} disabled={busy} onChange={(event) => setScope(event.target.value)}>
              <option value="local">当前项目本机</option><option value="project">项目共享</option><option value="user">用户全局</option>
            </select>
          </label>
          <label className="text-xs text-[var(--color-text-secondary)]">传输方式
            <select className="input-field mt-1 w-full" value={type} disabled={busy} onChange={(event) => setType(event.target.value)}>
              <option value="stdio">stdio</option><option value="http">HTTP</option><option value="sse">SSE</option>
            </select>
          </label>
          {type === 'stdio' ? <>
            <label className="col-span-2 text-xs text-[var(--color-text-secondary)]">启动命令
              <input className="input-field mt-1 w-full font-mono" value={command} disabled={busy} onChange={(event) => setCommand(event.target.value)} placeholder="npx" />
            </label>
            <label className="col-span-2 text-xs text-[var(--color-text-secondary)]">参数，每行一项
              <textarea className="input-field mt-1 min-h-20 w-full resize-y font-mono" value={args} disabled={busy} onChange={(event) => setArgs(event.target.value)} placeholder={'-y\n@modelcontextprotocol/server-filesystem\nC:\\Projects'} />
            </label>
            <label className="col-span-2 text-xs text-[var(--color-text-secondary)]">环境变量 JSON
              <textarea className="input-field mt-1 min-h-20 w-full resize-y font-mono" value={env} disabled={busy} onChange={(event) => setEnv(event.target.value)} placeholder={'{"API_KEY":"value"}'} />
            </label>
          </> : <>
            <label className="col-span-2 text-xs text-[var(--color-text-secondary)]">服务器 URL
              <input className="input-field mt-1 w-full font-mono" value={url} disabled={busy} onChange={(event) => setUrl(event.target.value)} placeholder="https://example.com/mcp" />
            </label>
            <label className="col-span-2 text-xs text-[var(--color-text-secondary)]">请求头 JSON
              <textarea className="input-field mt-1 min-h-20 w-full resize-y font-mono" value={headers} disabled={busy} onChange={(event) => setHeaders(event.target.value)} placeholder={'{"Authorization":"Bearer ..."}'} />
            </label>
          </>}
          <label className="col-span-2 text-xs text-[var(--color-text-secondary)]">说明
            <input className="input-field mt-1 w-full" value={description} disabled={busy} onChange={(event) => setDescription(event.target.value)} />
          </label>
        </div>
        {(validationError || error) ? <div className="mt-3 text-xs text-[var(--color-accent-red)]">{validationError || error}</div> : null}
        <div className="mt-5 flex justify-end gap-2">
          <button className="btn-ghost px-3 py-1.5 text-xs" disabled={busy} onClick={onCancel}>取消</button>
          <button className="btn-primary px-3 py-1.5 text-xs" disabled={busy} onClick={submit}>{busy ? '添加中...' : '添加'}</button>
        </div>
      </div>
    </div>
  );
}

function ToolsDialog({ value, onClose }) {
  if (!value) return null;
  const { server, tools, error, loading } = value;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4" role="dialog" aria-modal="true" aria-label={`${server.name} 工具`} onMouseDown={(event) => { if (!loading && event.target === event.currentTarget) onClose(); }}>
      <div className="max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] p-5 shadow-xl">
        <div className="flex items-center justify-between"><div className="text-sm font-semibold text-[var(--color-text-primary)]">{server.name} 工具</div><button className="btn-ghost px-2 py-1 text-xs" disabled={loading} onClick={onClose}>关闭</button></div>
        {loading ? <div className="py-12 text-center text-sm text-[var(--color-text-muted)]">正在读取工具...</div> : error ? <div className="mt-4 text-sm text-[var(--color-accent-red)]">{error}</div> : tools.length ? (
          <div className="mt-4 divide-y divide-[var(--color-border-default)] border-y border-[var(--color-border-default)]">{tools.map((tool, index) => <div key={tool.name || index} className="py-3"><div className="font-mono text-xs font-medium text-[var(--color-text-primary)]">{tool.name || `工具 ${index + 1}`}</div>{tool.description ? <div className="mt-1 whitespace-pre-wrap text-xs leading-5 text-[var(--color-text-secondary)]">{tool.description}</div> : null}</div>)}</div>
        ) : <div className="py-12 text-center text-sm text-[var(--color-text-muted)]">该服务器未返回工具</div>}
      </div>
    </div>
  );
}

export default function ReplicaMcpView() {
  const activeProjectId = useStore((state) => state.activeProjectId);
  const workspacePath = useStore((state) => state.workspacePath);
  const connectionState = useStore((state) => state.connectionState);
  const [servers, setServers] = React.useState([]);
  const [locations, setLocations] = React.useState({});
  const [configErrors, setConfigErrors] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [scopeFilter, setScopeFilter] = React.useState('all');
  const [addOpen, setAddOpen] = React.useState(false);
  const [addBusy, setAddBusy] = React.useState(false);
  const [addError, setAddError] = React.useState('');
  const [pendingDelete, setPendingDelete] = React.useState(null);
  const [deleteBusy, setDeleteBusy] = React.useState(false);
  const [deleteError, setDeleteError] = React.useState('');
  const [toolsDialog, setToolsDialog] = React.useState(null);
  const requestRef = React.useRef(0);
  const generationRef = React.useRef(0);
  const operationRef = React.useRef(null);

  const load = React.useCallback(async () => {
    const requestId = ++requestRef.current;
    const generation = generationRef.current;
    const projectId = activeProjectId;
    const cwd = workspacePath;
    if (!cwd) {
      setServers([]); setLocations({}); setConfigErrors([]); setLoading(false); setRefreshing(false);
      return null;
    }
    setRefreshing(true);
    setError('');
    try {
      const snapshot = await listMcpConfigs(cwd);
      let nextServers = Array.isArray(snapshot?.servers) ? snapshot.servers : [];
      if (connectionState === 'connected' && nextServers.length) {
        const results = await Promise.allSettled(nextServers.map((server) => fetchMcpStatus(server.name, server.scope)));
        nextServers = nextServers.map((server, index) => {
          const result = results[index];
          return result?.status === 'fulfilled'
            ? { ...server, status: result.value?.status || 'disconnected', statusError: result.value?.error || '', needsAuth: !!result.value?.needsAuth }
            : { ...server, status: 'disconnected', statusError: result?.reason?.message || '状态读取失败' };
        });
      }
      if (requestId !== requestRef.current || generation !== generationRef.current || projectId !== useStore.getState().activeProjectId) return null;
      setServers(nextServers);
      setLocations(snapshot?.locations || {});
      setConfigErrors(Array.isArray(snapshot?.errors) ? snapshot.errors : []);
      return { ...snapshot, servers: nextServers };
    } catch (loadError) {
      if (requestId === requestRef.current && generation === generationRef.current && projectId === useStore.getState().activeProjectId) setError(loadError?.message || '加载 MCP 配置失败');
      return null;
    } finally {
      if (requestId === requestRef.current && generation === generationRef.current && projectId === useStore.getState().activeProjectId) {
        setLoading(false); setRefreshing(false);
      }
    }
  }, [activeProjectId, connectionState, workspacePath]);

  React.useEffect(() => {
    generationRef.current += 1;
    requestRef.current += 1;
    operationRef.current = null;
    setLoading(true); setServers([]); setLocations({}); setConfigErrors([]); setError('');
    setSearch(''); setScopeFilter('all'); setAddOpen(false); setPendingDelete(null); setToolsDialog(null);
    load();
  }, [activeProjectId, workspacePath, load]);

  const submitAdd = async (request) => {
    if (operationRef.current || connectionState !== 'connected') return;
    const operation = {};
    operationRef.current = operation;
    const projectId = activeProjectId;
    const generation = generationRef.current;
    setAddBusy(true); setAddError('');
    try {
      await addMcpServer(request);
      const refreshed = await load();
      if (operationRef.current !== operation || generation !== generationRef.current || projectId !== useStore.getState().activeProjectId) return;
      if (!refreshed?.servers?.some((server) => server.name === request.name && server.scope === request.scope)) throw new Error('CodeBuddy 未写入 MCP 配置，请检查运行时日志');
      setAddOpen(false);
    } catch (operationError) {
      if (operationRef.current === operation && generation === generationRef.current && projectId === useStore.getState().activeProjectId) setAddError(operationError?.message || '添加 MCP 服务器失败');
    } finally {
      if (operationRef.current === operation) operationRef.current = null;
      if (generation === generationRef.current && projectId === useStore.getState().activeProjectId) setAddBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete || operationRef.current || connectionState !== 'connected') return;
    const operation = {};
    operationRef.current = operation;
    const target = pendingDelete;
    const projectId = activeProjectId;
    const generation = generationRef.current;
    setDeleteBusy(true); setDeleteError('');
    try {
      await removeMcpServer(target.name, target.scope);
      const refreshed = await load();
      if (operationRef.current !== operation || generation !== generationRef.current || projectId !== useStore.getState().activeProjectId) return;
      if (refreshed?.servers?.some((server) => server.name === target.name && server.scope === target.scope)) throw new Error('CodeBuddy 未删除 MCP 配置，请检查运行时日志');
      setPendingDelete(null);
    } catch (operationError) {
      if (operationRef.current === operation && generation === generationRef.current && projectId === useStore.getState().activeProjectId) setDeleteError(operationError?.message || '删除 MCP 服务器失败');
    } finally {
      if (operationRef.current === operation) operationRef.current = null;
      if (generation === generationRef.current && projectId === useStore.getState().activeProjectId) setDeleteBusy(false);
    }
  };

  const openTools = async (server) => {
    if (connectionState !== 'connected') return;
    const generation = generationRef.current;
    const projectId = activeProjectId;
    setToolsDialog({ server, tools: [], loading: true, error: '' });
    try {
      const tools = await fetchMcpTools(server.name, server.scope);
      if (generation !== generationRef.current || projectId !== useStore.getState().activeProjectId) return;
      setToolsDialog({ server, tools, loading: false, error: '' });
    } catch (toolsError) {
      if (generation === generationRef.current && projectId === useStore.getState().activeProjectId) setToolsDialog({ server, tools: [], loading: false, error: toolsError?.message || '读取 MCP 工具失败' });
    }
  };

  const filtered = servers.filter((server) => {
    if (scopeFilter !== 'all' && server.scope !== scopeFilter) return false;
    if (!search.trim()) return true;
    return [server.name, server.scope, server.config.type, server.config.command, server.config.url, server.config.description].join(' ').toLowerCase().includes(search.trim().toLowerCase());
  });
  const grouped = ['local', 'project', 'user'].map((scope) => ({ scope, servers: filtered.filter((server) => server.scope === scope), location: locations?.[scope] || '' })).filter((group) => group.servers.length || scopeFilter === group.scope);
  const actionBusy = addBusy || deleteBusy;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-[var(--color-bg-primary)]">
      <div className="mx-auto w-full max-w-6xl px-8 py-8">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div><h1 className="text-lg font-semibold text-[var(--color-text-primary)]">MCP</h1><div className="mt-1 text-xs text-[var(--color-text-muted)]">{servers.length} 个已配置服务器</div></div>
          <div className="flex items-center gap-2">
            <button className="btn-primary text-xs" disabled={connectionState !== 'connected' || actionBusy} onClick={() => { setAddError(''); setAddOpen(true); }}>+ 添加服务器</button>
            <button className="btn-ghost text-xs" disabled={refreshing || actionBusy} onClick={load}>{refreshing ? '刷新中...' : '刷新'}</button>
          </div>
        </div>
        {connectionState !== 'connected' ? <div className="mb-4 rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] px-4 py-3 text-sm text-[var(--color-text-secondary)]">当前项目运行时未连接，配置可查看，写操作和工具状态暂不可用。</div> : null}
        {error ? <div className="mb-4 rounded-md border border-[rgba(248,113,113,0.25)] bg-[rgba(248,113,113,0.08)] px-4 py-3 text-sm text-[var(--color-accent-red)]">{error}</div> : null}
        {configErrors.map((item) => <div key={`${item.scope}:${item.filePath}`} className="mb-3 rounded-md border border-[rgba(248,113,113,0.25)] bg-[rgba(248,113,113,0.08)] px-4 py-3 text-xs text-[var(--color-accent-red)]">{SCOPE_LABELS[item.scope] || item.scope}：{item.message}</div>)}
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <input className="input-field w-64" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索名称、类型或地址..." />
          <div className="flex items-center rounded-md border border-[var(--color-border-default)] p-0.5">{[['all', '全部'], ['local', '本机'], ['project', '项目'], ['user', '用户']].map(([value, label]) => <button key={value} className={`rounded px-2.5 py-1 text-xs ${scopeFilter === value ? 'bg-[var(--color-bg-hover)] text-[var(--color-text-primary)]' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'}`} onClick={() => setScopeFilter(value)}>{label}</button>)}</div>
        </div>
        {loading ? <div className="py-20 text-center text-sm text-[var(--color-text-muted)]">正在加载 MCP 配置...</div> : filtered.length ? <div className="space-y-6">{grouped.map((group) => <section key={group.scope}>
          <div className="mb-2 flex min-w-0 items-center justify-between gap-3"><h2 className="text-sm font-medium text-[var(--color-text-primary)]">{SCOPE_LABELS[group.scope]}</h2><span className="min-w-0 truncate font-mono text-[10px] text-[var(--color-text-muted)]" title={group.location}>{group.location}</span></div>
          <div className="overflow-hidden rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)]">{group.servers.map((server, index) => <div key={`${server.scope}:${server.name}`} className={`flex items-start gap-4 px-4 py-3 ${index ? 'border-t border-[var(--color-border-default)]' : ''}`}>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2"><span className="font-mono text-sm font-medium text-[var(--color-text-primary)]">{server.name}</span><span className="rounded border border-[var(--color-border-default)] px-1.5 py-0.5 text-[10px] uppercase text-[var(--color-text-muted)]">{server.config.type}</span>{server.disabled ? <span className="text-[10px] text-[var(--color-accent-yellow)]">已禁用</span> : <span className={`text-[10px] ${statusClass(server.status)}`}>{STATUS_LABELS[server.status] || (connectionState === 'connected' ? '状态未知' : '未读取状态')}</span>}</div>
              <div className="mt-1 truncate font-mono text-xs text-[var(--color-text-secondary)]" title={serverSummary(server)}>{serverSummary(server)}</div>
              {server.config.description ? <div className="mt-1 text-xs text-[var(--color-text-muted)]">{server.config.description}</div> : null}
              <div className="mt-2 flex flex-wrap gap-3 text-[10px] text-[var(--color-text-muted)]">{server.config.envKeys.length ? <span>环境变量：{server.config.envKeys.join('、')}</span> : null}{server.config.headerKeys.length ? <span>请求头：{server.config.headerKeys.join('、')}</span> : null}{server.statusError ? <span className="text-[var(--color-accent-red)]">{server.statusError}</span> : null}</div>
            </div>
            <div className="flex shrink-0 items-center gap-1"><button className="btn-ghost px-2 py-1 text-xs" disabled={connectionState !== 'connected' || server.disabled || actionBusy} onClick={() => openTools(server)}>工具</button><button className="btn-ghost px-2 py-1 text-xs text-[var(--color-accent-red)]" disabled={connectionState !== 'connected' || actionBusy} onClick={() => { setDeleteError(''); setPendingDelete(server); }}>删除</button></div>
          </div>)}</div>
        </section>)}</div> : <div className="py-20 text-center text-sm text-[var(--color-text-muted)]">{servers.length ? '没有匹配的 MCP 服务器' : '当前作用域尚未配置 MCP 服务器'}</div>}
      </div>
      <AddMcpDialog open={addOpen} busy={addBusy} error={addError} existingServers={servers} onCancel={() => { if (!addBusy) setAddOpen(false); }} onSubmit={submitAdd} />
      <ActionConfirmDialog open={!!pendingDelete} title="删除 MCP 服务器？" description={pendingDelete ? <><div className="font-mono font-medium text-[var(--color-text-primary)]">{pendingDelete.name}</div><div className="mt-1">作用域：{SCOPE_LABELS[pendingDelete.scope]}</div><div className="mt-2">删除后，新会话将不再加载此服务器。</div></> : null} confirmLabel="删除服务器" busy={deleteBusy} error={deleteError} onCancel={() => { if (!deleteBusy) { setPendingDelete(null); setDeleteError(''); } }} onConfirm={confirmDelete} />
      <ToolsDialog value={toolsDialog} onClose={() => setToolsDialog(null)} />
    </div>
  );
}