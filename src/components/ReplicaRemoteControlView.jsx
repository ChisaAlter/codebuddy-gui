import React, { useEffect, useState } from 'react';
import { fetchJson, getApiBase } from '../lib/acp';

async function postJson(path, method = 'POST') {
  const response = await fetch(`${getApiBase()}${path}`, {
    method,
    headers: {
      'X-CodeBuddy-Request': '1',
      'Content-Type': 'application/json',
    },
  });
  const text = await response.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch (_) {}
  if (!response.ok) {
    throw new Error(payload?.error || payload?.message || `${response.status} ${response.statusText}`);
  }
  return payload;
}

function ChannelCard({ channel, onRefresh }) {
  const type = channel.clientType || 'unknown';
  const displayName = channel.displayName || `${type}:${channel.instanceId || ''}`;
  const status = channel.status || 'unknown';
  const color = status === 'connected' ? '#22c55e' : status === 'connecting' ? '#f59e0b' : '#8e8e93';
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');

  const handleToggle = async () => {
    if (!channel.instanceId) return;
    setBusy('toggle');
    setMessage('');
    try {
      const action = status === 'connected' ? 'stop' : 'start';
      await postJson(`/api/v1/channels/${type}/${channel.instanceId}/${action}`);
      setMessage(action === 'start' ? '已发起连接' : '已断开');
      await onRefresh();
    } catch (err) {
      setMessage(err.message || '操作失败');
    } finally {
      setBusy('');
    }
  };

  const handleDelete = async () => {
    if (!channel.instanceId) return;
    setBusy('delete');
    setMessage('');
    try {
      await postJson(`/api/v1/channels/${type}/${channel.instanceId}`, 'DELETE');
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
      <div className="mt-3 flex gap-2">
        <button className="btn-ghost" disabled={!!busy} onClick={handleToggle}>{busy === 'toggle' ? '处理中...' : (status === 'connected' ? '断开' : '连接')}</button>
        <button className="btn-ghost" disabled={!!busy} onClick={handleDelete}>{busy === 'delete' ? '处理中...' : '删除'}</button>
      </div>
      {message ? <div className="mt-2 text-xs text-[var(--color-text-secondary)]">{message}</div> : null}
    </div>
  );
}

export default function ReplicaRemoteControlView() {
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const payload = await fetchJson('/api/v1/channels');
      const clients = Array.isArray(payload?.clients) ? payload.clients : [];
      setChannels(clients.filter((item) => !item.hidden));
    } catch (err) {
      setError(err.message || '加载失败');
      setChannels([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

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

        <div className="flex gap-3">
          <button className="btn-primary" onClick={() => setInfo('微信机器人功能开发中')}>添加微信机器人</button>
          <button className="btn-ghost" onClick={() => setInfo('企微机器人功能开发中')}>添加企微机器人</button>
          <button className="btn-ghost" onClick={load}>刷新</button>
        </div>

        {loading ? <div className="text-sm text-[var(--color-text-muted)]">加载中...</div> : null}
        {error ? <div className="rounded-lg border border-[rgba(239,68,68,0.35)] bg-[rgba(239,68,68,0.08)] px-4 py-3 text-sm text-red-300">{error}</div> : null}

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
        </div>
      </div>
    </div>
  );
}