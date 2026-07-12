import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Editor, { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import { useStore } from '../store';
import { joinPath, normalizePathParts } from '../lib/fs';
import ActionConfirmDialog from './ActionConfirmDialog';

loader.config({ monaco });

function EntryIcon({ type }) {
  if (type === 'directory') return <span>📁</span>;
  return <span>📄</span>;
}

function normalizeComparablePath(value) {
  return String(value || '').replace(/\\/g, '/').replace(/\/+$/, '');
}

function pathContains(root, candidate) {
  const normalizedRoot = normalizeComparablePath(root);
  const normalizedCandidate = normalizeComparablePath(candidate);
  if (!normalizedRoot || !normalizedCandidate) return false;
  return normalizedCandidate === normalizedRoot || normalizedCandidate.startsWith(`${normalizedRoot}/`);
}

function SearchPanel() {
  const fileSearchQuery = useStore((s) => s.fileSearchQuery);
  const setFileSearchQuery = useStore((s) => s.setFileSearchQuery);
  const runFileSearch = useStore((s) => s.runFileSearch);
  const fileSearchResults = useStore((s) => s.fileSearchResults);
  const fileSearching = useStore((s) => s.fileSearching);
  const openFile = useStore((s) => s.openFile);

  // 文件名搜索（对照源 GET /api/v1/fs/search?query&limit=15）
  const fileNameQuery = useStore((s) => s.fileNameQuery);
  const setFileNameQuery = useStore((s) => s.setFileNameQuery);
  const runFileNameSearch = useStore((s) => s.runFileNameSearch);
  const fileNameResults = useStore((s) => s.fileNameResults);
  const fileNameSearching = useStore((s) => s.fileNameSearching);
  // 轻输入防抖：对照源 bundle 用 150ms setTimeout，键停后自动搜
  const debounceRef = React.useRef(null);
  const onNameChange = (val) => {
    setFileNameQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!String(val || '').trim()) return;
    debounceRef.current = setTimeout(() => {
      runFileNameSearch();
      debounceRef.current = null;
    }, 200);
  };
  React.useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  return (
    <div className="border-b border-[var(--color-border-default)] p-3">
      {/* 文件名快速搜索（补全/打开文件） */}
      <div className="mb-2 text-[11px] uppercase tracking-wide text-[var(--color-text-muted)]">搜索文件名</div>
      <div className="relative">
        <input
          value={fileNameQuery}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="输入文件名片段实时搜索..."
          className="input-field w-full"
          aria-label="搜索文件名"
        />
        {fileNameSearching && (
          <div className="absolute right-2 top-1/2 -translate-y-1/2">
            <div className="h-3 w-3 animate-spin rounded-full border-2 border-[var(--color-border-muted)] border-t-[var(--color-accent-brand)]" />
          </div>
        )}
      </div>
      {fileNameResults.length > 0 && (
        <div className="mt-2 max-h-44 overflow-y-auto rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-primary)]">
          {fileNameResults.slice(0, 15).map((item, idx) => {
            const p = item.path || item.file || item.name || '';
            const name = item.name || (p.split('/').pop() || p);
            return (
              <button
                key={`${p}-${idx}`}
                className="block w-full border-b border-[var(--color-border-muted)] px-3 py-1.5 text-left last:border-b-0 hover:bg-[var(--color-bg-hover)]"
                onClick={() => { openFile(p); setFileNameQuery(''); }}
                title={p}
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-xs">{item.type === 'directory' || p.endsWith('/') ? '📁' : '📄'}</span>
                  <span className="truncate text-xs text-[var(--color-text-primary)]">{name}</span>
                </div>
                <div className="truncate text-[11px] text-[var(--color-text-muted)]">{p}</div>
              </button>
            );
          })}
        </div>
      )}

      {/* 内容搜索（原 fsSearchContent） */}
      <div className="mt-3 mb-2 text-[11px] uppercase tracking-wide text-[var(--color-text-muted)]">搜索内容</div>
      <div className="flex gap-2">
        <input
          value={fileSearchQuery}
          onChange={(e) => setFileSearchQuery(e.target.value)}
          placeholder="搜索文件内容..."
          className="input-field"
        />
        <button className="btn-primary" onClick={() => runFileSearch()} disabled={!fileSearchQuery.trim() || fileSearching}>搜索</button>
      </div>
      {fileSearchResults.length > 0 && (
        <div className="mt-3 max-h-52 overflow-y-auto rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-primary)]">
          {fileSearchResults.slice(0, 20).map((item, idx) => (
            <button key={`${item.path}-${idx}`} className="block w-full border-b border-[var(--color-border-muted)] px-3 py-2 text-left last:border-b-0" onClick={() => openFile(item.path)}>
              <div className="truncate text-xs text-[var(--color-accent-blue)]">{item.path}</div>
              <div className="mt-1 text-[11px] text-[var(--color-text-secondary)]">{item.line || item.lineNumber || '-'}: {item.preview || item.text || item.content || ''}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Breadcrumbs() {
  const fileCwd = useStore((s) => s.fileCwd);
  const openDirectory = useStore((s) => s.openDirectory);
  const parts = normalizePathParts(fileCwd);

  return (
    <div className="flex items-center gap-2 overflow-x-auto px-3 py-2 text-xs text-[var(--color-text-secondary)]">
      <button className="btn-ghost" onClick={() => openDirectory('.')}>根目录</button>
      {parts.map((part, index) => {
        const path = parts.slice(0, index + 1).join('/');
        return (
          <React.Fragment key={path}>
            <span className="text-[var(--color-text-muted)]">/</span>
            <button className="btn-ghost" onClick={() => openDirectory(path)}>{part}</button>
          </React.Fragment>
        );
      })}
    </div>
  );
}

function FileTree({ onContextMenu }) {
  const fileEntries = useStore((s) => s.fileEntries);
  const fileLoading = useStore((s) => s.fileLoading);
  const openDirectory = useStore((s) => s.openDirectory);
  const fileCwd = useStore((s) => s.fileCwd);
  const openFile = useStore((s) => s.openFile);
  const selectedFile = useStore((s) => s.selectedFile);
  const setSelectedFile = useStore((s) => s.setSelectedFile);

  if (fileLoading) {
    return <div className="p-4 text-sm text-[var(--color-text-muted)]">加载文件中...</div>;
  }

  return (
    <div className="flex-1 overflow-y-auto p-2">
      <div className="space-y-1">
        {fileEntries.map((entry) => {
          const path = entry.path || joinPath(fileCwd, entry.name);
          const isDirectory = entry.type === 'directory' || entry.is_dir;
          const active = selectedFile === path;
          return (
            <button
              key={path}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition"
              style={{
                background: active ? 'rgba(0,120,212,0.12)' : 'transparent',
                color: active ? '#ffffff' : 'var(--color-text-secondary)',
              }}
              onClick={() => (isDirectory ? openDirectory(path) : openFile(path))}
              onContextMenu={(e) => onContextMenu && onContextMenu(e, entry)}
            >
              <EntryIcon type={isDirectory ? 'directory' : 'file'} />
              <span className="truncate">{entry.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function detectLanguage(path = '') {
  const ext = path.split('.').pop()?.toLowerCase();
  const map = {
    js: 'javascript',
    jsx: 'javascript',
    ts: 'typescript',
    tsx: 'typescript',
    json: 'json',
    md: 'markdown',
    py: 'python',
    css: 'css',
    html: 'html',
    yml: 'yaml',
    yaml: 'yaml',
    sh: 'shell',
    cjs: 'javascript',
    mjs: 'javascript',
  };
  return map[ext] || 'plaintext';
}

export function EditorPane() {
  const selectedFile = useStore((s) => s.selectedFile);
  const filePreview = useStore((s) => s.filePreview);
  const filePreviewLoading = useStore((s) => s.filePreviewLoading);
  const fileDirty = useStore((s) => s.fileDirty);
  const fileSaving = useStore((s) => s.fileSaving);
  const fileExternalChange = useStore((s) => s.fileExternalChange);
  const setFilePreview = useStore((s) => s.setFilePreview);
  const saveSelectedFile = useStore((s) => s.saveSelectedFile);
  const checkSelectedFileForExternalChanges = useStore((s) => s.checkSelectedFileForExternalChanges);
  const reloadExternalFileContent = useStore((s) => s.reloadExternalFileContent);
  const keepCurrentFileContent = useStore((s) => s.keepCurrentFileContent);
  const [saveStatus, setSaveStatus] = useState(null);

  const language = useMemo(() => detectLanguage(selectedFile || ''), [selectedFile]);

  useEffect(() => {
    setSaveStatus(null);
  }, [selectedFile]);

  useEffect(() => {
    if (!saveStatus || saveStatus.type === 'error') return undefined;
    const timer = setTimeout(() => setSaveStatus(null), 3000);
    return () => clearTimeout(timer);
  }, [saveStatus]);

  const handleSave = useCallback(async () => {
    const state = useStore.getState();
    const path = state.selectedFile;
    if (!path || !state.fileDirty || state.fileSaving) return;
    setSaveStatus(null);
    const saved = await saveSelectedFile();
    const current = useStore.getState();
    if (current.selectedFile !== path) return;
    if (!saved) {
      setSaveStatus({ type: 'error', message: '保存失败，未保存内容仍保留' });
    } else if (current.fileDirty) {
      setSaveStatus({ type: 'warning', message: '已保存此前内容，仍有新修改未保存' });
    } else {
      setSaveStatus({ type: 'success', message: '已保存' });
    }
  }, [saveSelectedFile]);

  const handleEditorChange = useCallback((value) => {
    setSaveStatus(null);
    setFilePreview(value || '');
  }, [setFilePreview]);

  const saveStatusColor = {
    error: 'var(--color-accent-red)',
    success: '#4ade80',
    warning: '#fbbf24',
  }[saveStatus?.type] || 'var(--color-text-muted)';

  return (
    <div className="flex min-h-0 flex-1 flex-col border-l border-[var(--color-border-default)] bg-[var(--color-bg-primary)]">
      <div className="flex h-12 items-center justify-between border-b border-[var(--color-border-default)] px-4">
        <div className="min-w-0">
          <div className="truncate text-sm text-[var(--color-text-primary)]">
            {selectedFile || '未选择文件'}{fileDirty ? ' •' : ''}
          </div>
          <div className="text-xs" style={{ color: saveStatusColor }}>{saveStatus?.message || language}</div>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={!selectedFile || !fileDirty || fileSaving}
          className="rounded px-2 py-1 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)] disabled:cursor-default disabled:opacity-40"
          title="保存文件 (Ctrl+S)"
        >
          {fileSaving ? '保存中...' : '保存'}
        </button>
      </div>
      {fileExternalChange && (
        <div
          className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-2 text-xs"
          style={{
            borderColor: 'rgba(245, 158, 11, 0.35)',
            background: 'rgba(245, 158, 11, 0.1)',
            color: '#fbbf24',
          }}
        >
          <span className="min-w-[220px] flex-1 break-words">
            {fileExternalChange.error
              ? `无法读取磁盘上的文件：${fileExternalChange.error}。当前编辑内容已保留。`
              : '磁盘上的文件已被其他程序修改。请选择重新载入，或保留当前编辑内容。'}
          </span>
          <div className="flex shrink-0 items-center gap-2">
            {fileExternalChange.error ? (
              <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => checkSelectedFileForExternalChanges()}>
                重新检查
              </button>
            ) : (
              <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={reloadExternalFileContent}>
                重新载入
              </button>
            )}
            <button type="button" className="btn-primary px-2 py-1 text-xs" onClick={keepCurrentFileContent}>
              保留当前内容
            </button>
          </div>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-hidden">
        {selectedFile ? (
          filePreviewLoading ? (
            <div className="p-4 text-sm text-[var(--color-text-muted)]">读取文件中...</div>
          ) : (
            <Editor
              theme="vs-dark"
              language={language}
              value={filePreview}
              onChange={handleEditorChange}
              onMount={(editor, monaco) => {
                editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, handleSave);
              }}
              options={{
                minimap: { enabled: false },
                fontSize: 13,
                fontFamily: "Menlo, Monaco, Consolas, 'Courier New', monospace",
                wordWrap: 'on',
                automaticLayout: true,
                smoothScrolling: true,
                padding: { top: 12, bottom: 12 },
                scrollBeyondLastLine: false,
              }}
            />
          )
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-[var(--color-text-muted)]">从左侧选择文件以预览</div>
        )}
      </div>
    </div>
  );
}

export default function ReplicaWorkspaceView() {
  const initializeWorkspace = useStore((s) => s.initializeWorkspace);
  const runtimePort = useStore((s) => s.projectsById[s.activeProjectId]?.runtimePort || null);
  const fileCwd = useStore((s) => s.fileCwd);
  const fileLoading = useStore((s) => s.fileLoading);
  const openDirectory = useStore((s) => s.openDirectory);
  const refreshFileEntries = useStore((s) => s.refreshFileEntries);
  const startWatcher = useStore((s) => s.startWatcher);
  const pollWatcher = useStore((s) => s.pollWatcher);
  const stopWatcher = useStore((s) => s.stopWatcher);
  const checkSelectedFileForExternalChanges = useStore((s) => s.checkSelectedFileForExternalChanges);
  const openFile = useStore((s) => s.openFile);
  const setSelectedFile = useStore((s) => s.setSelectedFile);
  const createFile = useStore((s) => s.fsWrite);
  const createFolder = useStore((s) => s.fsMkdir);
  const moveEntry = useStore((s) => s.fsMove);
  const removeEntry = useStore((s) => s.fsRemove);

  const [newFileName, setNewFileName] = useState('');
  const [newFolderName, setNewFolderName] = useState('');
  const [showNewFileInput, setShowNewFileInput] = useState(false);
  const [showNewFolderInput, setShowNewFolderInput] = useState(false);
  const [contextMenu, setContextMenu] = useState(null);
  const [renameEntry, setRenameEntry] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [renameBusy, setRenameBusy] = useState(false);
  const [renameError, setRenameError] = useState('');
  const [renameDirtyConfirmOpen, setRenameDirtyConfirmOpen] = useState(false);
  const [pendingDeleteEntry, setPendingDeleteEntry] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [workspaceError, setWorkspaceError] = useState(null);

  useEffect(() => {
    if (runtimePort) initializeWorkspace();
  }, [initializeWorkspace, runtimePort]);

  useEffect(() => {
    if (!runtimePort || !fileCwd) return undefined;
    let disposed = false;
    let polling = false;
    let fallbackTicks = 0;

    const pollWorkspace = async () => {
      if (disposed || polling) return;
      polling = true;
      try {
        const state = useStore.getState();
        if (state.watcherId) {
          const events = await pollWatcher();
          if (!disposed && events.length > 0) {
            await Promise.all([
              refreshFileEntries({ silent: true }),
              checkSelectedFileForExternalChanges(),
            ]);
          }
        } else {
          fallbackTicks += 1;
          if (fallbackTicks % 4 === 0) await startWatcher(fileCwd);
          if (!disposed && fallbackTicks % 3 === 0) {
            await Promise.all([
              refreshFileEntries({ silent: true }),
              checkSelectedFileForExternalChanges(),
            ]);
          }
        }
      } finally {
        polling = false;
      }
    };

    startWatcher(fileCwd).then(() => {
      if (!disposed) pollWorkspace();
    });
    const timer = setInterval(pollWorkspace, 1800);
    return () => {
      disposed = true;
      clearInterval(timer);
      stopWatcher();
    };
  }, [
    checkSelectedFileForExternalChanges,
    fileCwd,
    pollWatcher,
    refreshFileEntries,
    runtimePort,
    startWatcher,
    stopWatcher,
  ]);

  useEffect(() => {
    setContextMenu(null);
    setRenameEntry(null);
    setRenameError('');
    setRenameDirtyConfirmOpen(false);
    setPendingDeleteEntry(null);
    setDeleteError('');
    setRenameBusy(false);
    setDeleteBusy(false);
  }, [runtimePort]);

  useEffect(() => {
    if (!workspaceError) return;
    const timer = setTimeout(() => setWorkspaceError(null), 8000);
    return () => clearTimeout(timer);
  }, [workspaceError]);

  const handleNewFile = () => {
    setShowNewFolderInput(false);
    setShowNewFileInput(!showNewFileInput);
    setNewFileName('');
  };

  const handleNewFolder = () => {
    setShowNewFileInput(false);
    setShowNewFolderInput(!showNewFolderInput);
    setNewFolderName('');
  };

  const handleRefresh = () => refreshFileEntries();

  const validateEntryName = (value) => {
    const name = String(value || '').trim();
    if (!name) return '名称不能为空';
    if (name === '.' || name === '..' || /[\\/]/.test(name)) return '名称不能包含路径分隔符';
    return null;
  };

  const pathForEntry = (entry) => entry?.path || joinPath(fileCwd || '.', entry?.name || '');

  const handleCreateFile = async () => {
    const nameError = validateEntryName(newFileName);
    if (nameError) { setWorkspaceError(nameError); return; }
    const path = joinPath(fileCwd || '.', newFileName.trim());
    const created = await createFile(path, '');
    if (!created) { setWorkspaceError('创建文件失败'); return; }
    setShowNewFileInput(false);
    setNewFileName('');
    setStatusMessage(`已创建 ${newFileName.trim()}`);
    await openFile(path);
  };

  const handleCreateFolder = async () => {
    const name = newFolderName.trim();
    const nameError = validateEntryName(name);
    if (nameError) { setWorkspaceError(nameError); return; }
    const created = await createFolder(joinPath(fileCwd || '.', name));
    if (!created) { setWorkspaceError('创建目录失败'); return; }
    setShowNewFolderInput(false);
    setNewFolderName('');
    setStatusMessage(`已创建目录 ${name}`);
  };

  const startRename = (entry) => {
    setRenameError('');
    setRenameDirtyConfirmOpen(false);
    setRenameEntry(entry);
    setRenameValue(entry?.name || '');
    setContextMenu(null);
  };

  const performRename = async (discardDirty = false) => {
    const nameError = validateEntryName(renameValue);
    if (nameError) { setRenameError(nameError); return; }
    const source = pathForEntry(renameEntry);
    const destination = joinPath(fileCwd || '.', renameValue.trim());
    if (source === destination) { setRenameEntry(null); return; }

    const state = useStore.getState();
    const selectedFile = state.selectedFile;
    const affectsSelectedFile = pathContains(source, selectedFile);
    if (affectsSelectedFile && state.fileDirty && !discardDirty) {
      setRenameDirtyConfirmOpen(true);
      setRenameError('');
      return;
    }

    setRenameBusy(true);
    setRenameError('');
    try {
      const moved = await moveEntry(source, destination);
      if (!moved) throw new Error('重命名失败');
      if (affectsSelectedFile) {
        const normalizedSource = normalizeComparablePath(source);
        const normalizedSelected = normalizeComparablePath(selectedFile);
        const selectedSuffix = normalizedSelected.slice(normalizedSource.length);
        const nextSelectedFile = `${normalizeComparablePath(destination)}${selectedSuffix}`;
        state.setSelectedFile(null);
        const reopened = await openFile(nextSelectedFile);
        if (!reopened) setWorkspaceError('重命名成功，但无法重新打开原文件');
      }
      setStatusMessage(`已重命名为 ${renameValue.trim()}`);
      setRenameEntry(null);
      setRenameDirtyConfirmOpen(false);
    } catch (error) {
      setRenameError(error.message || '重命名失败');
    } finally {
      setRenameBusy(false);
    }
  };

  const submitRename = () => performRename(false);

  const requestDelete = (entry) => {
    const path = pathForEntry(entry);
    const state = useStore.getState();
    const affectsSelectedFile = pathContains(path, state.selectedFile);
    setContextMenu(null);
    setPendingDeleteEntry({
      entry,
      path,
      affectsSelectedFile,
      discardsDirtyFile: affectsSelectedFile && state.fileDirty,
    });
    setDeleteError('');
  };

  const closeDeleteDialog = () => {
    if (deleteBusy) return;
    setPendingDeleteEntry(null);
    setDeleteError('');
  };

  const confirmDelete = async () => {
    if (!pendingDeleteEntry?.path || deleteBusy) return;
    setDeleteBusy(true);
    setDeleteError('');
    try {
      const removed = await removeEntry(pendingDeleteEntry.path);
      if (!removed) throw new Error('删除失败');
      if (pendingDeleteEntry.affectsSelectedFile) setSelectedFile(null);
      setStatusMessage(`已删除 ${pendingDeleteEntry.entry?.name || pendingDeleteEntry.path}`);
      setPendingDeleteEntry(null);
    } catch (error) {
      setDeleteError(error.message || '删除失败');
    } finally {
      setDeleteBusy(false);
    }
  };

  const handleContextMenu = (e, entry) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, entry });
  };

  useEffect(() => {
    const handler = () => setContextMenu(null);
    if (contextMenu) {
      window.addEventListener('click', handler);
      return () => window.removeEventListener('click', handler);
    }
  }, [contextMenu]);

  return (
    <div className="flex min-h-0 flex-1 bg-[var(--color-bg-primary)]">
      <div className="flex min-h-0 w-[360px] shrink-0 flex-col border-r border-[var(--color-border-default)] bg-[var(--color-bg-secondary)]">
        <SearchPanel />
        <div className="flex items-center border-b border-[var(--color-border-default)]">
          <Breadcrumbs />
          <div className="flex items-center gap-0.5 ml-auto pr-2 shrink-0">
            <button
              onClick={handleNewFile}
              className="flex h-6 w-6 items-center justify-center rounded text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)] transition-colors"
              title="新建文件"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M3 2h7l3 3v9a1 1 0 01-1 1H3a1 1 0 01-1-1V3a1 1 0 011-1z" />
                <path d="M10 2v3h3M8 7v4M6 9h4" />
              </svg>
            </button>
            <button
              onClick={handleNewFolder}
              className="flex h-6 w-6 items-center justify-center rounded text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)] transition-colors"
              title="新建文件夹"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M1 4a1 1 0 011-1h4l1.5 2H14a1 1 0 011 1v7a1 1 0 01-1 1H3a1 1 0 01-1-1V4z" />
                <path d="M8 9v4M6 11h4" />
              </svg>
            </button>
            <button
              onClick={handleRefresh}
              disabled={fileLoading}
              className={`flex h-6 w-6 items-center justify-center rounded text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)] transition-colors ${fileLoading ? 'animate-spin' : ''}`}
              title="刷新"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M1 8a7 7 0 0113.29-4M15 8a7 7 0 01-13.29 4" />
                <path d="M13 1v4h-4M3 15v-4h4" />
              </svg>
            </button>
          </div>
          {statusMessage && (
            <div className="px-3 pb-2">
              <div className="rounded-md bg-[rgba(0,120,212,0.1)] border border-[rgba(0,120,212,0.2)] px-3 py-1.5 text-xs text-[#0078d4]">{statusMessage}</div>
            </div>
          )}
        </div>
        {showNewFileInput && (
          <div className="flex items-center gap-1 px-2 py-1.5 border-b border-[var(--color-border-default)]">
            <input
              type="text"
              value={newFileName}
              onChange={e => setNewFileName(e.target.value)}
              placeholder="文件名..."
              onKeyDown={e => { if (e.key === 'Enter') handleCreateFile(); if (e.key === 'Escape') setShowNewFileInput(false); }}
              className="flex-1 rounded border border-[var(--color-border-default)] bg-[var(--color-bg-tertiary)] px-2 py-1 text-xs text-[var(--color-text-primary)] outline-none focus:border-[#60a5fa]"
              autoFocus
            />
            <button onClick={handleCreateFile} className="text-xs text-[#4ade80] hover:underline">确定</button>
            <button onClick={() => setShowNewFileInput(false)} className="text-xs text-[var(--color-text-muted)] hover:underline">取消</button>
          </div>
        )}
        {showNewFolderInput && (
          <div className="flex items-center gap-1 px-2 py-1.5 border-b border-[var(--color-border-default)]">
            <input
              type="text"
              value={newFolderName}
              onChange={e => setNewFolderName(e.target.value)}
              placeholder="文件夹名..."
              onKeyDown={e => { if (e.key === 'Enter') handleCreateFolder(); if (e.key === 'Escape') setShowNewFolderInput(false); }}
              className="flex-1 rounded border border-[var(--color-border-default)] bg-[var(--color-bg-tertiary)] px-2 py-1 text-xs text-[var(--color-text-primary)] outline-none focus:border-[#60a5fa]"
              autoFocus
            />
            <button onClick={handleCreateFolder} className="text-xs text-[#4ade80] hover:underline">确定</button>
            <button onClick={() => setShowNewFolderInput(false)} className="text-xs text-[var(--color-text-muted)] hover:underline">取消</button>
          </div>
        )}
        {workspaceError && (
          <div className="mx-2 mb-2 p-2 rounded flex items-center justify-between text-xs"
               style={{ background: 'var(--color-error-bg, rgba(248,113,113,0.1))', border: '1px solid var(--color-accent-red)', color: 'var(--color-accent-red)' }}>
            <span>{workspaceError}</span>
            <button className="underline" onClick={() => setWorkspaceError(null)}>关闭</button>
          </div>
        )}
        <FileTree onContextMenu={handleContextMenu} />
        {contextMenu && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setContextMenu(null)} />
            <div
              className="fixed z-50 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] shadow-xl py-1 min-w-[160px]"
              style={{ left: contextMenu.x, top: contextMenu.y }}
            >
              <button className="w-full text-left px-3 py-1.5 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] transition-colors"
                onClick={() => {
                  const entry = contextMenu.entry;
                  const path = pathForEntry(entry);
                  if (entry.type === 'directory' || entry.is_dir) openDirectory(path);
                  else openFile(path);
                  setContextMenu(null);
                }}>
                打开
              </button>
              <button className="w-full text-left px-3 py-1.5 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] transition-colors"
                onClick={() => startRename(contextMenu.entry)}>
                重命名
              </button>
              <div className="h-px bg-[var(--color-border-muted)] my-1" />
              <button className="w-full text-left px-3 py-1.5 text-xs text-[#f87171] hover:bg-[var(--color-bg-hover)] transition-colors"
                onClick={() => requestDelete(contextMenu.entry)}>
                删除
              </button>
            </div>
          </>
        )}
      </div>
      {renameEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45" role="dialog" aria-modal="true" aria-label="重命名文件或目录">
          <div className="w-80 rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] p-4 shadow-xl">
            <div className="mb-3 text-sm font-medium text-[var(--color-text-primary)]">重命名</div>
            <input
              autoFocus
              value={renameValue}
              disabled={renameBusy}
              onChange={(event) => {
                setRenameValue(event.target.value);
                setRenameError('');
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') submitRename();
                if (event.key === 'Escape' && !renameBusy) setRenameEntry(null);
              }}
              className="w-full rounded border border-[var(--color-border-default)] bg-[var(--color-bg-tertiary)] px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent-blue)]"
            />
            {renameError ? <div className="mt-2 text-xs text-[var(--color-accent-red)]">{renameError}</div> : null}
            <div className="mt-4 flex justify-end gap-2">
              <button className="btn-ghost px-3 py-1.5 text-xs" disabled={renameBusy} onClick={() => setRenameEntry(null)}>取消</button>
              <button className="btn-primary px-3 py-1.5 text-xs" disabled={renameBusy || !renameValue.trim()} onClick={submitRename}>{renameBusy ? '保存中...' : '保存'}</button>
            </div>
          </div>
        </div>
      )}
      <EditorPane />
      <ActionConfirmDialog
        open={renameDirtyConfirmOpen}
        title="重命名并丢失未保存修改？"
        description={renameEntry ? `“${pathForEntry(renameEntry)}”包含当前正在编辑且尚未保存的文件。继续重命名会重新读取新路径，未保存内容将丢失。` : null}
        confirmLabel="继续重命名"
        busy={renameBusy}
        error={renameError}
        onCancel={() => { if (!renameBusy) setRenameDirtyConfirmOpen(false); }}
        onConfirm={() => performRename(true)}
      />
      <ActionConfirmDialog
        open={Boolean(pendingDeleteEntry)}
        title={pendingDeleteEntry?.entry?.type === 'directory' || pendingDeleteEntry?.entry?.is_dir ? '删除目录？' : '删除文件？'}
        description={pendingDeleteEntry ? (
          <><div className="font-medium text-[var(--color-text-primary)]">{pendingDeleteEntry.entry?.name || pendingDeleteEntry.path}</div><div className="mt-1 break-words text-[var(--color-text-muted)]">{pendingDeleteEntry.path}</div>{pendingDeleteEntry.discardsDirtyFile ? <div className="mt-2 text-[var(--color-accent-red)]">其中包含当前未保存的编辑内容，删除后这些内容也会丢失。</div> : null}<div className="mt-2">此操作无法撤销。</div></>
        ) : null}
        confirmLabel={pendingDeleteEntry?.entry?.type === 'directory' || pendingDeleteEntry?.entry?.is_dir ? '删除目录' : '删除文件'}
        busy={deleteBusy}
        error={deleteError}
        onCancel={closeDeleteDialog}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
