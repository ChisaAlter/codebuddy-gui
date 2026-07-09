import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { useStore } from '../store';
import { PtySocket } from '../lib/pty';

function makePane(index) {
  return {
    id: `canvas-pane-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    title: `终端 ${index}`,
    sessionId: null,
    status: 'idle',
    windowState: 'normal',
  };
}

function CanvasTerminalPane({ pane, scale, onClose, onDuplicate, onToggleMinimize, onToggleMaximize }) {
  const containerRef = useRef(null);
  const terminalRef = useRef(null);
  const fitRef = useRef(null);
  const socketRef = useRef(null);
  const createPty = useStore((s) => s.createPty);
  const [status, setStatus] = useState(pane.status || 'idle');
  const [sessionId, setSessionId] = useState(pane.sessionId || null);

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
        if (socketRef.current && terminalRef.current) {
          socketRef.current.resize(terminalRef.current.cols, terminalRef.current.rows);
        }
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
      if (sessionId) return;
      setStatus('connecting');
      const created = await createPty(120, 32);
      setSessionId(created.sessionId);
    }
    ensureSession().catch(() => setStatus('error'));
  }, [createPty, sessionId]);

  useEffect(() => {
    if (!sessionId || !terminalRef.current) return;
    if (socketRef.current?.sessionId === sessionId) return;

    socketRef.current?.close();
    const socket = new PtySocket(sessionId);
    socketRef.current = socket;

    socket.on('open', () => {
      setStatus('connected');
      try {
        fitRef.current?.fit();
        socket.resize(terminalRef.current.cols, terminalRef.current.rows);
      } catch (_) {}
    });

    socket.on('message', (payload) => {
      if (!terminalRef.current) return; // 卸载竞态：socket.close() 异步，dispose 后仍可能触发
      if (typeof payload === 'string') {
        terminalRef.current.write(payload);
        return;
      }
      if (payload?.type === 'output' && payload?.data) {
        terminalRef.current.write(payload.data);
      }
      if (payload?.type === 'exit') {
        setStatus('disconnected');
      }
    });

    socket.on('close', () => setStatus('disconnected'));
    socket.on('error', () => setStatus('error'));
    socket.connect();

    return () => socket.close();
  }, [sessionId]);

  useEffect(() => {
    if (!fitRef.current) return;
    try {
      fitRef.current.fit();
    } catch (_) {}
  }, [scale]);

  const isMinimized = pane.windowState === 'minimized';
  const isMaximized = pane.windowState === 'maximized';

  return (
    <div className="relative overflow-hidden rounded-lg border border-[var(--color-border-default)] bg-black shadow-lg" style={isMaximized ? { gridColumn: '1 / -1' } : undefined}>
      <div className="flex h-8 items-center justify-between border-b border-[#2a2a2a] bg-[#1a1a1a] px-3 text-xs text-[#b0b0b5]">
        <div className="flex items-center gap-2">
          <span>{pane.title}</span>
          <span className="rounded bg-[#111] px-2 py-0.5">{status}</span>
          {sessionId ? <span className="opacity-70">{sessionId.slice(0, 8)}</span> : null}
        </div>
        <div className="flex items-center gap-1">
          <button className="btn-ghost" onClick={onDuplicate}>复刻终端</button>
          <button className="btn-ghost" onClick={onToggleMinimize}>{isMinimized ? '还原' : '最小化'}</button>
          <button className="btn-ghost" onClick={onToggleMaximize}>{isMaximized ? '还原' : '最大化'}</button>
          <button className="btn-ghost" onClick={onClose}>关闭</button>
        </div>
      </div>
      {!isMinimized ? (
        <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left', width: `${100 / scale}%`, height: 'calc(100% - 32px)' }}>
          <div ref={containerRef} className={`w-full overflow-hidden ${isMaximized ? 'h-[480px]' : 'h-[320px]'}`} />
        </div>
      ) : null}
    </div>
  );
}

export default function ReplicaCanvasView() {
  const [panes, setPanes] = useState([]);
  const [zoom, setZoom] = useState(100);
  const connectionState = useStore((s) => s.connectionState);

  useEffect(() => {
    if (!panes.length) {
      setPanes([makePane(1)]);
    }
  }, [panes.length]);

  const scale = useMemo(() => Math.max(0.5, Math.min(1.5, zoom / 100)), [zoom]);

  const addPane = () => {
    setPanes((prev) => [...prev, makePane(prev.length + 1)]);
  };

  const removePane = (id) => {
    setPanes((prev) => (prev.length === 1 ? prev : prev.filter((pane) => pane.id !== id)));
  };

  const duplicatePane = (id) => {
    setPanes((prev) => {
      const target = prev.find((pane) => pane.id === id);
      if (!target) return prev;
      const next = makePane(prev.length + 1);
      next.title = `${target.title} 副本`;
      return [...prev, next];
    });
  };

  const toggleMinimize = (id) => {
    setPanes((prev) => prev.map((pane) => {
      if (pane.id !== id) return pane;
      return { ...pane, windowState: pane.windowState === 'minimized' ? 'normal' : 'minimized' };
    }));
  };

  const toggleMaximize = (id) => {
    setPanes((prev) => prev.map((pane) => {
      if (pane.id !== id) {
        return pane.windowState === 'maximized' ? { ...pane, windowState: 'normal' } : pane;
      }
      return { ...pane, windowState: pane.windowState === 'maximized' ? 'normal' : 'maximized' };
    }));
  };

  const zoomOut = () => setZoom((z) => Math.max(50, z - 10));
  const zoomIn = () => setZoom((z) => Math.min(150, z + 10));
  const fitView = () => setZoom(100);
  const openStandalone = () => {
    window.open(`${window.location.pathname}#/canvas`, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="relative flex min-h-0 flex-1 flex-col bg-[var(--color-bg-primary)]">
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-4">
        <div className="grid min-h-0 flex-1 gap-3" style={{ gridTemplateColumns: panes.length > 1 ? 'repeat(2, minmax(0, 1fr))' : 'minmax(0, 1fr)' }}>
          {panes.map((pane) => (
            <CanvasTerminalPane
              key={pane.id}
              pane={pane}
              scale={scale}
              onClose={() => removePane(pane.id)}
              onDuplicate={() => duplicatePane(pane.id)}
              onToggleMinimize={() => toggleMinimize(pane.id)}
              onToggleMaximize={() => toggleMaximize(pane.id)}
            />
          ))}
        </div>
      </div>

      <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-card)] px-2 py-1 shadow-lg">
        <button className="btn-ghost" onClick={addPane}>添加终端</button>
        <button className="btn-ghost" onClick={zoomOut}>缩小</button>
        <span className="min-w-[48px] text-center text-xs text-[var(--color-text-secondary)]">{zoom}%</span>
        <button className="btn-ghost" onClick={zoomIn}>放大</button>
        <button className="btn-ghost" onClick={fitView}>适应视图</button>
        <button className="btn-ghost" onClick={openStandalone}>在新窗口打开画布</button>
      </div>

      {(!panes.length || connectionState === 'connecting') ? (
        <div className="absolute inset-0 flex items-center justify-center bg-[var(--color-bg-primary)] z-10">
          <div className="flex flex-col items-center gap-3">
            <div className="animate-spin w-6 h-6 border-2 border-[var(--color-border-default)] border-t-[var(--color-accent-blue)] rounded-full" />
            <span className="text-sm" style={{color:'var(--color-text-tertiary)'}}>正在初始化画布...</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
