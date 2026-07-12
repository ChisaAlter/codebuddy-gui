import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { useStore } from '../store';

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(typeof ts === 'number' ? ts : Date.now());
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function getDayLabel(ts) {
  const d = new Date(typeof ts === 'number' ? ts : Date.now());
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = (today - target) / 86400000;
  if (diff === 0) return '今天';
  if (diff === 1) return '昨天';
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [text]);

  return (
    <button
      className="ml-2 flex-shrink-0 rounded p-1 opacity-0 hover:opacity-100 group-hover:opacity-100 transition-opacity text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
      onClick={handleCopy}
      title="复制到剪贴板"
    >
      {copied ? (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="var(--color-accent-green)" strokeWidth="1.5"><path d="M3 8l3 3 7-7" /></svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="5" y="5" width="10" height="10" rx="1.5" /><path d="M11 5V3a1 1 0 00-1-1H3a1 1 0 00-1 1v7a1 1 0 001 1h2" /></svg>
      )}
    </button>
  );
}

function ThinkingCard({ item }) {
  const [expanded, setExpanded] = useState(false);

  // Calculate thinking duration from createdAt
  const durationText = useMemo(() => {
    if (!item.createdAt) return '0 秒';
    const now = Date.now();
    const elapsed = Math.floor((now - item.createdAt) / 1000);
    if (elapsed < 60) return `${elapsed} 秒`;
    if (elapsed < 3600) return `${Math.floor(elapsed / 60)} 分 ${elapsed % 60} 秒`;
    return `${Math.floor(elapsed / 3600)} 时 ${Math.floor((elapsed % 3600) / 60)} 分`;
  }, [item.createdAt]);

  return (
    <div className="my-2">
      <button
        className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" className="opacity-60">
          <path d="M8 1a1 1 0 01.993.883L9 2v5h5a1 1 0 01.117 1.993L14 9H9v5a1 1 0 01-1.993.117L7 14V9H2a1 1 0 01-.117-1.993L2 7h5V2a1 1 0 011-1z" />
        </svg>
        <span>已思考（用时 {durationText}）</span>
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"
          className={`transition-transform ${expanded ? 'rotate-90' : ''}`}>
          <path d="M6 3l5 5-5 5" />
        </svg>
      </button>
      {expanded && (
        <div className="mt-2 rounded-lg border border-[var(--color-border-muted)] bg-[var(--color-bg-secondary)] p-3 text-xs text-[var(--color-text-secondary)] leading-relaxed">
          {item.content || '(无内容)'}
        </div>
      )}
    </div>
  );
}

function ToolCallBlock({ item }) {
  const [expanded, setExpanded] = useState(false);
  const isRunning = item.status === 'running' || item.status === 'created' || item.streaming;
  const isCompleted = item.status === 'completed' || item.status === 'done';
  const isFailed = item.status === 'failed' || item.status === 'error';

  return (
    <div className="my-2">
      <button
        className="flex items-center gap-2 w-full rounded-lg border border-[var(--color-border-muted)] px-3 py-1.5 text-xs transition-colors hover:bg-[var(--color-bg-hover)]"
        onClick={() => setExpanded(!expanded)}
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" className="text-[var(--color-text-muted)]">
          <path d="M8 1a1 1 0 01.993.883L9 2v5h5a1 1 0 01.117 1.993L14 9H9v5a1 1 0 01-1.993.117L7 14V9H2a1 1 0 01-.117-1.993L2 7h5V2a1 1 0 011-1z" />
        </svg>
        <span className="text-[var(--color-text-secondary)]">
          {item.title || '工具调用'} — {item.kind || '执行中'}
        </span>
        <span className="ml-auto rounded px-1.5 py-0 text-[10px] font-medium" style={{
          background: isCompleted ? 'var(--color-success-bg)' : isFailed ? 'var(--color-error-bg)' : 'rgba(59,130,246,0.15)',
          color: isCompleted ? 'var(--color-accent-green)' : isFailed ? 'var(--color-accent-red)' : 'var(--color-accent-blue)'
        }}>
          {isCompleted ? 'Completed' : isFailed ? 'Failed' : 'Running'}
        </span>
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"
          className={`text-[var(--color-text-muted)] transition-transform ${expanded ? 'rotate-90' : ''}`}>
          <path d="M6 3l5 5-5 5" />
        </svg>
      </button>
      {expanded && (
        <div className="mt-1.5 rounded-lg border border-[var(--color-border-muted)] bg-[var(--color-bg-secondary)] p-3 space-y-2">
          {item.rawInput ? (
            <div>
              <div className="mb-1 text-[10px] font-medium text-[var(--color-text-muted)] uppercase">输入</div>
              <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded bg-[var(--color-bg-primary)] p-2 text-xs text-[var(--color-text-secondary)]">
                {typeof item.rawInput === 'string' ? item.rawInput : JSON.stringify(item.rawInput, null, 2)}
              </pre>
            </div>
          ) : null}
          {item.rawOutput ? (
            <div>
              <div className="mb-1 text-[10px] font-medium text-[var(--color-text-muted)] uppercase">输出</div>
              <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded bg-[var(--color-bg-primary)] p-2 text-xs text-[var(--color-text-secondary)] max-h-48">
                {typeof item.rawOutput === 'string' ? item.rawOutput : JSON.stringify(item.rawOutput, null, 2)}
              </pre>
            </div>
          ) : null}
          {item.content && !item.rawInput && !item.rawOutput ? (
            <pre className="overflow-x-auto whitespace-pre-wrap break-all text-xs text-[var(--color-text-secondary)]">
              {item.content}
            </pre>
          ) : null}
        </div>
      )}
    </div>
  );
}

function InterruptionCard({ item }) {
  const respondToInterruption = useStore((s) => s.respondToInterruption);
  const interruptionId = item.meta?.interruptionId || item.raw?.interruptionId;

  return (
    <div className="my-2 rounded-xl px-4 py-3" style={{ border: '1px solid var(--color-accent-yellow, rgba(245,158,11,0.35))', background: 'var(--color-warning-bg, rgba(245,158,11,0.08))' }}>
      <div className="mb-2 flex items-center gap-2">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="var(--color-accent-yellow)"><path d="M8 1l7 13H1L8 1zm0 5v3m0 2v1" /></svg>
        <div className="text-sm font-medium text-[var(--color-text-primary)]">权限请求</div>
      </div>
      <pre className="overflow-x-auto whitespace-pre-wrap break-words text-xs text-[var(--color-text-secondary)] mb-3 max-h-24">
        {JSON.stringify(item.meta || item.raw, null, 2)}
      </pre>
      {interruptionId ? (
        <div className="flex gap-2">
          <button className="rounded-md px-3 py-1.5 text-xs font-medium text-white hover:brightness-110" style={{ background: 'var(--color-accent-blue)' }} onClick={() => respondToInterruption(interruptionId, 'allow')}>允许</button>
          <button className="rounded-md bg-[var(--color-bg-secondary)] border border-[var(--color-border-default)] px-3 py-1.5 text-xs font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]" onClick={() => respondToInterruption(interruptionId, 'deny')}>拒绝</button>
        </div>
      ) : null}
    </div>
  );
}

function QuestionCard({ item }) {
  const submitQuestionAnswers = useStore((s) => s.submitQuestionAnswers);
  const toolCallId = item.meta?.toolCallId || item.raw?.toolCallId;
  const questions = item.meta?.questions || [];
  const [answers, setAnswers] = useState({});

  return (
    <div className="my-2 rounded-xl px-4 py-3" style={{ border: '1px solid var(--color-accent-blue, rgba(0,120,212,0.35))', background: 'var(--color-info-bg, rgba(0,120,212,0.08))' }}>
      <div className="mb-2 flex items-center gap-2">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="var(--color-accent-blue)"><path d="M8 1C4.1 1 1 4.1 1 8s3.1 7 7 7 7-3.1 7-7-3.1-7-7-7zm0 2.5c.7 0 1.3.6 1.3 1.3s-.6 1.3-1.3 1.3-1.3-.6-1.3-1.3.6-1.3 1.3-1.3zm1.5 9H6.5v-1h1V8H6.5V7h2.5v4.5H9.5V12z" /></svg>
        <span className="text-sm font-medium text-[var(--color-text-primary)]">问题</span>
      </div>
      <div className="space-y-3">
        {questions.map((q, index) => (
          <div key={q.id || index}>
            <div className="mb-1 text-xs text-[var(--color-text-primary)]">{q.question || `问题 ${index + 1}`}</div>
            <input
              className="w-full rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-primary)] px-3 py-1.5 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent-blue)]"
              value={answers[q.id || index] || ''}
              onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id || index]: e.target.value }))}
              placeholder="输入你的答案..."
            />
          </div>
        ))}
      </div>
      {toolCallId ? (
        <button className="mt-3 rounded-md px-3 py-1.5 text-xs font-medium text-white hover:brightness-110" style={{ background: 'var(--color-accent-blue)' }} onClick={() => submitQuestionAnswers(toolCallId, answers)}>
          提交
        </button>
      ) : null}
    </div>
  );
}

function DateSeparator({ label }) {
  return (
    <div className="flex items-center gap-3 my-5">
      <div className="flex-1 h-px bg-[var(--color-border-muted)]" />
      <span className="text-xs text-[var(--color-text-muted)] flex-shrink-0">{label}</span>
      <div className="flex-1 h-px bg-[var(--color-border-muted)]" />
    </div>
  );
}

function TimelineItem({ item }) {
  if (item.type === 'thinking') {
    return <ThinkingCard item={item} />;
  }

  if (item.type === 'tool_call') {
    return <ToolCallBlock item={item} />;
  }

  if (item.type === 'interruption') {
    return <InterruptionCard item={item} />;
  }

  if (item.type === 'question') {
    return <QuestionCard item={item} />;
  }

  if (item.type === 'config_option_update' || item.type === 'session_info_update' ||
      item.type === 'available_commands_update' || item.type === 'initialized' ||
      item.type === 'status_change' || item.type === 'model_update' ||
      item.type === 'mode_update' || item.type === 'current_mode_update') {
    return (
      <div className="flex items-center gap-3 my-4">
        <div className="flex-1 h-px bg-[var(--color-border-muted)]" />
        <span className="text-xs text-[var(--color-text-muted)] flex-shrink-0">{item.type}</span>
        <div className="flex-1 h-px bg-[var(--color-border-muted)]" />
      </div>
    );
  }

  if (item.role === 'user') {
    return (
      <div className="flex justify-end my-3">
        <div className="max-w-[75%] rounded-2xl rounded-br-md bg-[var(--color-bg-user)] px-4 py-2.5 text-sm leading-relaxed text-white">
          {item.content}
        </div>
      </div>
    );
  }

  if (item.role === 'assistant') {
    return (
      <div className="group my-3">
        <div className="text-sm leading-relaxed text-[var(--color-text-primary)] prose max-w-none">
          {item.content ? (
            <ReactMarkdown>{item.content}</ReactMarkdown>
          ) : (item.streaming ? '...' : '')}
        </div>
        {item.content && <CopyButton text={item.content} />}
      </div>
    );
  }

  return null;
}

export default function ReplicaChatView() {
  const messagesEndRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);

  const timeline = useStore((s) => s.timeline);
  const connectionState = useStore((s) => s.connectionState);
  const activeProjectId = useStore((s) => s.activeProjectId);
  const activeProject = useStore((s) => s.projectsById[s.activeProjectId] || null);
  const recoveryError = useStore((s) => s.threadsById[s.activeThreadId]?.metadata?.lastError || s.projectsById[s.activeProjectId]?.runtimeError || '');
  const restartProjectRuntime = useStore((s) => s.restartProjectRuntime);
  const initializeActiveThread = useStore((s) => s.initializeActiveThread);
  const currentModel = useStore((s) => s.currentModel);
  const currentMode = useStore((s) => s.currentMode);
  const sessionTitle = useStore((s) => s.sessionTitle);
  const usage = useStore((s) => s.usage);
  const availableCommands = useStore((s) => s.availableCommands);
  const sendPrompt = useStore((s) => s.sendPrompt);
  const cancelSession = useStore((s) => s.cancelSession);
  const isAwaitingResponse = useStore((s) => s.isAwaitingResponse);
  const activeThreadId = useStore((s) => s.activeThreadId);
  const promptQueue = useStore((s) => s.promptQueue || []);
  const removeQueuedPrompt = useStore((s) => s.removeQueuedPrompt);
  const pendingAttachments = useStore((s) => s.pendingAttachments || []);
  const chooseAttachments = useStore((s) => s.chooseAttachments);
  const removePendingAttachment = useStore((s) => s.removePendingAttachment);
  const capabilities = useStore((s) => s.capabilities || {});
  const models = useStore((s) => s.models);
  const modes = useStore((s) => s.modes);
  const setModel = useStore((s) => s.setModel);
  const setMode = useStore((s) => s.setMode);
  const currentModelName = useStore((s) => s.models.find(m => m.id === s.currentModel || m.modelId === s.currentModel)?.name || s.currentModel || '');
  const input = useStore((s) => s.threadsById[s.activeThreadId]?.draft || '');
  const setInput = useStore((s) => s.setThreadDraft);
  const [chatError, setChatError] = useState(null);
  const [recovering, setRecovering] = useState(false);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [showModePicker, setShowModePicker] = useState(false);
  // Auto-dismiss error banner after 8 seconds
  useEffect(() => {
    if (!chatError) return;
    const timer = setTimeout(() => setChatError(null), 8000);
    return () => clearTimeout(timer);
  }, [chatError]);
  const modeOptions = useMemo(() => {
    const labels = {
      default: '始终询问',
      acceptEdits: '接受编辑',
      plan: '计划模式',
      bypassPermissions: '跳过权限',
      dontAsk: '免确认',
      auto: '自动',
    };
    const items = (Array.isArray(modes) ? modes : [])
      .map((mode) => {
        const id = mode.id || mode.modeId;
        return id ? { id, name: mode.name || labels[id] || id } : null;
      })
      .filter(Boolean);
    if (currentMode && !items.some((item) => item.id === currentMode)) {
      items.unshift({ id: currentMode, name: labels[currentMode] || currentMode });
    }
    if (items.length === 0) items.push({ id: 'default', name: labels.default });
    return items;
  }, [currentMode, modes]);
  const currentModeName = modeOptions.find((m) => m.id === currentMode)?.name || currentMode || '始终询问';

  const permissionLabel = (() => {
    if (!currentMode) return null;
    if (['bypassPermissions', 'auto', 'dontAsk'].includes(currentMode)) return '跳过权限确认';
    if (currentMode === 'plan') return '规划模式';
    return null;
  })();

  const runtimeStatus = activeProject?.runtimeStatus || 'idle';
  const runtimeUnavailable = runtimeStatus === 'error' || runtimeStatus === 'stopped';
  const connectionNeedsRecovery = runtimeUnavailable || connectionState === 'error' || (connectionState === 'disconnected' && runtimeStatus === 'running');
  const canSend = connectionState === 'connected';
  const recoveryMessage = activeProject?.runtimeError || recoveryError || (runtimeStatus === 'stopped' ? '项目运行时已停止。' : 'CodeBuddy 会话连接已断开。');

  const recoverConnection = async () => {
    if (!activeProjectId || recovering) return;
    setRecovering(true);
    setChatError(null);
    try {
      const recovered = runtimeUnavailable ? await restartProjectRuntime(activeProjectId) : await initializeActiveThread(undefined);
      if (!recovered) {
        const currentError = useStore.getState().error;
        setChatError(currentError || '重新连接失败，请检查 CodeBuddy CLI 状态后重试。');
      }
    } catch (error) {
      setChatError('重新连接失败: ' + (error?.message || '未知错误'));
    } finally {
      setRecovering(false);
    }
  };

  const isStreaming = useMemo(() => timeline.some(item => item.streaming === true) || isAwaitingResponse, [timeline, isAwaitingResponse]);
  const slashSuggestions = useMemo(() => {
    if (!input.startsWith('/') || input.includes(' ')) return [];
    const query = input.slice(1).toLowerCase();
    return availableCommands
      .filter((command) => !query || String(command.name || '').toLowerCase().includes(query))
      .slice(0, 8);
  }, [availableCommands, input]);

  // Auto-scroll to bottom when timeline changes (new messages arrive)
  useEffect(() => {
    if (messagesEndRef.current && isStreaming) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [timeline, isStreaming]);

  // Track scroll position for "scroll to bottom" button
  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (el) {
      const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 150;
      setShowScrollBtn(!isNearBottom);
    }
  }, []);

  const onSubmit = async () => {
    const value = input.trim();
    if (!value && pendingAttachments.length === 0) return;
    if (!canSend) {
      setChatError('当前会话尚未连接，请先重新连接后再发送。');
      return;
    }
    setChatError(null);
    try {
      const sent = await sendPrompt(value);
      if (!sent) {
        setChatError('发送失败，草稿和附件已恢复，可重新连接后再次发送。');
      }
    } catch (err) {
      setChatError('发送消息失败: ' + (err.message || '未知错误'));
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSubmit();
    }
  };

  // Group by date
  const timelineWithDates = useMemo(() => {
    let lastDay = '';
    return timeline.map((item) => {
      const day = getDayLabel(item.createdAt);
      const showDate = day !== lastDay && timeline.indexOf(item) > 0;
      lastDay = day;
      return { ...item, showDate };
    });
  }, [timeline]);
  const recoveryNotice = connectionNeedsRecovery ? (
    <div className={`${timeline.length === 0 ? 'mt-16 ' : ''}mb-4 rounded-md border border-[rgba(248,113,113,0.3)] bg-[rgba(248,113,113,0.08)] px-4 py-4 text-center`}>
      <div className="text-sm font-medium text-[var(--color-accent-red)]">
        {runtimeUnavailable ? '项目运行时不可用' : 'CodeBuddy 会话连接失败'}
      </div>
      <div className="mt-2 break-words text-xs leading-5 text-[var(--color-text-secondary)]">
        {recoveryMessage}
      </div>
      <button
        type="button"
        className="btn-primary mt-4 px-4 py-2 text-xs"
        disabled={recovering}
        onClick={recoverConnection}
      >
        {recovering ? '正在恢复...' : runtimeUnavailable ? '重新启动并连接' : '重新连接'}
      </button>
    </div>
  ) : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[var(--color-bg-primary)]">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto" ref={scrollContainerRef} onScroll={handleScroll}>
        <div className="mx-auto max-w-3xl px-6 py-4">
          {timeline.length === 0 ? (
            connectionState === 'connecting' || runtimeStatus === 'starting' ? (
              <div className="flex items-center justify-center h-64">
                <div className="flex flex-col items-center gap-3">
                  <div className="animate-spin w-6 h-6 border-2 border-[var(--color-border-default)] border-t-[var(--color-accent-blue)] rounded-full" />
                  <span className="text-sm" style={{color:'var(--color-text-tertiary)'}}>正在加载对话...</span>
                </div>
              </div>
            ) : connectionNeedsRecovery ? recoveryNotice : (
              <div className="flex flex-col items-center justify-center pt-20">
                <div className="mb-3 text-2xl font-semibold text-[var(--color-text-primary)]">CodeBuddy Code</div>
                <div className="mb-4 text-sm text-[var(--color-text-secondary)]">今天有什么可以帮到你？</div>
                <div className="flex flex-wrap items-center justify-center gap-2 text-xs">
                  {['幻灯片生成', '深度研究', '文档处理', '数据分析'].map((tag) => (
                    <span key={tag} className="rounded-full bg-[var(--color-bg-secondary)] border border-[var(--color-border-muted)] px-3 py-1 text-[var(--color-text-secondary)] cursor-pointer hover:text-[var(--color-text-primary)] hover:border-[var(--color-border-default)] transition-colors"
                      onClick={() => setInput(`帮我做一个${tag}任务`)}>
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )
          ) : (
            <div>
              <div className="text-xs text-[var(--color-text-muted)] text-center py-2">回答由 AI 生成，仅供参考</div>
              {timelineWithDates.map((item, idx) => (
                <React.Fragment key={item.id || idx}>
                  {item.showDate && <DateSeparator label={getDayLabel(item.createdAt)} />}
                  <TimelineItem item={item} />
                </React.Fragment>
              ))}
            </div>
          )}
          {timeline.length > 0 ? recoveryNotice : null}
          {chatError && (
            <div className="mx-0 mb-4 p-3 rounded-lg flex items-center justify-between"
                 style={{ background: 'var(--color-error-bg)', border: '1px solid var(--color-error)', color: 'var(--color-error)' }}>
              <span className="text-sm">{chatError}</span>
              <button className="btn-ghost text-sm" style={{ color: 'var(--color-error)' }}
                      onClick={() => setChatError(null)}>关闭</button>
            </div>
          )}
          <div ref={messagesEndRef} />
          {showScrollBtn && (
            <div className="sticky bottom-4 flex justify-center">
              <button
                className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)] shadow-lg hover:bg-[var(--color-bg-hover)] transition-all z-30"
                onClick={() => {
                  messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
                }}
                title="滚动到最新"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M4 6l4 4 4-4" />
                </svg>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Input area */}
      <div className="shrink-0 px-4 pb-4">
        <div className="mx-auto max-w-3xl">
          {pendingAttachments.length > 0 ? (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {pendingAttachments.map((attachment) => (
                <div key={attachment.path} className="flex max-w-full items-center gap-1.5 rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] px-2 py-1 text-xs text-[var(--color-text-secondary)]">
                  <span>{attachment.kind === 'image' ? '图片' : '文件'}</span>
                  <span className="max-w-[220px] truncate" title={attachment.path}>{attachment.name}</span>
                  <button className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]" onClick={() => removePendingAttachment(attachment.path)} title="移除附件">×</button>
                </div>
              ))}
            </div>
          ) : null}
          {promptQueue.length > 0 ? (
            <div className="mb-2 rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] px-3 py-2">
              <div className="mb-1 text-[10px] uppercase tracking-wide text-[var(--color-text-muted)]">待发送 {promptQueue.length}</div>
              <div className="space-y-1">
                {promptQueue.map((item, index) => (
                  <div key={item.id} className="flex items-center gap-2 text-xs">
                    <span className="text-[var(--color-text-muted)]">{index + 1}</span>
                    <span className="min-w-0 flex-1 truncate text-[var(--color-text-secondary)]" title={item.text}>{item.text}</span>
                    <button
                      className="flex h-5 w-5 items-center justify-center rounded text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
                      onClick={() => removeQueuedPrompt(activeThreadId, item.id)}
                      title="移除待发送提示"
                      aria-label="移除待发送提示"
                    >
                      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 3l10 10M13 3L3 13" /></svg>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          <div className="relative rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] shadow-sm transition-all focus-within:shadow-md focus-within:border-[var(--color-border-focus)]">
            {slashSuggestions.length > 0 ? (
              <div className="absolute bottom-full left-0 right-0 z-20 mb-2 max-h-64 overflow-y-auto rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] py-1 shadow-xl">
                {slashSuggestions.map((command) => (
                  <button
                    key={command.name}
                    className="flex w-full items-start gap-3 px-3 py-2 text-left hover:bg-[var(--color-bg-hover)]"
                    onClick={() => setInput(`/${command.name} `)}
                  >
                    <span className="shrink-0 font-mono text-xs text-[var(--color-accent-blue)]">/{command.name}</span>
                    <span className="line-clamp-2 text-xs text-[var(--color-text-secondary)]">{command.description || ''}</span>
                  </button>
                ))}
              </div>
            ) : null}
            <textarea
              rows={2}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={canSend ? '从一个想法开始...' : '会话恢复后即可发送，草稿会保留'}
              className="w-full resize-none bg-transparent px-4 pt-3 pb-1 text-sm text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-muted)]"
            />
            <div className="flex items-center justify-between px-3 pb-3">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
                  onClick={chooseAttachments}
                  title={capabilities?.promptCapabilities?.image || capabilities?.prompt_capabilities?.image ? '添加文本文件或图片' : '添加文本文件（当前运行时未声明图片输入能力）'}
                  aria-label="添加附件"
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M5.5 8.5l4.2-4.2a2.1 2.1 0 013 3L7.2 12.8a3.2 3.2 0 01-4.5-4.5l5.1-5.1" /></svg>
                </button>
                <div className="relative">
                  <button
                    className="flex items-center gap-1 rounded-full border border-[var(--color-border-default)] bg-[var(--color-bg-primary)] px-2.5 py-1 text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
                    onClick={(e) => { e.stopPropagation(); setShowModePicker(!showModePicker); }}
                  >
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M8 2c-1.5 0-3 .5-4 1.5l1.5 1.5C6.5 4.5 7.5 4 8 4c2 0 4 1.5 4 4h-1.5l2 2.5 2-2.5H13c0-2.5-2-4-5-4z" />
                      <path d="M8 14c1.5 0 3-.5 4-1.5L10.5 11C9.5 11.5 8.5 12 8 12c-2 0-4-1.5-4-4h1.5l-2-2.5-2 2.5H3c0 2.5 2 4 5 4z" />
                    </svg>
                    {currentModeName}
                  </button>
                  {showModePicker && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setShowModePicker(false)} />
                      <div className="absolute bottom-full left-0 mb-1 z-20 w-40 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] shadow-xl py-1">
                        {modeOptions.map((m) => (
                          <button
                            key={m.id}
                            className="w-full text-left px-3 py-1.5 text-xs hover:bg-[var(--color-bg-hover)] transition-colors"
                            style={{ color: m.id === currentMode ? 'var(--color-accent-blue)' : 'var(--color-text-secondary)' }}
                            onClick={() => {
                              setMode(m.id);
                              setShowModePicker(false);
                            }}
                          >
                            {m.name}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
                {permissionLabel && (
                  <span className="text-xs px-2 py-1 rounded"
                        style={{
                          background: 'var(--color-info-bg, rgba(59,130,246,0.1))',
                          color: 'var(--color-accent-blue)',
                          border: '1px solid var(--color-accent-blue, rgba(59,130,246,0.3))'
                        }}>
                    {permissionLabel}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <div className="relative">
                  <button
                    className="rounded-full border border-[var(--color-border-default)] bg-[var(--color-bg-primary)] px-2.5 py-1 text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors truncate max-w-[180px]"
                    onClick={(e) => { e.stopPropagation(); setShowModelPicker(!showModelPicker); }}
                  >
                    {currentModelName || currentModel || '选择模型'}
                  </button>
                  {showModelPicker && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setShowModelPicker(false)} />
                      <div className="absolute bottom-full left-0 mb-1 z-20 w-56 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] shadow-xl py-1 max-h-60 overflow-y-auto">
                        {models.length > 0 ? models.map((m) => (
                          <button
                            key={m.id || m.name}
                            className="w-full text-left px-3 py-1.5 text-xs hover:bg-[var(--color-bg-hover)] transition-colors"
                            style={{ color: (m.id || m.name) === currentModel ? 'var(--color-accent-blue)' : 'var(--color-text-secondary)' }}
                            onClick={() => {
                              setModel(m.id || m.name);
                              setShowModelPicker(false);
                            }}
                          >
                            {m.name || m.id}
                          </button>
                        )) : (
                          <div className="px-3 py-2 text-xs text-[var(--color-text-muted)]">加载中...</div>
                        )}
                      </div>
                    </>
                  )}
                </div>
                {isStreaming ? (
                  <button
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-white hover:brightness-110 transition-all" style={{ background: 'var(--color-accent-red)' }}
                    onClick={() => cancelSession()}
                    title="停止生成"
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                      <rect x="3" y="3" width="10" height="10" rx="1" />
                    </svg>
                  </button>
                ) : null}
                <button
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-white hover:brightness-110 transition-all disabled:opacity-40" style={{ background: 'var(--color-accent-blue)' }}
                  onClick={onSubmit}
                  disabled={!canSend || (!input.trim() && pendingAttachments.length === 0)}
                  title={!canSend ? '等待会话连接' : isStreaming ? '加入待发送队列' : '发送'}
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M15.854.146a.5.5 0 01.113.534l-5 14a.5.5 0 01-.927-.06L7.189 7.19.814 4.96a.5.5 0 01-.047-.927l14-5a.5.5 0 01.587.113z" />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          {usage && (
            <div className="mt-2 text-center text-[10px] text-[var(--color-text-muted)]">
              用量: {usage.used ?? '-'} / {usage.size ?? '-'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
