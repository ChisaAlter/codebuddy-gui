import React from 'react';
import { useStore } from '../store';
import { NAV_GROUPS } from '../lib/codebuddy-schema';

const ITEM_ICONS = {
  chat: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M8 1C4.13 1 1 3.13 1 6.5c0 1.58.64 3 1.75 4.03L2 14l3.62-1.53c.76.2 1.55.3 2.38.3 3.87 0 7-2.13 7-5.5S11.87 1 8 1z" />
    </svg>
  ),
  instances: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="1" y="1" width="6" height="6" rx="1" /><rect x="9" y="1" width="6" height="6" rx="1" /><rect x="1" y="9" width="6" height="6" rx="1" /><rect x="9" y="9" width="6" height="6" rx="1" />
    </svg>
  ),
  'remote-control': (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="8" cy="8" r="6" /><circle cx="8" cy="8" r="2" /><path d="M8 2v2" />
    </svg>
  ),
  tasks: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M2 4h3M2 8h8M2 12h6M13 5l2 2-3.5 3.5" />
    </svg>
  ),
  terminal: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M2 3l4 3-4 3M8 9h6" />
    </svg>
  ),
  canvas: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="1" y="1" width="14" height="14" rx="2" /><path d="M1 5h14M1 9h14" />
    </svg>
  ),
  editor: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M11 1l4 4-8 8H3v-4l8-8z" />
    </svg>
  ),
  changes: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="8" cy="8" r="2" /><path d="M8 1v2M8 13v2M1 8h2M13 8h2" />
    </svg>
  ),
  plugins: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M8 2l2 4 4 2-4 2-2 4-2-4-4-2 4-2z" />
    </svg>
  ),
  stats: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M2 14V6h3v8H2zm4.5 0V1h3v13h-3zm4.5 0V4h3v10h-3z" />
    </svg>
  ),
  traces: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M1 8h14M8 1v14M3 3l10 10M13 3L3 13" />
    </svg>
  ),
  monitor: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="1" y="2" width="14" height="10" rx="2" /><path d="M5 15h6M8 12v3" />
    </svg>
  ),
  logs: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M3 2h10a1 1 0 011 1v10a1 1 0 01-1 1H3a1 1 0 01-1-1V3a1 1 0 011-1zm0 3h10m-10 3h6" />
    </svg>
  ),
  settings: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="8" cy="8" r="2.5" /><path d="M8 1v2m0 10v2M1 8h2m10 0h2m-3.66-4.66l1.42-1.42m-9.52 9.52l1.42-1.42m9.52 0l1.42 1.42m-9.52-9.52l1.42 1.42" />
    </svg>
  ),
  keybindings: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="1" y="4" width="6" height="6" rx="1" /><path d="M9.5 5h3M9.5 9h3M9.5 7h5" />
    </svg>
  ),
  docs: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M3 1h10l2 2v10a2 2 0 01-2 2H3a2 2 0 01-2-2V3a2 2 0 012-2zm2 3h6M5 8h6M5 11h3" />
    </svg>
  ),
  workers: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="4" cy="4" r="2" /><circle cx="12" cy="4" r="2" /><circle cx="8" cy="11" r="2" /><path d="M2 8v6h4V8m4 0v6h4V8" />
    </svg>
  ),
  metrics: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M1 14V6h3v8H1zm4.5 0V1h3v13h-3zm4.5 0V4h3v10h-3z" />
    </svg>
  ),
};

export default function ReplicaSidebar() {
  const {
    route, setRoute, sidebarCollapsed,
    sessions, info, currentModel, currentMode, models, modes,
    connectionState, changeSession, newSession, setModel, setMode, changesCount,
  } = useStore();

  return (
    <aside
      className="sidebar-nav flex h-full shrink-0 flex-col border-r border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)] transition-all duration-200"
      style={{ width: sidebarCollapsed ? 60 : 252 }}
    >
      {/* Brand */}
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-[var(--color-border-default)] px-3">
        <div className="flex h-7 w-7 items-center justify-center rounded bg-[#0078d4] text-white text-xs font-bold">
          CB
        </div>
        {!sidebarCollapsed && (
          <span className="text-sm font-semibold tracking-tight">CodeBuddy</span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden py-2">
        {!sidebarCollapsed && (
          <div className="px-3 pb-2">
            <button
              className="flex w-full items-center gap-2 rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-tertiary)] px-3 py-1.5 text-sm text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
              onClick={() => { setRoute('chat'); newSession(); }}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 2v12M2 8h12" /></svg>
              新对话
            </button>
          </div>
        )}

        {NAV_GROUPS.map((group) => (
          <div key={group.id} className="mb-1">
            {!sidebarCollapsed && (
              <div className="sidebar-section-title text-[var(--color-text-muted)]">
                {group.title}
              </div>
            )}
            <div className="px-1.5 space-y-0.5">
              {group.items.map((item) => {
                const isActive = route === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setRoute(item.id)}
                    className={`sidebar-nav-link group w-full ${isActive ? 'bg-[rgba(0,120,212,0.12)] text-[var(--color-text-primary)]' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]'}`}
                    title={sidebarCollapsed ? item.label : undefined}
                  >
                    <span className={`flex-shrink-0 w-4 h-4 flex items-center justify-center ${isActive ? 'text-[#0078d4]' : 'text-[var(--color-text-tertiary)] group-hover:text-[var(--color-text-secondary)]'}`}>
                      {ITEM_ICONS[item.id] || (
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="8" r="2" /></svg>
                      )}
                    </span>
                    {!sidebarCollapsed && (
                      <span className="truncate text-left">{item.label}</span>
                    )}
                    {!sidebarCollapsed && item.id === 'changes' && changesCount > 0 && (
                      <span className="ml-auto rounded-full bg-[#60a5fa] px-1.5 py-0 text-[10px] text-white font-medium">{changesCount}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Workspace & Session Info (collapsed only if sidebar expanded) */}
      {!sidebarCollapsed && (
        <div className="shrink-0 border-t border-[var(--color-border-default)] p-3 space-y-2">
          <div className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-card)] p-2.5 text-xs">
            <div className="text-[10px] uppercase tracking-wide text-[var(--color-text-muted)] mb-1">工作区</div>
            <div className="truncate text-[var(--color-text-secondary)]">{info?.cwd || '加载中...'}</div>
            <div className="text-[var(--color-text-muted)] mt-0.5">{info?.os || '-'} | {info?.version || '-'}</div>
          </div>

          {/* Model & Mode selectors */}
          <div className="space-y-1.5">
            <select
              className="w-full rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-tertiary)] px-2 py-1 text-xs text-[var(--color-text-primary)]"
              value={currentModel || ''}
              onChange={(e) => setModel(e.target.value)}
            >
              <option value="">选择模型</option>
              {models.map((m, i) => (
                <option key={m.id || i} value={m.id}>{m.name}</option>
              ))}
            </select>
            <select
              className="w-full rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-tertiary)] px-2 py-1 text-xs text-[var(--color-text-primary)]"
              value={currentMode || ''}
              onChange={(e) => setMode(e.target.value)}
            >
              <option value="">选择模式</option>
              {modes.map((m, i) => (
                <option key={m.id || i} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>

          {/* Session history */}
          <div>
            <div className="text-[10px] uppercase tracking-wide text-[var(--color-text-muted)] mb-1">会话历史</div>
            <div className="max-h-40 overflow-y-auto space-y-0.5">
              {sessions.slice(0, 10).map((session) => {
                const sessionId = session.id || session.sessionId;
                return (
                  <button
                    key={sessionId}
                    className="block w-full rounded-md px-2 py-1 text-left transition-colors hover:bg-[var(--color-bg-hover)]"
                    onClick={() => changeSession(sessionId)}
                  >
                    <div className="truncate text-xs text-[var(--color-text-primary)]">{session.name || sessionId}</div>
                    {session.messageCount != null && (
                      <div className="text-[10px] text-[var(--color-text-muted)]">{session.messageCount} 条消息</div>
                    )}
                  </button>
                );
              })}
              {sessions.length === 0 && (
                <div className="px-2 py-1 text-xs text-[var(--color-text-muted)]">暂无历史会话</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* User section at bottom */}
      <div className="shrink-0 border-t border-[var(--color-border-default)] p-2">
        <div className="sidebar-user-section" style={sidebarCollapsed ? { justifyContent: 'center', padding: '0.5rem' } : {}}>
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#0078d4] text-xs font-bold text-white">
            {(info?.userName || 'U')[0].toUpperCase()}
          </div>
          {!sidebarCollapsed && (
            <>
              <div className="flex-1 min-w-0">
                <div className="truncate text-xs font-medium text-[var(--color-text-primary)]">{info?.userName || '用户'}</div>
                <div className="text-[10px] text-[var(--color-text-muted)]">{info?.version || 'v?'}</div>
              </div>
              {connectionState === 'connected' ? (
                <div className="h-2 w-2 rounded-full bg-[#22c55e]" title="已连接" />
              ) : connectionState === 'error' ? (
                <div className="h-2 w-2 rounded-full bg-[#ef4444]" title="连接错误" />
              ) : (
                <div className="h-2 w-2 rounded-full bg-[#f59e0b]" title="连接中..." />
              )}
            </>
          )}
        </div>
      </div>
    </aside>
  );
}
