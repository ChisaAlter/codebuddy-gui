import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { useStore } from '../store';
import { PtySocket } from '../lib/pty';

function TerminalPane({ pane, active, onFocus, onSplitRight, onSplitDown, onClose, onReconnect }) {
  const containerRef = useRef(null);
  const terminalRef = useRef(null);
  const fitRef = useRef(null);
  const socketRef = useRef(null);
  const createPty = useStore((s) => s.createPty);
  const bindPtyToPane = useStore((s) => s.bindPtyToPane);
  const setPaneStatus = useStore((s) => s.setPaneStatus);
  const appendPaneOutput = useStore((s) => s.appendPaneOutput);
  const setPaneSession = useStore((s) => s.setPaneSession);
  const currentSessionIdRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current || terminalRef.current) return;

    const term = new Terminal({
      fontFamily: "Menlo, Monaco, Consolas, 'Courier New', monospace",
      fontSize: 13,
      cursorBlink: true,
      theme: {
        background: '#000000',
        foreground: '#ffffff',
      },
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerRef.current);
    fitAddon.fit();
    terminalRef.current = term;
    fitRef.current = fitAddon;

    term.onData((data) => {
      socketRef.current?.sendInput(data);
    });

    const resizeObserver = new ResizeObserver(() => {
      try {
        fitAddon.fit();
        socketRef.current?.resize(term.cols, term.rows);
      } catch (_) {}
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      socketRef.current?.close();
      term.dispose();
      terminalRef.current = null;
      fitRef.current = null;
    };
  }, []);

  useEffect(() => {
    async function ensureSession() {
      if (pane.sessionId) return;
      setPaneStatus(pane.id, 'connecting');
      const created = await createPty(120, 32);
      bindPtyToPane(pane.id, created.sessionId);
    }
    ensureSession().catch(() => setPaneStatus(pane.id, 'error'));
  }, [pane.id, pane.sessionId, createPty, bindPtyToPane, setPaneStatus]);

  useEffect(() => {
    if (!pane.sessionId || !terminalRef.current) return;
    if (socketRef.current?.sessionId === pane.sessionId) return;

    socketRef.current?.close();
    socketRef.current = null;
    currentSessionIdRef.current = pane.sessionId;
    const socket = new PtySocket(pane.sessionId);
    socketRef.current = socket;
    setPaneSession(pane.id, pane.sessionId);

    socket.on('open', () => {
      if (currentSessionIdRef.current !== pane.sessionId) return;
      setPaneStatus(pane.id, 'connected');
      try {
        fitRef.current?.fit();
        socket.resize(terminalRef.current.cols, terminalRef.current.rows);
      } catch (_) {}
    });

    socket.on('message', (payload) => {
      if (currentSessionIdRef.current !== pane.sessionId) return;
      if (typeof payload === 'string') {
        terminalRef.current.write(payload);
        appendPaneOutput(pane.id, payload);
        return;
      }
      if (payload?.type === 'output' && payload?.data) {
        terminalRef.current.write(payload.data);
        appendPaneOutput(pane.id, payload.data);
      }
      if (payload?.type === 'exit') {
        setPaneStatus(pane.id, 'disconnected');
      }
    });

    socket.on('close', () => {
      if (currentSessionIdRef.current === pane.sessionId) setPaneStatus(pane.id, 'disconnected');
    });
    socket.on('error', () => {
      if (currentSessionIdRef.current === pane.sessionId) setPaneStatus(pane.id, 'error');
    });
    socket.connect();

    return () => {
      if (socketRef.current === socket) socketRef.current = null;
      socket.close();
    };
  }, [pane.id, pane.sessionId, appendPaneOutput, setPaneSession, setPaneStatus]);

  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border"
      style={{
        borderColor: active ? '#0078d4' : '#2a2a2a',
        background: '#000000',
      }}
      onClick={onFocus}
    >
      <div className="flex h-9 items-center justify-between border-b px-3 text-xs"
        style={{ borderColor: '#2a2a2a', background: '#111111', color: '#b0b0b5' }}>
        <div className="flex items-center gap-2">
          <span>{pane.title}</span>
          {['error', 'disconnected'].includes(pane.status) ? (
            <span className="flex items-center gap-1.5 text-[10px]">
              <span className="text-[#f87171]">{pane.status === 'error' ? '连接失败' : '已断开'}</span>
              <button
                onClick={(e) => { e.stopPropagation(); onReconnect(pane.id); }}
                className="rounded px-1.5 py-0.5 text-[10px] border border-[var(--color-border-default)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)] transition-colors"
              >重连</button>
            </span>
          ) : (
            <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${
              pane.status === 'connected' ? 'bg-[rgba(74,222,128,0.12)] text-[#4ade80]' :
              pane.status === 'connecting' ? 'bg-[rgba(251,191,36,0.12)] text-[#fbbf24] animate-pulse' :
              'bg-[rgba(113,113,122,0.12)] text-[var(--color-text-muted)]'
            }`}>{pane.status || 'idle'}</span>
          )}
          {pane.sessionId ? <span className="text-[10px] opacity-70">{pane.sessionId.slice(0, 8)}</span> : null}
        </div>
        <div className="flex items-center gap-1">
          <button className="btn-ghost" onClick={(e) => { e.stopPropagation(); onSplitRight(); }}>右分</button>
          <button className="btn-ghost" onClick={(e) => { e.stopPropagation(); onSplitDown(); }}>下分</button>
          <div className="relative group">
            <button className="flex h-5 w-5 items-center justify-center rounded text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M6.5 7.5h3V7h-3v.5zM5 9l.5 1h5l.5-1H5zM8 1a7 7 0 100 14A7 7 0 008 1zm0 12.5A5.5 5.5 0 1113.5 8 5.5 5.5 0 018 13.5z"/></svg>
            </button>
            <div className="absolute right-0 top-7 z-50 hidden group-hover:block w-48 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] shadow-xl p-2 text-[10px] text-[var(--color-text-secondary)] space-y-1">
              <div className="font-medium text-[var(--color-text-primary)] mb-1">终端快捷键</div>
              <div>Ctrl+Shift+N 新建终端</div>
              <div>Ctrl+Shift+W 关闭终端</div>
              <div>Ctrl+Shift+→ 右分屏</div>
              <div>Ctrl+Shift+↓ 下分屏</div>
              <div>Alt+1/2/3 切换终端</div>
            </div>
          </div>
          <button className="btn-ghost" onClick={(e) => { e.stopPropagation(); onClose(); }}>关闭</button>
        </div>
      </div>
      <div ref={containerRef} className="min-h-0 flex-1 overflow-hidden" />
    </div>
  );
}

export default function ReplicaTerminalView() {
  const panes = useStore((s) => s.terminalPanes);
  const activePaneId = useStore((s) => s.activePaneId);
  const splitPane = useStore((s) => s.splitPane);
  const closePane = useStore((s) => s.closePane);
  const setActivePane = useStore((s) => s.setActivePane);
  const createPty = useStore((s) => s.createPty);
  const releasePty = useStore((s) => s.releasePty);
  const setPaneStatus = useStore((s) => s.setPaneStatus);
  const bindPtyToPane = useStore((s) => s.bindPtyToPane);
  const initializeTerminal = useStore((s) => s.initializeTerminal);

  useEffect(() => {
    initializeTerminal();
  }, [initializeTerminal]);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'N') {
        e.preventDefault();
        splitPane(activePaneId, 'right');
      }
      if (e.ctrlKey && e.shiftKey && e.key === 'W') {
        e.preventDefault();
        const active = panes.find(p => p.id === activePaneId);
        if (active) closePane(active.id);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [panes, activePaneId, splitPane, closePane]);

  const reconnectPane = async (paneId) => {
    const pane = panes.find(p => p.id === paneId);
    if (!pane) return;
    setPaneStatus(paneId, 'connecting');
    const previousSessionId = pane.sessionId;
    if (previousSessionId) {
      bindPtyToPane(paneId, null);
      await releasePty(previousSessionId);
    }
    try {
      const created = await createPty(120, 32);
      if (created && created.sessionId) {
        bindPtyToPane(paneId, created.sessionId);
        setPaneStatus(paneId, 'connected');
      } else {
        setPaneStatus(paneId, 'error');
      }
    } catch (err) {
      setPaneStatus(paneId, 'error');
    }
  };

  const gridClass = useMemo(() => panes.length > 1 ? 'grid-cols-2' : 'grid-cols-1', [panes.length]);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-black text-white">
      <div className="flex h-12 items-center justify-between border-b border-[#2a2a2a] px-4">
        <div className="text-sm">Terminal</div>
        <div className="text-xs text-[#9ca3af]">真实 PTY / WebSocket 内核接入中</div>
      </div>
      {panes.length === 0 ? (
        <div className="flex-1 flex items-center justify-center bg-[var(--color-bg-primary)]">
          <div className="text-center">
            <div className="mb-2 text-4xl opacity-20">⌨</div>
            <p className="text-sm text-[var(--color-text-muted)]">终端就绪中...</p>
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">正在建立 PTY 连接</p>
          </div>
        </div>
      ) : (
        <div className={`grid min-h-0 flex-1 gap-2 p-2 ${gridClass}`}>
          {panes.map((pane) => (
            <TerminalPane
              key={pane.id}
              pane={pane}
              active={pane.id === activePaneId}
              onFocus={() => setActivePane(pane.id)}
              onSplitRight={() => splitPane(pane.id, 'right')}
              onSplitDown={() => splitPane(pane.id, 'down')}
              onClose={() => closePane(pane.id)}
              onReconnect={() => reconnectPane(pane.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
