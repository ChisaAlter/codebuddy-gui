import React, { useCallback, useEffect, useState, useRef } from 'react';
import { fetchJson } from '../lib/acp';
import { createWechatChannel, fetchWechatQr, createWecomChannel, channelAction, deleteChannelInstance } from '../lib/ops';
import { useStore } from '../store';

function ChannelCard({ channel, onRefresh }) {
  const type = channel.clientType || 'unknown';
  const displayName = channel.displayName || `${type}:${channel.instanceId || ''}`;
  const status = channel.status || 'unknown';
  const color = status === 'connected' ? '#22c55e' : status === 'connecting' ? '#f59e0b' : '#8e8e93';
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');

  // 按状态选 action 名（对照源真实 UI 由调用方透传 action，非硬集）
  // connected → stop 断开；其他 → start 连接；保留 disconnect/connect 作别名兜底
  const pickToggleAction = (currentStatus) => currentStatus === 'connected' ? 'stop' : 'start';

  const handleToggle = async () => {
    if (!channel.instanceId) return;
    setBusy('toggle');
    setMessage('');
    try {
      const action = pickToggleAction(status);
      const result = await channelAction(type, channel.instanceId, action);
      // 对照源特例：unbind wechat 返回 needsQrScan=true → 触发 rebind 二维码流程
      if (result?.needsQrScan && type === 'wechat') {
        setMessage('需重新扫码，正在拉二维码...');
        // 复用主组件的 wechat 二维码态：通过 onRefresh 回流让主组件轮询
      } else {
        setMessage(action === 'start' ? '已发起连接' : (result?.message || '已断开'));
      }
      await onRefresh();
    } catch (err) {
      setMessage(err.message || '操作失败');
    } finally {
      setBusy('');
    }
  };

  // 通用 action 透传：对照源真实 UI 即此设计（action 由按钮语义决定，非硬集）
  const handleAction = async (actionName, label) => {
    if (!channel.instanceId || !actionName) return;
    setBusy(actionName);
    setMessage('');
    try {
      const result = await channelAction(type, channel.instanceId, actionName);
      setMessage(result?.message || `${label}已发起`);
      await onRefresh();
    } catch (err) {
      setMessage(err.message || `${label}失败`);
    } finally {
      setBusy('');
    }
  };

  const handleDelete = async () => {
    if (!channel.instanceId) return;
    if (!window.confirm(`确定删除渠道“${displayName}”吗？此操作无法撤销。`)) return;
    setBusy('delete');
    setMessage('');
    try {
      await deleteChannelInstance(type, channel.instanceId);
      setMessage('已删除');
      await onRefresh();
    } catch (err) {
      setMessage(err.message || '删除失败');
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-card)] p-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-white">{displayName}</div>
          <div className="mt-1 text-xs text-[var(--color-text-secondary)]">{type}</div>
        </div>
        <span className="rounded px-2 py-1 text-[10px]" style={{ background: `${color}1a`, color }}>
          {status}
        </span>
      </div>
      <div className="space-y-1 text-xs text-[var(--color-text-secondary)]">
        <div>instanceId: {channel.instanceId || '-'}</div>
        <div>hidden: {String(!!channel.hidden)}</div>
      </div>
      <div className="mt-3 flex gap-2 flex-wrap">
        <button className="btn-ghost" disabled={!!busy} onClick={handleToggle}>{busy === 'toggle' ? '处理中...' : (status === 'connected' ? '断开' : '连接')}</button>
        <button
          className="btn-ghost"
          disabled={!!busy}
          onClick={() => handleAction('unbind', '解绑')}
          title="解除绑定关系，wechat 会触发重新扫码"
        >
          {busy === 'unbind' ? '处理中...' : '解绑'}
        </button>
        <button
          className="btn-ghost"
          disabled={!!busy}
          onClick={() => handleAction('rebind', '重绑')}
          title="重新绑定，wechat 会拉新二维码"
        >
          {busy === 'rebind' ? '处理中...' : '重绑'}
        </button>
        <button
          className="btn-ghost"
          disabled={!!busy}
          onClick={() => handleAction('sync', '同步')}
          title="同步 channel 状态与后端"
        >
          {busy === 'sync' ? '处理中...' : '同步'}
        </button>
        <button className="btn-ghost" disabled={!!busy} onClick={handleDelete}>{busy === 'delete' ? '处理中...' : '删除'}</button>
      </div>
      {message ? <div className="mt-2 text-xs text-[var(--color-text-secondary)]">{message}</div> : null}
    </div>
  );
}

export default function ReplicaRemoteControlView() {
  const setRoute = useStore((state) => state.setRoute);
  const activeProjectId = useStore((state) => state.activeProjectId);
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const mountedRef = useRef(true);
  const loadInFlightRef = useRef(null);

  // 微信创建 + 二维码态（对照源 POST /channels/wechat + GET /channels/wechat/{id}/qr）
  const [wechatBusy, setWechatBusy] = useState(false);
  const [wechatQr, setWechatQr] = useState(null); // {qrImage} 或 null
  const [wechatQrLoading, setWechatQrLoading] = useState(false);
  const [wechatQrError, setWechatQrError] = useState(null);
  const qrPollRef = useRef(null);

  // 企微创建表单
  const [wecomBusy, setWecomBusy] = useState(false);
  const [wecomBotId, setWecomBotId] = useState('');
  const [wecomSecret, setWecomSecret] = useState('');
  const [wecomError, setWecomError] = useState(null);

  const load = useCallback(async ({ silent = false } = {}) => {
    const projectId = activeProjectId;
    if (loadInFlightRef.current === projectId) return;
    loadInFlightRef.current = projectId;
    if (!silent) {
      setLoading(true);
      setError('');
    }
    try {
      const payload = await fetchJson('/api/v1/channels');
      const clients = payload?.data?.clients || payload?.clients || payload?.data?.channels || payload?.channels || [];
      if (mountedRef.current && useStore.getState().activeProjectId === projectId) {
        setChannels((Array.isArray(clients) ? clients : []).filter((item) => !item.hidden && !String(item.instanceId || '').startsWith('_pending')));
        setError('');
      }
    } catch (err) {
      if (mountedRef.current && useStore.getState().activeProjectId === projectId) setError(err.message || '加载失败');
    } finally {
      if (loadInFlightRef.current === projectId) loadInFlightRef.current = null;
      if (!silent && mountedRef.current && useStore.getState().activeProjectId === projectId) setLoading(false);
    }
  }, [activeProjectId]);

  useEffect(() => {
    mountedRef.current = true;
    setChannels([]);
    setLoading(true);
    setError('');
    setInfo('');
    setWechatQr(null);
    setWechatQrLoading(false);
    setWechatQrError(null);
    setWecomError(null);
    load();
    const refreshTimer = setInterval(() => load({ silent: true }), 5000);
    return () => {
      mountedRef.current = false;
      clearInterval(refreshTimer);
      if (qrPollRef.current) clearTimeout(qrPollRef.current);
    };
  }, [load]);

  // 微信：创建实例后轮询二维码（对照源 bundle 每 1s 拉，最长 180s）
  const stopQrPoll = () => {
    if (qrPollRef.current) { clearTimeout(qrPollRef.current); qrPollRef.current = null; }
  };
  const pollQr = (instanceId) => {
    const startedAt = Date.now();
    stopQrPoll();
    const poll = async () => {
      if (!mountedRef.current) return;
      if (Date.now() - startedAt > 180000) {
        stopQrPoll();
        setWechatQrError('二维码超时，请重新创建');
        setWechatQrLoading(false);
        return;
      }
      try {
        const r = await fetchWechatQr(instanceId);
        if (!mountedRef.current) return;
        if (r.ok && r.qrImage) {
          setWechatQr({ qrImage: r.qrImage });
          setWechatQrLoading(false);
          setWechatQrError(null);
          stopQrPoll();
          return;
        }
      } catch (_) { /* 忽略瞬时网络错，继续轮询 */ }
      if (mountedRef.current) qrPollRef.current = setTimeout(poll, 1000);
    };
    qrPollRef.current = setTimeout(poll, 1000);
  };

  const handleCreateWechat = async () => {
    setWechatBusy(true);
    setWechatQr(null);
    setWechatQrError(null);
    setWechatQrLoading(true);
    stopQrPoll();
    try {
      const result = await createWechatChannel();
      const instanceId = result?.instanceId || result?.id;
      if (!instanceId) throw new Error('后端未返回 instanceId');
      setInfo(`微信实例已创建：${instanceId}`);
      pollQr(instanceId);
      await load();
    } catch (err) {
      setWechatQrError(err.message || '创建微信实例失败');
      setWechatQrLoading(false);
    } finally {
      setWechatBusy(false);
    }
  };

  const handleCreateWecom = async () => {
    setWecomError(null);
    if (!wecomBotId.trim() || !wecomSecret.trim()) { setWecomError('botId 与 secret 均不可为空'); return; }
    setWecomBusy(true);
    try {
      await createWecomChannel({ botId: wecomBotId, secret: wecomSecret });
      setWecomBotId('');
      setWecomSecret('');
      setInfo('企微实例已创建');
      await load();
    } catch (err) {
      setWecomError(err.message || '创建企微实例失败');
    } finally {
      setWecomBusy(false);
    }
  };

  const wechat = channels.filter((item) => item.clientType === 'wechat');
  const wecom = channels.filter((item) => item.clientType === 'wecom');
  const others = channels.filter((item) => item.clientType !== 'wechat' && item.clientType !== 'wecom');

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[var(--color-bg-primary)]">
      <div className="flex h-12 items-center border-b border-[var(--color-border-default)] px-6">
        <h2 className="text-base font-semibold text-[var(--color-text-primary)]">远程控制</h2>
      </div>
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <div>
          <div className="text-lg font-semibold text-white">远程控制</div>
          <div className="mt-1 text-sm text-[var(--color-text-secondary)]">管理渠道连接</div>
        </div>

        {/* 微信创建 + 二维码展示 */}
        <div className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-card)] p-4">
          <div className="text-sm font-medium text-white">添加微信机器人</div>
          <div className="mt-1 text-xs text-[var(--color-text-muted)]">创建实例后用微信扫码登录</div>
          <div className="mt-3 flex items-center gap-3">
            <button className="btn-primary" disabled={wechatBusy || wechatQrLoading} onClick={handleCreateWechat}>
              {wechatBusy ? '创建中...' : '创建并显示二维码'}
            </button>
            {wechatQrLoading && <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]"><div className="h-3 w-3 animate-spin rounded-full border-2 border-[var(--color-border-muted)] border-t-[var(--color-accent-brand)]" />等待二维码就绪...</div>}
          </div>
          {wechatQrError && <div className="mt-2 text-xs text-[var(--color-accent-red)]">{wechatQrError}</div>}
          {wechatQr?.qrImage && (
            <div className="mt-3 flex flex-col items-center gap-2 rounded-lg border border-[var(--color-border-muted)] bg-white p-3" style={{ width: 'fit-content' }}>
              <img src={wechatQr.qrImage} alt="微信登录二维码" className="h-44 w-44" style={{ imageRendering: 'pixelated' }} />
              <div className="text-xs text-[var(--color-text-muted)]">用微信扫码登录</div>
            </div>
          )}
        </div>

        {/* 企微创建表单 */}
        <div className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-card)] p-4">
          <div className="text-sm font-medium text-white">添加企业微信机器人</div>
          <div className="mt-1 text-xs text-[var(--color-text-muted)]">填写 botId 与 secret 后创建实例</div>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <input
              value={wecomBotId}
              onChange={(e) => setWecomBotId(e.target.value)}
              placeholder="botId"
              className="rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-tertiary)] px-3 py-1.5 text-xs text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent-brand)]"
              aria-label="企微 botId"
            />
            <input
              type="password"
              value={wecomSecret}
              onChange={(e) => setWecomSecret(e.target.value)}
              placeholder="secret"
              className="rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-tertiary)] px-3 py-1.5 text-xs text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent-brand)]"
              aria-label="企微 secret"
            />
          </div>
          {wecomError && <div className="mt-2 text-xs text-[var(--color-accent-red)]">{wecomError}</div>}
          <button className="btn-primary mt-2" disabled={wecomBusy || !wecomBotId.trim() || !wecomSecret.trim()} onClick={handleCreateWecom}>
            {wecomBusy ? '创建中...' : '创建企微机器人'}
          </button>
        </div>

        <div className="flex gap-3">
          <button className="btn-ghost" onClick={() => load()} disabled={loading}>{loading ? '刷新中...' : '刷新'}</button>
        </div>

        {loading ? <div className="text-sm text-[var(--color-text-muted)]">加载中...</div> : null}
        {info ? <div className="rounded-lg border border-[rgba(34,197,94,0.25)] bg-[rgba(34,197,94,0.08)] px-4 py-3 text-sm text-green-300 flex items-center justify-between gap-3"><span>{info}</span><button className="btn-ghost text-xs" onClick={() => setInfo('')}>关闭</button></div> : null}
        {error ? <div className="rounded-lg border border-[rgba(239,68,68,0.35)] bg-[rgba(239,68,68,0.08)] px-4 py-3 text-sm text-red-300 flex items-center gap-2"><span>{error}</span><button className="btn-ghost text-sm underline" onClick={load}>重试</button></div> : null}

        <section className="space-y-3">
          <div className="text-sm font-medium text-[var(--color-text-secondary)]">微信机器人</div>
          {wechat.length ? wechat.map((item) => <ChannelCard key={`${item.clientType}-${item.instanceId}`} channel={item} onRefresh={load} />) : <div className="text-sm text-[var(--color-text-muted)]">暂无已连接渠道</div>}
        </section>

        <section className="space-y-3">
          <div className="text-sm font-medium text-[var(--color-text-secondary)]">企业微信机器人</div>
          {wecom.length ? wecom.map((item) => <ChannelCard key={`${item.clientType}-${item.instanceId}`} channel={item} onRefresh={load} />) : <div className="text-sm text-[var(--color-text-muted)]">暂无已连接渠道</div>}
        </section>

        {others.length ? (
          <section className="space-y-3">
            <div className="text-sm font-medium text-[var(--color-text-secondary)]">更多渠道</div>
            {others.map((item) => <ChannelCard key={`${item.clientType}-${item.instanceId}`} channel={item} onRefresh={load} />)}
          </section>
        ) : null}

        <div className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-card)] p-4">
          <div className="text-sm font-medium text-white">安装更多渠道</div>
          <div className="mt-2 text-sm text-[var(--color-text-secondary)]">浏览插件市场，安装第三方渠道插件</div>
          <button className="btn-ghost mt-3 text-xs" onClick={() => setRoute('plugins')}>打开插件</button>
        </div>
      </div>
    </div>
  );
}
