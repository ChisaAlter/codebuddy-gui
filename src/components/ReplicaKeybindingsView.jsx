import React, { useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'codebuddy-gui-keybindings';

const INITIAL_KEYBINDINGS = [
  {
    group: '全局',
    hint: '在任何位置都生效',
    items: [
      { label: '中断', action: 'app:interrupt', shortcut: 'Ctrl+C', source: '默认' },
      { label: '退出', action: 'app:exit', shortcut: 'Ctrl+D', source: '默认' },
      { label: '刷新屏幕', action: 'app:redraw', shortcut: 'Ctrl+L', source: '默认' },
      { label: '切换待办事项', action: 'app:toggleTodos', shortcut: 'Ctrl+T', source: '默认' },
      { label: '切换转录', action: 'app:toggleTranscript', shortcut: 'Ctrl+O', source: '默认' },
      { label: '搜索历史', action: 'history:search', shortcut: 'Ctrl+R', source: '默认' },
      { label: '命令面板', action: 'app:commandPalette', shortcut: 'Ctrl+Shift+P', source: '默认' },
      { label: '切换侧边栏', action: 'app:toggleSidebar', shortcut: 'Super+B', source: '默认' },
      { label: '切换终端', action: 'app:toggleTerminal', shortcut: 'Super+J', source: '默认' },
      { label: '新对话', action: 'app:newChat', shortcut: 'Super+N', source: '默认' },
      { label: '设置', action: 'app:settings', shortcut: 'Super+,', source: '默认' },
      { label: '聚焦输入框', action: 'app:focusInput', shortcut: 'Super+L', source: '默认' },
    ],
  },
  {
    group: '聊天输入',
    hint: '聊天输入框获得焦点时',
    items: [
      { label: '取消', action: 'chat:cancel', shortcut: 'Esc', source: '默认' },
      { label: '发送', action: 'chat:submit', shortcut: 'Enter', source: '默认' },
      { label: '终止代理', action: 'chat:killAgents', shortcut: 'Ctrl+X Ctrl+K', source: '默认' },
      { label: '切换模式', action: 'chat:cycleMode', shortcut: 'Shift+Tab', source: '自定义', defaultShortcut: 'Shift+Tab' },
      { label: '上一条历史', action: 'history:previous', shortcut: '↑', source: '默认' },
      { label: '下一条历史', action: 'history:next', shortcut: '↓', source: '默认' },
      { label: '撤销', action: 'chat:undo', shortcut: 'Ctrl+Shift+-', source: '默认' },
      { label: '外部编辑器', action: 'chat:externalEditor', shortcut: 'Ctrl+G', source: '默认' },
      { label: '暂存', action: 'chat:stash', shortcut: 'Ctrl+S', source: '默认' },
      { label: '粘贴图片', action: 'chat:imagePaste', shortcut: 'Alt+V', source: '默认' },
    ],
  },
  {
    group: '自动补全',
    hint: '自动补全菜单显示时',
    items: [
      { label: '接受补全', action: 'autocomplete:accept', shortcut: 'Tab', source: '默认' },
      { label: '关闭补全', action: 'autocomplete:dismiss', shortcut: 'Esc', source: '默认' },
      { label: '上一项', action: 'autocomplete:previous', shortcut: '↑', source: '默认' },
      { label: '下一项', action: 'autocomplete:next', shortcut: '↓', source: '默认' },
    ],
  },
  {
    group: '确认对话框',
    hint: '确认/权限对话框显示时',
    items: [
      { label: '确认', action: 'confirm:yes', shortcut: 'Enter', source: '默认' },
      { label: '取消', action: 'confirm:no', shortcut: 'Esc', source: '默认' },
      { label: '上一项', action: 'confirm:previous', shortcut: '↑', source: '默认' },
      { label: '下一项', action: 'confirm:next', shortcut: '↓', source: '默认' },
      { label: '切换选中', action: 'confirm:toggle', shortcut: 'Space', source: '默认' },
      { label: '切换说明', action: 'confirm:toggleExplanation', shortcut: 'Ctrl+E', source: '默认' },
      { label: '切换调试', action: 'permission:toggleDebug', shortcut: 'Ctrl+D', source: '默认' },
    ],
  },
  {
    group: '历史搜索',
    hint: '搜索命令历史时 (ctrl+r)',
    items: [
      { label: '下一条', action: 'historySearch:next', shortcut: 'Ctrl+R', source: '默认' },
      { label: '接受', action: 'historySearch:accept', shortcut: 'Tab', source: '默认' },
      { label: '取消', action: 'historySearch:cancel', shortcut: 'Ctrl+C', source: '默认' },
      { label: '执行', action: 'historySearch:execute', shortcut: 'Enter', source: '默认' },
    ],
  },
];

function cloneBindings(bindings) {
  return bindings.map((group) => ({
    ...group,
    items: group.items.map((item) => ({ ...item })),
  }));
}

function BindingRow({ item, onEdit, onUnbind, onReset }) {
  return (
    <div className="grid grid-cols-[1.6fr_1.2fr_0.7fr_0.5fr_auto] items-center gap-3 border-b border-[var(--color-border-muted)] px-4 py-3 text-sm last:border-b-0">
      <div className="min-w-0">
        <div className="text-[var(--color-text-primary)]">{item.label}</div>
        <div className="truncate text-xs text-[var(--color-text-secondary)]">{item.action}</div>
      </div>
      <div className="text-[var(--color-text-primary)]">{item.shortcut || '未绑定'}</div>
      <div className="text-xs text-[var(--color-text-secondary)]">{item.source}</div>
      <div className="flex gap-2 justify-end">
        {item.source === '自定义' ? <button className="btn-ghost" onClick={onReset}>重置</button> : null}
        <button className="btn-ghost" onClick={onEdit}>编辑</button>
        <button className="btn-ghost" onClick={onUnbind}>解绑</button>
      </div>
    </div>
  );
}

export default function ReplicaKeybindingsView() {
  const [query, setQuery] = useState('');
  const [bindings, setBindings] = useState(() => cloneBindings(INITIAL_KEYBINDINGS));

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        setBindings(parsed);
      }
    } catch (_) {}
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(bindings));
    } catch (_) {}
  }, [bindings]);

  const filteredGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return bindings;
    return bindings
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => `${item.label} ${item.action} ${item.shortcut || ''}`.toLowerCase().includes(q)),
      }))
      .filter((group) => group.items.length > 0);
  }, [query, bindings]);

  const mutateItem = (action, updater) => {
    setBindings((prev) => prev.map((group) => ({
      ...group,
      items: group.items.map((item) => (item.action === action ? updater(item) : item)),
    })));
  };

  const handleEdit = (action) => {
    const next = window.prompt('输入新的快捷键', 'Ctrl+Alt+K');
    if (!next) return;
    mutateItem(action, (item) => ({ ...item, shortcut: next, source: '自定义', defaultShortcut: item.defaultShortcut || item.shortcut }));
  };

  const handleUnbind = (action) => {
    mutateItem(action, (item) => ({ ...item, shortcut: '', source: '自定义', defaultShortcut: item.defaultShortcut || item.shortcut }));
  };

  const handleReset = (action) => {
    mutateItem(action, (item) => ({
      ...item,
      shortcut: item.defaultShortcut || item.shortcut || '',
      source: '默认',
    }));
  };

  const resetAll = () => {
    const next = cloneBindings(INITIAL_KEYBINDINGS);
    setBindings(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch (_) {}
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[var(--color-bg-primary)]">
      <div className="flex h-12 items-center border-b border-[var(--color-border-default)] px-6">
        <h2 className="text-base font-semibold text-[var(--color-text-primary)]">快捷键</h2>
      </div>
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <div className="flex items-center gap-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索快捷键... (如 submit, ctrl+enter)"
            className="input-field max-w-md"
          />
          <button className="btn-ghost" onClick={resetAll}>重置全部</button>
        </div>

        {filteredGroups.map((group) => (
          <section key={group.group} className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-card)] overflow-hidden">
            <div className="border-b border-[var(--color-border-default)] px-4 py-3">
              <div className="text-sm font-medium text-[var(--color-text-primary)]">{group.group}</div>
              <div className="mt-1 text-xs text-[var(--color-text-secondary)]">{group.hint}</div>
            </div>
            <div>
              {group.items.map((item) => (
                <BindingRow
                  key={item.action}
                  item={item}
                  onEdit={() => handleEdit(item.action)}
                  onUnbind={() => handleUnbind(item.action)}
                  onReset={() => handleReset(item.action)}
                />
              ))}
            </div>
          </section>
        ))}

        {!filteredGroups.length ? <div className="text-sm text-[var(--color-text-muted)]">未找到匹配的快捷键</div> : null}
      </div>
    </div>
  );
}
