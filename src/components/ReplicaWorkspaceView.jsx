import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Editor from '@monaco-editor/react';
import { useStore } from '../store';
import { joinPath, normalizePathParts } from '../lib/fs';

function EntryIcon({ type }) {
  if (type === 'directory') return <span>📁</span>;
  return <span>📄</span>;
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

function EditorPane() {
  const selectedFile = useStore((s) => s.selectedFile);
  const filePreview = useStore((s) => s.filePreview);
  const filePreviewLoading = useStore((s) => s.filePreviewLoading);
  const setFilePreview = useStore((s) => s.setFilePreview);

  const language = useMemo(() => detectLanguage(selectedFile || ''), [selectedFile]);

  return (
    <div className="flex min-h-0 flex-1 flex-col border-l border-[var(--color-border-default)] bg-[var(--color-bg-primary)]">
      <div className="flex h-12 items-center justify-between border-b border-[var(--color-border-default)] px-4">
        <div className="truncate text-sm text-[var(--color-text-primary)]">{selectedFile || '未选择文件'}</div>
        <div className="text-xs text-[var(--color-text-muted)]">{language}</div>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        {selectedFile ? (
          filePreviewLoading ? (
            <div className="p-4 text-sm text-[var(--color-text-muted)]">读取文件中...</div>
          ) : (
            <Editor
              theme="vs-dark"
              language={language}
              value={filePreview}
              onChange={(value) => setFilePreview(value || '')}
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
  const fileCwd = useStore((s) => s.fileCwd);
  const fileLoading = useStore((s) => s.fileLoading);
  const openDirectory = useStore((s) => s.openDirectory);
  const openFile = useStore((s) => s.openFile);
  const setSelectedFile = useStore((s) => s.setSelectedFile);

  const [newFileName, setNewFileName] = useState('');
  const [newFolderName, setNewFolderName] = useState('');
  const [showNewFileInput, setShowNewFileInput] = useState(false);
  const [showNewFolderInput, setShowNewFolderInput] = useState(false);
  const [contextMenu, setContextMenu] = useState(null);
  const [statusMessage, setStatusMessage] = useState('');
  const [workspaceError, setWorkspaceError] = useState(null);

  useEffect(() => {
    initializeWorkspace();
  }, [initializeWorkspace]);

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

  const handleRefresh = () => openDirectory(fileCwd || '.');

  const handleCreateFile = async () => {
    if (!newFileName.trim()) return;
    const path = fileCwd ? `${fileCwd}/${newFileName.trim()}` : newFileName.trim();
    try {
      await window.electronAPI.runGit({ args: ['add', '-N', path], cwd: fileCwd || '.' });
      setShowNewFileInput(false);
      setNewFileName('');
      openDirectory(fileCwd || '.');
    } catch (err) {
      setShowNewFileInput(false);
      setWorkspaceError('创建文件失败: ' + (err?.message || '未知错误'));
    }
  };

  const handleCreateFolder = async () => {
    const name = newFolderName.trim();
    if (!name) return;
    setShowNewFolderInput(false);
    setNewFolderName('');
    try {
      await window.electronAPI?.runGit({ args: ['init', '-q'], cwd: fileCwd || '.' }).catch(() => {});
      // Placeholder: backend mkdir API not yet available
      setStatusMessage(`目录 "${name}" 创建功能开发中`);
    } catch (err) {
      setWorkspaceError('创建目录失败: ' + (err?.message || '未知错误'));
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
                onClick={() => { openFile(contextMenu.entry.path); setContextMenu(null); }}>
                打开
              </button>
              {contextMenu.entry.type === 'file' && (
                <button className="w-full text-left px-3 py-1.5 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] transition-colors"
                  onClick={() => { setSelectedFile(contextMenu.entry); setContextMenu(null); }}>
                  预览
                </button>
              )}
              <div className="h-px bg-[var(--color-border-muted)] my-1" />
              <button className="w-full text-left px-3 py-1.5 text-xs text-[#f87171] hover:bg-[var(--color-bg-hover)] transition-colors"
                onClick={() => { setStatusMessage(`删除 "${contextMenu.entry?.name || contextMenu.entry?.path}" 功能开发中`); setContextMenu(null); }}>
                删除
              </button>
            </div>
          </>
        )}
      </div>
      <EditorPane />
    </div>
  );
}
