import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { useStore } from '../store';
import { copyTextToClipboard } from '../lib/clipboard';

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

function readClipboardImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('读取剪贴板图片失败'));
    reader.readAsDataURL(file);
  });
}

function getPromptSuggestionText(value) {
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) {
    return value.map(getPromptSuggestionText).filter(Boolean).join('\n').trim();
  }
  if (!value || typeof value !== 'object') return '';
  for (const key of ['suggestion', 'text', 'content']) {
    const text = getPromptSuggestionText(value[key]);
    if (text) return text;
  }
  return '';
}

function CopyButton({ text }) {
  const [copyStatus, setCopyStatus] = useState('idle');
  const resetTimerRef = useRef(null);

  useEffect(() => () => {
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
  }, []);

  const handleCopy = useCallback(async () => {
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    try {
      await copyTextToClipboard(text);
      setCopyStatus('success');
    } catch (_) {
      setCopyStatus('error');
    }
    resetTimerRef.current = setTimeout(() => {
      resetTimerRef.current = null;
      setCopyStatus('idle');
    }, 1800);
  }, [text]);

  const title = copyStatus === 'success' ? '已复制' : copyStatus === 'error' ? '复制失败' : '复制到剪贴板';

  return (
    <button
      className="ml-2 flex-shrink-0 rounded p-1 opacity-0 transition-opacity hover:opacity-100 group-hover:opacity-100 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
      onClick={handleCopy}
      title={title}
      aria-label={title}
    >
      {copyStatus === 'success' ? (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="var(--color-accent-green)" strokeWidth="1.5"><path d="M3 8l3 3 7-7" /></svg>
      ) : copyStatus === 'error' ? (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="var(--color-accent-red)" strokeWidth="1.5"><path d="M4 4l8 8M12 4l-8 8" /></svg>
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

function EventDetails({ value }) {
  const [expanded, setExpanded] = useState(false);
  const details = useMemo(() => {
    if (!value || typeof value !== 'object') return '';
    try {
      const text = JSON.stringify(value, null, 2);
      return text.length > 20000 ? text.slice(0, 20000) + '\n...详情已截断' : text;
    } catch (_) {
      return '';
    }
  }, [value]);
  if (!details) return null;
  return (
    <div className="mt-2">
      <button
        type="button"
        className="text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? '收起详情' : '查看详情'}
      </button>
      {expanded ? (
        <pre className="mt-1 max-h-52 overflow-auto whitespace-pre-wrap break-all rounded bg-[var(--color-bg-primary)] p-2 text-[10px] leading-4 text-[var(--color-text-secondary)]">{details}</pre>
      ) : null}
    </div>
  );
}

function ErrorTimelineCard({ item }) {
  const payload = item.meta || item.raw || {};
  const message = item.content || payload.message || payload.error?.message || 'CodeBuddy 执行失败';
  return (
    <div className="my-3 rounded-md border border-[rgba(239,68,68,0.35)] bg-[rgba(239,68,68,0.08)] px-3 py-2.5">
      <div className="flex items-start gap-2">
        <svg className="mt-0.5 shrink-0 text-[var(--color-accent-red)]" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="8" cy="8" r="6.5" /><path d="M8 4.5v4M8 11.5v.1" /></svg>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium text-[var(--color-accent-red)]">执行失败</div>
          <div className="mt-1 whitespace-pre-wrap break-words text-xs leading-5 text-[var(--color-text-secondary)]">{message}</div>
          <EventDetails value={payload} />
        </div>
      </div>
    </div>
  );
}

function ArtifactTimelineCard({ item }) {
  const payload = item.meta || item.raw || {};
  const artifact = payload.artifact && typeof payload.artifact === 'object' ? payload.artifact : payload;
  const tasks = Array.isArray(artifact.tasks) ? artifact.tasks : [];
  const title = artifact.title || artifact.name || artifact.type || 'CodeBuddy 产物';
  const eventLabels = { created: '已创建', updated: '已更新', deleted: '已删除' };
  const eventLabel = eventLabels[payload.event] || '产物';
  const summary = getPromptSuggestionText(artifact.description || artifact.content || artifact.text);
  const statusLabels = { completed: '已完成', in_progress: '进行中', pending: '待处理', failed: '失败' };
  return (
    <div className="my-3 rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] px-3 py-2.5">
      <div className="flex items-start gap-2">
        <svg className="mt-0.5 shrink-0 text-[var(--color-accent-blue)]" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M3 2.5h6l4 4V14H3V2.5z" /><path d="M9 2.5V7h4" /></svg>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-xs font-medium text-[var(--color-text-primary)]">{title}</span>
            <span className="text-[10px] text-[var(--color-text-muted)]">{eventLabel}</span>
            {artifact.mimeType ? <span className="text-[10px] text-[var(--color-text-muted)]">{artifact.mimeType}</span> : null}
          </div>
          {summary ? <div className="mt-1 whitespace-pre-wrap break-words text-xs leading-5 text-[var(--color-text-secondary)]">{summary}</div> : null}
          {tasks.length ? (
            <div className="mt-2 space-y-1">
              {tasks.map((task, index) => (
                <div key={task.id || index} className="flex items-start gap-2 text-xs">
                  <span className={task.status === 'completed' ? 'text-[var(--color-accent-green)]' : task.status === 'failed' ? 'text-[var(--color-accent-red)]' : 'text-[var(--color-text-muted)]'}>{task.status === 'completed' ? '✓' : task.status === 'failed' ? '×' : '•'}</span>
                  <span className="min-w-0 flex-1 break-words text-[var(--color-text-secondary)]">{task.content || task.subject || task.title || task.id || '未命名任务'}</span>
                  <span className="shrink-0 text-[10px] text-[var(--color-text-muted)]">{statusLabels[task.status] || task.status || ''}</span>
                </div>
              ))}
            </div>
          ) : null}
          {artifact.uri ? <div className="mt-2 truncate font-mono text-[10px] text-[var(--color-text-muted)]" title={artifact.uri}>{artifact.uri}</div> : null}
          <EventDetails value={payload} />
        </div>
      </div>
    </div>
  );
}

function ActivityTimelineCard({ item }) {
  const payload = item.meta || item.raw || {};
  const source = payload.checkpoint && typeof payload.checkpoint === 'object'
    ? payload.checkpoint
    : payload.task && typeof payload.task === 'object'
      ? payload.task
      : payload;
  const labels = {
    checkpoint: '检查点',
    taskCreated: '任务已创建',
    taskStatus: '任务状态更新',
    'goal-progress': '目标进度',
    'goal-status': '目标状态更新',
    question_answered: '问题已回答',
  };
  const eventLabels = { created: '已创建', updated: '已更新', reverted: '已回退' };
  const title = item.type === 'checkpoint'
    ? '检查点' + (eventLabels[payload.event] ? ' · ' + eventLabels[payload.event] : '')
    : (labels[item.type] || 'CodeBuddy 动态');
  const summary = item.content
    || source.title
    || source.name
    || source.subject
    || source.condition
    || source.reason
    || source.message
    || source.status
    || source.id
    || '';
  return (
    <div className="my-2 border-l-2 border-[var(--color-border-default)] py-1 pl-3">
      <div className="text-[10px] font-medium text-[var(--color-text-muted)]">{title}</div>
      {summary ? <div className="mt-0.5 whitespace-pre-wrap break-words text-xs leading-5 text-[var(--color-text-secondary)]">{String(summary)}</div> : null}
      <EventDetails value={payload} />
    </div>
  );
}

function SessionActivityStatus({ historyReplayActive, agentPhase, progress }) {
  const phase = typeof agentPhase === 'string' ? agentPhase : agentPhase?.type || agentPhase?.phase || '';
  const progressType = typeof progress === 'string' ? progress : progress?.type || '';
  const current = historyReplayActive ? 'history-replay' : progressType || phase;
  if (!current || ['idle', 'completed', 'done', 'ready'].includes(current)) return null;
  const labels = {
    'history-replay': '正在恢复会话历史',
    compacting: '正在压缩上下文',
    thinking: '正在思考',
    reasoning: '正在推理',
    responding: '正在生成回复',
    tool: '正在执行工具',
    tool_use: '正在执行工具',
    planning: '正在规划',
  };
  return (
    <div className="mb-3 flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
      <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-[var(--color-accent-blue)]" />
      <span>{labels[current] || String(current)}</span>
    </div>
  );
}

function TeamStatusPanel({ teamState }) {
  if (!teamState) return null;
  const members = Array.isArray(teamState.members) ? teamState.members : [];
  const teamName = teamState.teamName || teamState.name || 'CodeBuddy 团队';
  const statusLabels = { working: '工作中', running: '工作中', in_progress: '工作中', idle: '空闲', completed: '已完成', failed: '失败', waiting: '等待中' };
  return (
    <div className="mb-3 border-b border-[var(--color-border-muted)] pb-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-medium text-[var(--color-text-primary)]">{teamName}</span>
        {teamState.isAutoTeam ? <span className="text-[10px] text-[var(--color-text-muted)]">自动团队</span> : null}
        <span className="text-[10px] text-[var(--color-text-muted)]">{members.length} 位成员</span>
      </div>
      {members.length ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {members.map((member, index) => {
            const name = member.name || member.agentName || member.role || '成员 ' + (index + 1);
            const status = member.status || member.state || 'idle';
            const active = ['working', 'running', 'in_progress'].includes(status);
            return (
              <div key={member.id || member.name || index} className="flex min-w-0 max-w-[240px] items-center gap-1.5 rounded border border-[var(--color-border-muted)] bg-[var(--color-bg-secondary)] px-2 py-1 text-[10px]">
                <span className={'h-1.5 w-1.5 shrink-0 rounded-full ' + (status === 'failed' ? 'bg-[var(--color-accent-red)]' : active ? 'bg-[var(--color-accent-blue)]' : status === 'completed' ? 'bg-[var(--color-accent-green)]' : 'bg-[var(--color-text-muted)]')} />
                <span className="truncate text-[var(--color-text-secondary)]" title={name}>{name}</span>
                <span className="shrink-0 text-[var(--color-text-muted)]">{statusLabels[status] || status}</span>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function InterruptionCard({ item }) {
  const respondToInterruption = useStore((s) => s.respondToInterruption);
  const interruptionId = item.meta?.interruptionId || item.meta?.toolCallId || item.raw?.interruptionId || item.raw?.toolCallId || item.toolCallId;
  const toolCallId = item.meta?.toolCallId || item.raw?.toolCallId || item.toolCallId || null;
  const permissionOptions = item.meta?.options || item.raw?.options || [];
  const expired = item.status === 'expired';
  const resolved = item.status === 'resolved';
  const resolution = item.meta?.resolution;
  const resolutionLabels = {
    allow: '已允许',
    allowAll: '已始终允许',
    deny: '已拒绝',
    reject: '已拒绝',
    rejectAndExitPlan: '已拒绝并退出计划',
  };
  const resolutionDenied = ['deny', 'reject', 'rejectAndExitPlan'].includes(resolution);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const resolve = async (decision) => {
    if (!interruptionId || busy || resolved || expired) return;
    setBusy(true);
    setError('');
    try {
      const ok = await respondToInterruption(interruptionId, decision, toolCallId);
      if (!ok) setError(useStore.getState().error || '权限响应失败，请重试');
    } catch (responseError) {
      setError(responseError?.message || '权限响应失败，请重试');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="my-2 rounded-xl px-4 py-3" style={{ border: '1px solid var(--color-accent-yellow, rgba(245,158,11,0.35))', background: 'var(--color-warning-bg, rgba(245,158,11,0.08))' }}>
      <div className="mb-2 flex items-center gap-2">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="var(--color-accent-yellow)"><path d="M8 1l7 13H1L8 1zm0 5v3m0 2v1" /></svg>
        <div className="text-sm font-medium text-[var(--color-text-primary)]">权限请求</div>
      </div>
      <pre className="mb-3 max-h-24 overflow-x-auto whitespace-pre-wrap break-words text-xs text-[var(--color-text-secondary)]">
        {JSON.stringify(item.meta || item.raw, null, 2)}
      </pre>
      {expired ? (
        <div className="text-xs font-medium text-[var(--color-text-muted)]">请求已失效，请重新发起对话</div>
      ) : resolved ? (
        <div className={'text-xs font-medium ' + (resolutionDenied ? 'text-[var(--color-accent-red)]' : 'text-[var(--color-accent-green)]')}>{resolutionLabels[resolution] || '已处理'}</div>
      ) : interruptionId ? (
        <div className="flex flex-wrap gap-2">
          <button disabled={busy} className="rounded-md px-3 py-1.5 text-xs font-medium text-white hover:brightness-110 disabled:opacity-50" style={{ background: 'var(--color-accent-blue)' }} onClick={() => resolve('allow')}>{busy ? '处理中...' : '允许'}</button>
          {permissionOptions.some((option) => ['allow_always', 'allowAll'].includes(typeof option === 'string' ? option : option.optionId || option.name)) ? (
            <button disabled={busy} className="rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] px-3 py-1.5 text-xs font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] disabled:opacity-50" onClick={() => resolve('allowAll')}>始终允许</button>
          ) : null}
          <button disabled={busy} className="rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] px-3 py-1.5 text-xs font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] disabled:opacity-50" onClick={() => resolve('deny')}>拒绝</button>
          {permissionOptions.some((option) => ['reject_and_exit_plan', 'rejectAndExitPlan'].includes(typeof option === 'string' ? option : option.optionId || option.name)) ? (
            <button disabled={busy} className="rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] px-3 py-1.5 text-xs font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] disabled:opacity-50" onClick={() => resolve('rejectAndExitPlan')}>拒绝并退出计划</button>
          ) : null}
        </div>
      ) : (
        <div className="text-xs text-[var(--color-accent-red)]">权限请求缺少标识，无法响应</div>
      )}
      {error ? <div className="mt-2 text-xs text-[var(--color-accent-red)]">{error}</div> : null}
    </div>
  );
}

function QuestionCard({ item }) {
  const submitQuestionAnswers = useStore((s) => s.submitQuestionAnswers);
  const cancelQuestionAnswers = useStore((s) => s.cancelQuestionAnswers);
  const toolCallId = item.meta?.toolCallId || item.raw?.toolCallId || item.toolCallId;
  const questions = item.meta?.questions || item.raw?.questions || [];
  const resolved = item.status === 'answered' || item.status === 'cancelled' || item.status === 'expired';
  const cancellable = (item.meta?.responseMode || item.raw?.responseMode) === 'json-rpc';
  const [answers, setAnswers] = useState(item.meta?.submittedAnswers || {});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const allAnswered = questions.length > 0 && questions.every((question, index) => {
    const answer = answers[question.id || index];
    return Array.isArray(answer) ? answer.length > 0 : String(answer || '').trim();
  });

  const submit = async () => {
    if (!toolCallId || busy || resolved || !allAnswered) return;
    setBusy(true);
    setError('');
    try {
      const ok = await submitQuestionAnswers(toolCallId, answers);
      if (!ok) setError(useStore.getState().error || '答案提交失败，请重试');
    } catch (submitError) {
      setError(submitError?.message || '答案提交失败，请重试');
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (!toolCallId || busy || resolved || !cancellable) return;
    setBusy(true);
    setError('');
    try {
      const ok = await cancelQuestionAnswers(toolCallId);
      if (!ok) setError(useStore.getState().error || '取消问题失败，请重试');
    } catch (cancelError) {
      setError(cancelError?.message || '取消问题失败，请重试');
    } finally {
      setBusy(false);
    }
  };

  const toggleOption = (key, value) => {
    setAnswers((previous) => {
      const selected = Array.isArray(previous[key]) ? previous[key] : [];
      return {
        ...previous,
        [key]: selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value],
      };
    });
  };

  return (
    <div className="my-2 rounded-xl px-4 py-3" style={{ border: '1px solid var(--color-accent-blue, rgba(0,120,212,0.35))', background: 'var(--color-info-bg, rgba(0,120,212,0.08))' }}>
      <div className="mb-2 flex items-center gap-2">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="var(--color-accent-blue)"><path d="M8 1C4.1 1 1 4.1 1 8s3.1 7 7 7 7-3.1 7-7-3.1-7-7-7zm0 2.5c.7 0 1.3.6 1.3 1.3s-.6 1.3-1.3 1.3-1.3-.6-1.3-1.3.6-1.3 1.3-1.3zm1.5 9H6.5v-1h1V8H6.5V7h2.5v4.5H9.5V12z" /></svg>
        <span className="text-sm font-medium text-[var(--color-text-primary)]">问题</span>
      </div>
      {resolved ? (
        <div className={'text-xs font-medium ' + (item.status === 'answered' ? 'text-[var(--color-accent-green)]' : 'text-[var(--color-text-muted)]')}>{item.status === 'expired' ? '请求已失效，请重新发起对话' : item.status === 'cancelled' ? '已取消' : '答案已提交'}</div>
      ) : (
        <>
          <div className="space-y-3">
            {questions.map((question, index) => {
              const key = question.id || index;
              const options = Array.isArray(question.options) ? question.options : Array.isArray(question.choices) ? question.choices : [];
              return (
                <div key={key}>
                  {question.header ? <div className="mb-1 text-[10px] font-medium text-[var(--color-text-muted)]">{question.header}</div> : null}
                  <div className="mb-1 text-xs text-[var(--color-text-primary)]">{question.question || question.prompt || '问题 ' + (index + 1)}</div>
                  {options.length > 0 && question.multiSelect ? (
                    <div className="space-y-1">
                      {options.map((option, optionIndex) => {
                        const value = typeof option === 'string' ? option : option.value || option.id || option.label;
                        const label = typeof option === 'string' ? option : option.label || option.name || value;
                        const description = typeof option === 'string' ? '' : option.description || '';
                        const checked = Array.isArray(answers[key]) && answers[key].includes(value);
                        return value ? (
                          <label key={value || optionIndex} className="flex cursor-pointer items-start gap-2 rounded-md border border-[var(--color-border-muted)] px-2.5 py-2 hover:bg-[var(--color-bg-hover)]">
                            <input type="checkbox" className="mt-0.5" checked={checked} disabled={busy} onChange={() => toggleOption(key, value)} />
                            <span className="min-w-0">
                              <span className="block text-xs text-[var(--color-text-primary)]">{label}</span>
                              {description ? <span className="mt-0.5 block text-[10px] leading-4 text-[var(--color-text-muted)]">{description}</span> : null}
                            </span>
                          </label>
                        ) : null;
                      })}
                    </div>
                  ) : options.length > 0 ? (
                    <select
                      className="w-full rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-primary)] px-3 py-1.5 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent-blue)]"
                      value={answers[key] || ''}
                      disabled={busy}
                      onChange={(event) => setAnswers((previous) => ({ ...previous, [key]: event.target.value }))}
                    >
                      <option value="">请选择</option>
                      {options.map((option, optionIndex) => {
                        const value = typeof option === 'string' ? option : option.value || option.id || option.label;
                        const label = typeof option === 'string' ? option : option.label || option.name || value;
                        return value ? <option key={value || optionIndex} value={value}>{label}</option> : null;
                      })}
                    </select>
                  ) : (
                    <input
                      className="w-full rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-primary)] px-3 py-1.5 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent-blue)]"
                      value={answers[key] || ''}
                      disabled={busy}
                      onChange={(event) => setAnswers((previous) => ({ ...previous, [key]: event.target.value }))}
                      placeholder="输入你的答案..."
                    />
                  )}
                </div>
              );
            })}
          </div>
          {toolCallId ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <button disabled={busy || !allAnswered} className="rounded-md px-3 py-1.5 text-xs font-medium text-white hover:brightness-110 disabled:opacity-50" style={{ background: 'var(--color-accent-blue)' }} onClick={submit}>
                {busy ? '处理中...' : '提交答案'}
              </button>
              {cancellable ? <button disabled={busy} className="rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] px-3 py-1.5 text-xs font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] disabled:opacity-50" onClick={cancel}>取消</button> : null}
            </div>
          ) : (
            <div className="mt-3 text-xs text-[var(--color-accent-red)]">问题请求缺少标识，无法提交</div>
          )}
        </>
      )}
      {error ? <div className="mt-2 text-xs text-[var(--color-accent-red)]">{error}</div> : null}
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
  if (item.type === 'error') {
    return <ErrorTimelineCard item={item} />;
  }

  if (item.type === 'artifact') {
    return <ArtifactTimelineCard item={item} />;
  }

  if (['checkpoint', 'taskCreated', 'taskStatus', 'goal-progress', 'goal-status', 'question_answered'].includes(item.type)) {
    return <ActivityTimelineCard item={item} />;
  }

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
  const textareaRef = useRef(null);
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
  const showTokensCounter = useStore((s) => Boolean(s.guiSettings?.showTokensCounter));
  const pasteImageEnabled = useStore((s) => Boolean(s.guiSettings?.enablePasteImageFromClipboard));
  const promptSuggestionEnabled = useStore((s) => Boolean(s.guiSettings?.promptSuggestionEnabled));
  const promptSuggestion = useStore((s) => s.promptSuggestion);
  const clearPromptSuggestion = useStore((s) => s.clearPromptSuggestion);
  const teamState = useStore((s) => s.teamState);
  const agentPhase = useStore((s) => s.agentPhase);
  const progress = useStore((s) => s.progress);
  const historyReplayActive = useStore((s) => s.historyReplayActive);
  const availableCommands = useStore((s) => s.availableCommands);
  const sendPrompt = useStore((s) => s.sendPrompt);
  const cancelSession = useStore((s) => s.cancelSession);
  const isAwaitingResponse = useStore((s) => s.isAwaitingResponse);
  const activeThreadId = useStore((s) => s.activeThreadId);
  const promptQueue = useStore((s) => s.promptQueue || []);
  const moveQueuedPrompt = useStore((s) => s.moveQueuedPrompt);
  const removeQueuedPrompt = useStore((s) => s.removeQueuedPrompt);
  const drainThreadPromptQueue = useStore((s) => s.drainThreadPromptQueue);
  const pendingAttachments = useStore((s) => s.pendingAttachments || []);
  const chooseAttachments = useStore((s) => s.chooseAttachments);
  const addDroppedAttachments = useStore((s) => s.addDroppedAttachments);
  const addClipboardImageAttachment = useStore((s) => s.addClipboardImageAttachment);
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
  const [draggingAttachments, setDraggingAttachments] = useState(false);
  const [droppingAttachments, setDroppingAttachments] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [showModePicker, setShowModePicker] = useState(false);
  const [sessionSelectionStatus, setSessionSelectionStatus] = useState(null);
  const sessionSelectionRequestRef = useRef(0);
  const sessionSelectionInFlightRef = useRef(null);
  const sessionSelectionBusy = sessionSelectionStatus?.type === 'busy';
  const [cancelBusy, setCancelBusy] = useState(false);
  const cancelRequestRef = useRef(0);
  const cancelInFlightRef = useRef(null);
  const [queueActionBusy, setQueueActionBusy] = useState(false);
  const queueActionRequestRef = useRef(0);
  const queueActionInFlightRef = useRef(null);
  const recoveryInFlightRef = useRef(null);
  const sendLaunchInFlightRef = useRef(null);
  const pasteImageInFlightRef = useRef(null);
  const dropAttachmentsInFlightRef = useRef(null);
  // Auto-dismiss error banner after 8 seconds
  useEffect(() => {
    if (!chatError) return;
    const timer = setTimeout(() => setChatError(null), 8000);
    return () => clearTimeout(timer);
  }, [chatError]);
  useEffect(() => {
    sessionSelectionRequestRef.current += 1;
    cancelRequestRef.current += 1;
    queueActionRequestRef.current += 1;
    sessionSelectionInFlightRef.current = null;
    cancelInFlightRef.current = null;
    queueActionInFlightRef.current = null;
    recoveryInFlightRef.current = null;
    sendLaunchInFlightRef.current = null;
    pasteImageInFlightRef.current = null;
    dropAttachmentsInFlightRef.current = null;
    setDraggingAttachments(false);
    setDroppingAttachments(false);
    setSessionSelectionStatus(null);
    setRecovering(false);
    setChatError(null);
    setCancelBusy(false);
    setQueueActionBusy(false);
    setShowModelPicker(false);
    setShowModePicker(false);
  }, [activeProjectId, activeThreadId]);
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
  const promptSuggestionText = useMemo(() => getPromptSuggestionText(promptSuggestion), [promptSuggestion]);

  const applyPromptSuggestion = useCallback(() => {
    if (!promptSuggestionText || !activeThreadId) return;
    const currentDraft = String(input || '').trimEnd();
    setInput(currentDraft ? `${currentDraft}\n\n${promptSuggestionText}` : promptSuggestionText);
    clearPromptSuggestion(activeThreadId);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, [activeThreadId, clearPromptSuggestion, input, promptSuggestionText, setInput]);

  const dismissPromptSuggestion = useCallback(() => {
    clearPromptSuggestion(activeThreadId);
  }, [activeThreadId, clearPromptSuggestion]);

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

  const changeSessionSetting = async (kind, value) => {
    if (sessionSelectionInFlightRef.current || connectionState !== 'connected' || !activeThreadId || !value) return;
    const operation = {};
    sessionSelectionInFlightRef.current = operation;
    const projectId = activeProjectId;
    const threadId = activeThreadId;
    const requestId = ++sessionSelectionRequestRef.current;
    const label = kind === 'model' ? '模型' : '模式';
    const isCurrent = () => (
      requestId === sessionSelectionRequestRef.current
      && projectId === useStore.getState().activeProjectId
      && threadId === useStore.getState().activeThreadId
    );
    setSessionSelectionStatus({ type: 'busy', message: '正在切换' + label + '...' });
    try {
      const changed = kind === 'model' ? await setModel(value) : await setMode(value);
      if (!isCurrent()) return;
      if (changed) {
        setSessionSelectionStatus({ type: 'success', message: label + '已切换' });
        if (kind === 'model') setShowModelPicker(false);
        else setShowModePicker(false);
      } else {
        setSessionSelectionStatus({ type: 'error', message: useStore.getState().error || (label + '切换失败') });
      }
    } catch (error) {
      if (isCurrent()) setSessionSelectionStatus({ type: 'error', message: error?.message || (label + '切换失败') });
    } finally {
      if (sessionSelectionInFlightRef.current === operation) sessionSelectionInFlightRef.current = null;
    }
  };

  const cancelActiveSession = async () => {
    if (cancelInFlightRef.current || !activeThreadId) return;
    const operation = {};
    cancelInFlightRef.current = operation;
    const projectId = activeProjectId;
    const threadId = activeThreadId;
    const requestId = ++cancelRequestRef.current;
    const isCurrent = () => (
      requestId === cancelRequestRef.current
      && projectId === useStore.getState().activeProjectId
      && threadId === useStore.getState().activeThreadId
    );
    setCancelBusy(true);
    setChatError(null);
    try {
      const cancelled = await cancelSession();
      if (isCurrent() && !cancelled) setChatError(useStore.getState().error || '停止生成失败，请重试。');
    } catch (cancelError) {
      if (isCurrent()) setChatError(cancelError?.message || '停止生成失败，请重试。');
    } finally {
      if (cancelInFlightRef.current === operation) {
        cancelInFlightRef.current = null;
        if (isCurrent()) setCancelBusy(false);
      }
    }
  };

  const recoverConnection = async () => {
    if (!activeProjectId || recoveryInFlightRef.current) return;
    const operation = {};
    recoveryInFlightRef.current = operation;
    const projectId = activeProjectId;
    const threadId = activeThreadId;
    const isCurrent = () => (
      projectId === useStore.getState().activeProjectId
      && threadId === useStore.getState().activeThreadId
    );
    setRecovering(true);
    setChatError(null);
    try {
      const recovered = runtimeUnavailable ? await restartProjectRuntime(projectId) : await initializeActiveThread(undefined);
      if (!isCurrent()) return;
      if (!recovered) {
        const currentError = useStore.getState().error;
        setChatError(currentError || '重新连接失败，请检查 CodeBuddy CLI 状态后重试。');
      }
    } catch (error) {
      if (isCurrent()) setChatError('重新连接失败: ' + (error?.message || '未知错误'));
    } finally {
      if (recoveryInFlightRef.current === operation) {
        recoveryInFlightRef.current = null;
        if (isCurrent()) setRecovering(false);
      }
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
    if ((!value && pendingAttachments.length === 0) || sendLaunchInFlightRef.current) return;
    if (!canSend) {
      setChatError('当前会话尚未连接，请先重新连接后再发送。');
      return;
    }
    const operation = {};
    sendLaunchInFlightRef.current = operation;
    const projectId = activeProjectId;
    const threadId = activeThreadId;
    const isCurrent = () => (
      projectId === useStore.getState().activeProjectId
      && threadId === useStore.getState().activeThreadId
    );
    const releaseTimer = setTimeout(() => {
      if (sendLaunchInFlightRef.current === operation) sendLaunchInFlightRef.current = null;
    }, 0);
    setChatError(null);
    try {
      const sent = await sendPrompt(value);
      if (isCurrent() && !sent) {
        setChatError('发送失败，草稿和附件已恢复，可重新连接后再次发送。');
      }
    } catch (err) {
      if (isCurrent()) setChatError('发送消息失败: ' + (err.message || '未知错误'));
    } finally {
      clearTimeout(releaseTimer);
      if (sendLaunchInFlightRef.current === operation) sendLaunchInFlightRef.current = null;
    }
  };

  const resumePromptQueue = async () => {
    if (queueActionInFlightRef.current || !activeThreadId || !canSend || isStreaming) return;
    const operation = {};
    queueActionInFlightRef.current = operation;
    const projectId = activeProjectId;
    const threadId = activeThreadId;
    const requestId = ++queueActionRequestRef.current;
    const isCurrent = () => (
      requestId === queueActionRequestRef.current
      && projectId === useStore.getState().activeProjectId
      && threadId === useStore.getState().activeThreadId
    );
    setQueueActionBusy(true);
    setChatError(null);
    try {
      const resumed = await drainThreadPromptQueue(threadId);
      if (!isCurrent()) return;
      if (!resumed) setChatError(useStore.getState().error || '待发送队列暂时无法继续，请检查会话连接后重试。');
    } catch (error) {
      if (isCurrent()) setChatError(error?.message || '继续发送队列失败');
    } finally {
      if (queueActionInFlightRef.current === operation) {
        queueActionInFlightRef.current = null;
        if (isCurrent()) setQueueActionBusy(false);
      }
    }
  };

  const movePromptInQueue = async (promptId, direction) => {
    if (queueActionInFlightRef.current || !activeThreadId) return;
    const operation = {};
    queueActionInFlightRef.current = operation;
    const projectId = activeProjectId;
    const threadId = activeThreadId;
    const requestId = ++queueActionRequestRef.current;
    const isCurrent = () => (
      requestId === queueActionRequestRef.current
      && projectId === useStore.getState().activeProjectId
      && threadId === useStore.getState().activeThreadId
    );
    setQueueActionBusy(true);
    setChatError(null);
    try {
      const moved = await moveQueuedPrompt(threadId, promptId, direction);
      if (isCurrent() && !moved) setChatError(useStore.getState().error || '调整待发送顺序失败，请重试。');
    } catch (error) {
      if (isCurrent()) setChatError(error?.message || '调整待发送顺序失败');
    } finally {
      if (queueActionInFlightRef.current === operation) {
        queueActionInFlightRef.current = null;
        if (isCurrent()) setQueueActionBusy(false);
      }
    }
  };

  const removePromptFromQueue = async (promptId) => {
    if (queueActionInFlightRef.current || !activeThreadId) return;
    const operation = {};
    queueActionInFlightRef.current = operation;
    const projectId = activeProjectId;
    const threadId = activeThreadId;
    const requestId = ++queueActionRequestRef.current;
    const isCurrent = () => (
      requestId === queueActionRequestRef.current
      && projectId === useStore.getState().activeProjectId
      && threadId === useStore.getState().activeThreadId
    );
    setQueueActionBusy(true);
    setChatError(null);
    try {
      const removed = await removeQueuedPrompt(threadId, promptId);
      if (isCurrent() && !removed) setChatError(useStore.getState().error || '移除待发送提示失败，请重试。');
    } catch (error) {
      if (isCurrent()) setChatError(error?.message || '移除待发送提示失败');
    } finally {
      if (queueActionInFlightRef.current === operation) {
        queueActionInFlightRef.current = null;
        if (isCurrent()) setQueueActionBusy(false);
      }
    }
  };

  const handlePaste = async (event) => {
    if (!pasteImageEnabled) return;
    const files = Array.from(event.clipboardData?.items || [])
      .filter((item) => item.kind === 'file' && String(item.type || '').startsWith('image/'))
      .map((item) => item.getAsFile())
      .filter(Boolean);
    if (!files.length) return;
    if (!event.clipboardData?.getData('text/plain')) event.preventDefault();
    if (pasteImageInFlightRef.current) return;
    const operation = {};
    pasteImageInFlightRef.current = operation;
    const projectId = activeProjectId;
    const threadId = activeThreadId;
    const isCurrent = () => (
      projectId === useStore.getState().activeProjectId
      && threadId === useStore.getState().activeThreadId
    );
    setChatError(null);
    try {
      for (const file of files) {
        if (file.size > 20 * 1024 * 1024) throw new Error('剪贴板图片超过 20MB 限制');
        const dataBase64 = await readClipboardImage(file);
        if (!isCurrent()) return;
        const added = await addClipboardImageAttachment({
          name: file.name || 'clipboard-image',
          mimeType: file.type,
          size: file.size,
          dataBase64,
        });
        if (!isCurrent()) return;
        if (!added.length) throw new Error(useStore.getState().error || '粘贴图片失败');
      }
    } catch (error) {
      if (isCurrent()) setChatError(error?.message || '粘贴图片失败');
    } finally {
      if (pasteImageInFlightRef.current === operation) pasteImageInFlightRef.current = null;
    }
  };

  const hasDraggedFiles = (event) => Array.from(event.dataTransfer?.types || []).includes('Files');

  const handleDragEnter = (event) => {
    if (!hasDraggedFiles(event)) return;
    event.preventDefault();
    setDraggingAttachments(true);
  };

  const handleDragOver = (event) => {
    if (!hasDraggedFiles(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    if (!draggingAttachments) setDraggingAttachments(true);
  };

  const handleDragLeave = (event) => {
    if (event.relatedTarget && event.currentTarget.contains(event.relatedTarget)) return;
    setDraggingAttachments(false);
  };

  const handleDrop = async (event) => {
    if (!hasDraggedFiles(event)) return;
    event.preventDefault();
    setDraggingAttachments(false);
    if (dropAttachmentsInFlightRef.current) return;
    const files = Array.from(event.dataTransfer?.files || []);
    if (!files.length) return;
    const operation = {};
    dropAttachmentsInFlightRef.current = operation;
    const projectId = activeProjectId;
    const threadId = activeThreadId;
    const isCurrent = () => (
      projectId === useStore.getState().activeProjectId
      && threadId === useStore.getState().activeThreadId
    );
    setDroppingAttachments(true);
    setChatError(null);
    try {
      const result = await addDroppedAttachments(files);
      if (isCurrent() && result?.error) setChatError(result.error);
    } catch (error) {
      if (isCurrent()) setChatError(error?.message || '读取拖放附件失败');
    } finally {
      if (dropAttachmentsInFlightRef.current === operation) {
        dropAttachmentsInFlightRef.current = null;
        if (isCurrent()) setDroppingAttachments(false);
      }
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
          <SessionActivityStatus historyReplayActive={historyReplayActive} agentPhase={agentPhase} progress={progress} />
          <TeamStatusPanel teamState={teamState} />
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
          {promptSuggestionEnabled && promptSuggestionText ? (
            <div className="mb-2 flex items-start gap-2 rounded-md border border-[rgba(59,130,246,0.3)] bg-[rgba(59,130,246,0.08)] px-3 py-2">
              <svg className="mt-0.5 shrink-0 text-[var(--color-accent-blue)]" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                <path d="M8 1.5l1.1 3.1L12 6l-2.9 1.4L8 10.5 6.9 7.4 4 6l2.9-1.4L8 1.5zM12.5 10l.6 1.6 1.4.7-1.4.7-.6 1.5-.6-1.5-1.4-.7 1.4-.7.6-1.6z" />
              </svg>
              <button
                type="button"
                className="min-w-0 flex-1 text-left"
                onClick={applyPromptSuggestion}
                title={promptSuggestionText}
              >
                <span className="block text-[10px] font-medium uppercase text-[var(--color-accent-blue)]">CodeBuddy 建议</span>
                <span className="mt-0.5 line-clamp-3 block whitespace-pre-wrap break-words text-xs leading-5 text-[var(--color-text-secondary)]">{promptSuggestionText}</span>
              </button>
              <button
                type="button"
                className="shrink-0 rounded px-2 py-1 text-xs font-medium text-[var(--color-accent-blue)] hover:bg-[var(--color-bg-hover)]"
                onClick={applyPromptSuggestion}
              >
                使用建议
              </button>
              <button
                type="button"
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
                onClick={dismissPromptSuggestion}
                title="关闭建议"
                aria-label="关闭建议"
              >
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 3l10 10M13 3L3 13" /></svg>
              </button>
            </div>
          ) : null}
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
              <div className="mb-1 flex items-center justify-between gap-2">
                <div className="text-[10px] uppercase tracking-wide text-[var(--color-text-muted)]">待发送 {promptQueue.length}</div>
                <button
                  className="rounded px-2 py-0.5 text-[10px] text-[var(--color-accent-blue)] hover:bg-[var(--color-bg-hover)] disabled:cursor-wait disabled:opacity-50"
                  disabled={queueActionBusy || !canSend || isStreaming}
                  onClick={resumePromptQueue}
                  title={!canSend ? '等待会话连接' : isStreaming ? '当前消息完成后会自动继续' : '发送队列中的下一条消息'}
                >
                  {queueActionBusy ? '处理中...' : '继续发送'}
                </button>
              </div>
              <div className="space-y-1">
                {promptQueue.map((item, index) => (
                  <div key={item.id} className="flex items-center gap-2 text-xs">
                    <span className="text-[var(--color-text-muted)]">{index + 1}</span>
                    <span className="min-w-0 flex-1 truncate text-[var(--color-text-secondary)]" title={item.text}>{item.text}</span>
                    <button
                      className="flex h-5 w-5 items-center justify-center rounded text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)] disabled:cursor-not-allowed disabled:opacity-30"
                      disabled={queueActionBusy || index === 0}
                      onClick={() => movePromptInQueue(item.id, 'up')}
                      title="上移"
                      aria-label="上移待发送提示"
                    >
                      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 10l4-4 4 4" /></svg>
                    </button>
                    <button
                      className="flex h-5 w-5 items-center justify-center rounded text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)] disabled:cursor-not-allowed disabled:opacity-30"
                      disabled={queueActionBusy || index === promptQueue.length - 1}
                      onClick={() => movePromptInQueue(item.id, 'down')}
                      title="下移"
                      aria-label="下移待发送提示"
                    >
                      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 6l4 4 4-4" /></svg>
                    </button>
                    <button
                      className="flex h-5 w-5 items-center justify-center rounded text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)] disabled:cursor-wait disabled:opacity-50"
                      disabled={queueActionBusy}
                      onClick={() => removePromptFromQueue(item.id)}
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
          <div
            className={`relative rounded-2xl border bg-[var(--color-bg-secondary)] shadow-sm transition-all focus-within:shadow-md ${draggingAttachments || droppingAttachments ? 'border-[var(--color-accent-blue)]' : 'border-[var(--color-border-default)] focus-within:border-[var(--color-border-focus)]'}`}
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            {draggingAttachments || droppingAttachments ? (
              <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center rounded-2xl bg-[var(--color-bg-secondary)]/95 text-sm font-medium text-[var(--color-accent-blue)]">
                {droppingAttachments ? '正在读取附件...' : '释放以添加附件'}
              </div>
            ) : null}
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
              ref={textareaRef}
              rows={2}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onPaste={handlePaste}
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
                  disabled={droppingAttachments}
                  title={capabilities?.promptCapabilities?.image || capabilities?.prompt_capabilities?.image ? '添加文本文件或图片' : '添加文本文件（当前运行时未声明图片输入能力）'}
                  aria-label="添加附件"
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M5.5 8.5l4.2-4.2a2.1 2.1 0 013 3L7.2 12.8a3.2 3.2 0 01-4.5-4.5l5.1-5.1" /></svg>
                </button>
                <div className="relative">
                  <button
                    className="flex items-center gap-1 rounded-full border border-[var(--color-border-default)] bg-[var(--color-bg-primary)] px-2.5 py-1 text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors disabled:opacity-50"
                    disabled={sessionSelectionBusy || connectionState !== 'connected'}
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
                            disabled={sessionSelectionBusy}
                            className="w-full px-3 py-1.5 text-left text-xs transition-colors hover:bg-[var(--color-bg-hover)] disabled:opacity-50"
                            style={{ color: m.id === currentMode ? 'var(--color-accent-blue)' : 'var(--color-text-secondary)' }}
                            onClick={() => changeSessionSetting('mode', m.id)}
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
                    className="max-w-[180px] truncate rounded-full border border-[var(--color-border-default)] bg-[var(--color-bg-primary)] px-2.5 py-1 text-xs text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)] disabled:opacity-50"
                    disabled={sessionSelectionBusy || connectionState !== 'connected'}
                    onClick={(e) => { e.stopPropagation(); setShowModelPicker(!showModelPicker); }}
                  >
                    {currentModelName || currentModel || '选择模型'}
                  </button>
                  {showModelPicker && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setShowModelPicker(false)} />
                      <div className="absolute bottom-full left-0 mb-1 z-20 w-56 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] shadow-xl py-1 max-h-60 overflow-y-auto">
                        {models.length > 0 ? models.map((m) => {
                          const modelId = m.id || m.modelId || m.name;
                          return (
                          <button
                            key={modelId}
                            disabled={sessionSelectionBusy}
                            className="w-full px-3 py-1.5 text-left text-xs transition-colors hover:bg-[var(--color-bg-hover)] disabled:opacity-50"
                            style={{ color: modelId === currentModel ? 'var(--color-accent-blue)' : 'var(--color-text-secondary)' }}
                            onClick={() => changeSessionSetting('model', modelId)}
                          >
                            {m.name || m.id || m.modelId}
                          </button>
                          );
                        }) : (
                          <div className="px-3 py-2 text-xs text-[var(--color-text-muted)]">加载中...</div>
                        )}
                      </div>
                    </>
                  )}
                </div>
                {isStreaming ? (
                  <button
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-white transition-all hover:brightness-110 disabled:cursor-wait disabled:opacity-60" style={{ background: 'var(--color-accent-red)' }}
                    disabled={cancelBusy}
                    onClick={cancelActiveSession}
                    title={cancelBusy ? '正在停止生成' : '停止生成'}
                  >
                    {cancelBusy ? (
                      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/50 border-t-white" />
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                        <rect x="3" y="3" width="10" height="10" rx="1" />
                      </svg>
                    )}
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
            {sessionSelectionStatus ? (
              <div className={`px-4 pb-2 text-[10px] ${sessionSelectionStatus.type === 'error' ? 'text-[var(--color-accent-red)]' : sessionSelectionStatus.type === 'success' ? 'text-[var(--color-accent-green)]' : 'text-[var(--color-text-muted)]'}`}>
                {sessionSelectionStatus.message}
              </div>
            ) : null}
          </div>

          {showTokensCounter && usage && (
            <div className="mt-2 text-center text-[10px] text-[var(--color-text-muted)]">
              用量: {usage.used ?? '-'} / {usage.size ?? '-'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
