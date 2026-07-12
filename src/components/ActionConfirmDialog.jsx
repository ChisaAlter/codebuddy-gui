import React from 'react';

export default function ActionConfirmDialog({
  open,
  title,
  description,
  confirmLabel = '确认',
  busy = false,
  error = '',
  danger = true,
  onCancel,
  onConfirm,
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={(event) => {
        if (!busy && event.target === event.currentTarget) onCancel?.();
      }}
    >
      <div className="w-full max-w-sm rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] p-5 shadow-xl">
        <div className="text-sm font-semibold text-[var(--color-text-primary)]">{title}</div>
        {description ? <div className="mt-3 text-xs leading-5 text-[var(--color-text-secondary)]">{description}</div> : null}
        {error ? <div className="mt-3 text-xs text-[var(--color-accent-red)]">{error}</div> : null}
        <div className="mt-5 flex justify-end gap-2">
          <button className="btn-ghost px-3 py-1.5 text-xs" disabled={busy} onClick={onCancel}>取消</button>
          <button
            className={danger ? 'rounded-md px-3 py-1.5 text-xs font-medium text-white' : 'btn-primary px-3 py-1.5 text-xs'}
            style={danger ? { background: 'var(--color-accent-red)' } : undefined}
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? '处理中...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
