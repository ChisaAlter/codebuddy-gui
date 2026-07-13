import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useStore } from '../store';
import { copyTextToClipboard } from '../lib/clipboard';

function Toggle({ value, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      className={`toggle-switch ${value ? 'toggle-switch-on' : 'toggle-switch-off'}`}
      onClick={() => onChange(!value)}
    >
      <div className={`toggle-knob ${value ? 'toggle-knob-on' : ''}`} />
    </button>
  );
}

function SpinButton({ value, onChange, min = 1, max = 999 }) {
  return (
    <div className="flex items-center gap-0.5">
      <button
        className="flex h-6 w-6 items-center justify-center rounded-l-md border border-[var(--color-border-default)] bg-[var(--color-bg-tertiary)] text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]"
        onClick={() => onChange(Math.max(min, value - 1))}
      >−</button>
      <input
        type="number"
        className="h-6 w-12 border-y border-[var(--color-border-default)] bg-[var(--color-bg-primary)] text-center text-xs text-[var(--color-text-primary)] outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        value={value}
        min={min}
        max={max}
        onChange={(e) => {
          const v = parseInt(e.target.value, 10);
          if (!isNaN(v)) onChange(Math.min(max, Math.max(min, v)));
        }}
      />
      <button
        className="flex h-6 w-6 items-center justify-center rounded-r-md border border-[var(--color-border-default)] bg-[var(--color-bg-tertiary)] text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]"
        onClick={() => onChange(Math.min(max, value + 1))}
      >+</button>
    </div>
  );
}

function TextInput({ value, onChange, placeholder = '未设置', width = 'w-56', scopeKey, inputType = 'text' }) {
  const normalized = String(value ?? '');
  const [draft, setDraft] = useState(normalized);
  const [saving, setSaving] = useState(false);
  const mountedRef = useRef(true);
  const saveInFlightRef = useRef(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      saveInFlightRef.current = null;
    };
  }, []);

  useEffect(() => {
    saveInFlightRef.current = null;
    setSaving(false);
    setDraft(normalized);
  }, [scopeKey]);

  useEffect(() => {
    if (!saving) setDraft(normalized);
  }, [normalized, saving]);

  const commit = async () => {
    if (saveInFlightRef.current || draft === normalized) return;
    const operation = {};
    saveInFlightRef.current = operation;
    setSaving(true);
    let saved = false;
    try {
      saved = await onChange(draft);
    } catch (_) {
      saved = false;
    } finally {
      if (mountedRef.current && saveInFlightRef.current === operation) {
        saveInFlightRef.current = null;
        setSaving(false);
        if (saved === false) setDraft(normalized);
      }
    }
  };
  return (
    <input
      type={inputType}
      autoComplete={inputType === 'password' ? 'off' : undefined}
      spellCheck={inputType === 'password' ? false : undefined}
      className={`rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-tertiary)] px-3 py-1.5 text-xs text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent-blue)] ${width}`}
      value={draft}
      placeholder={placeholder}
      disabled={saving}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
      }}
    />
  );
}

function Select({ value, options, onChange, disabled = false }) {
  return (
    <select
      className="rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-tertiary)] px-3 py-1.5 text-xs text-[var(--color-text-primary)] disabled:cursor-not-allowed disabled:opacity-50"
      value={value || ''}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  );
}

function SettingRow({ label, desc, control }) {
  return (
    <div className="settings-row">
      <div className="flex-1 min-w-0">
        <div className="settings-label">{label}</div>
        {desc && <div className="settings-desc">{desc}</div>}
      </div>
      <div className="settings-control">{control}</div>
    </div>
  );
}

function JsonObjectEditor({ value, onSave, scopeKey }) {
  const serialized = JSON.stringify(value || {}, null, 2);
  const [draft, setDraft] = useState(serialized);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const mountedRef = useRef(true);
  const saveInFlightRef = useRef(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      saveInFlightRef.current = null;
    };
  }, []);

  useEffect(() => {
    saveInFlightRef.current = null;
    setSaving(false);
    setMessage('');
    setDraft(serialized);
  }, [scopeKey]);

  useEffect(() => {
    setDraft(serialized);
  }, [serialized]);

  const save = async () => {
    if (saveInFlightRef.current) return;
    let parsed;
    try {
      parsed = JSON.parse(draft || '{}');
      if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw new Error('请输入 JSON 对象');
    } catch (error) {
      setMessage(error.message || 'JSON 格式无效');
      return;
    }
    const operation = {};
    saveInFlightRef.current = operation;
    setSaving(true);
    setMessage('');
    let saved = false;
    try {
      saved = await onSave(parsed);
    } catch (_) {
      saved = false;
    } finally {
      if (mountedRef.current && saveInFlightRef.current === operation) {
        saveInFlightRef.current = null;
        setSaving(false);
        setMessage(saved === false ? '保存失败，已恢复原值' : '已保存');
      }
    }
  };

  return (
    <div className="w-72">
      <textarea
        rows={5}
        value={draft}
        onChange={(event) => { setDraft(event.target.value); setMessage(''); }}
        className="w-full resize-y rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-tertiary)] px-3 py-2 font-mono text-xs text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent-blue)]"
        aria-label="环境变量 JSON"
      />
      <div className="mt-2 flex items-center justify-end gap-2">
        {message ? <span className={`mr-auto text-[11px] ${message === '已保存' ? 'text-[var(--color-accent-green)]' : 'text-[var(--color-accent-red)]'}`}>{message}</span> : null}
        <button className="btn-primary px-3 py-1 text-xs" disabled={saving || draft === serialized} onClick={save}>
          {saving ? '保存中...' : '保存'}
        </button>
      </div>
    </div>
  );
}

function JsonArrayEditor({ value, onSave, ariaLabel, scopeKey }) {
  const serialized = JSON.stringify(Array.isArray(value) ? value : [], null, 2);
  const [draft, setDraft] = useState(serialized);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const mountedRef = useRef(true);
  const saveInFlightRef = useRef(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      saveInFlightRef.current = null;
    };
  }, []);

  useEffect(() => {
    saveInFlightRef.current = null;
    setSaving(false);
    setMessage('');
    setDraft(serialized);
  }, [scopeKey]);

  useEffect(() => {
    setDraft(serialized);
  }, [serialized]);

  const save = async () => {
    if (saveInFlightRef.current) return;
    let parsed;
    try {
      parsed = JSON.parse(draft || '[]');
      if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== 'string')) {
        throw new Error('请输入字符串数组');
      }
    } catch (parseError) {
      setMessage(parseError.message || 'JSON 格式无效');
      return;
    }
    const operation = {};
    saveInFlightRef.current = operation;
    setSaving(true);
    setMessage('');
    let saved = false;
    try {
      saved = await onSave(parsed);
    } catch (_) {
      saved = false;
    } finally {
      if (mountedRef.current && saveInFlightRef.current === operation) {
        saveInFlightRef.current = null;
        setSaving(false);
        setMessage(saved === false ? '保存失败，已恢复原值' : '已保存');
      }
    }
  };

  return (
    <div className="w-72">
      <textarea
        rows={6}
        value={draft}
        onChange={(event) => { setDraft(event.target.value); setMessage(''); }}
        className="w-full resize-y rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-tertiary)] px-3 py-2 font-mono text-xs text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent-blue)]"
        aria-label={ariaLabel}
      />
      <div className="mt-2 flex items-center justify-end gap-2">
        {message ? <span className={`mr-auto text-[11px] ${message === '已保存' ? 'text-[var(--color-accent-green)]' : 'text-[var(--color-accent-red)]'}`}>{message}</span> : null}
        <button className="btn-primary px-3 py-1 text-xs" disabled={saving || draft === serialized} onClick={save}>
          {saving ? '保存中...' : '保存'}
        </button>
      </div>
    </div>
  );
}

export default function ReplicaSettingsView() {
  const {
    info, connectionState, currentModel, models, modes, currentMode,
    settings, guiSettings, infoLoaded, settingsLoaded, sessionId, setModel, setMode, updateSetting: persistSetting, updateGuiSetting: persistGuiSetting, refreshInfo, refreshSettings,
  } = useStore(useShallow((state) => ({
    info: state.info,
    connectionState: state.connectionState,
    currentModel: state.currentModel,
    models: state.models,
    modes: state.modes,
    currentMode: state.currentMode,
    settings: state.settings,
    guiSettings: state.guiSettings,
    infoLoaded: state.infoLoaded,
    settingsLoaded: state.settingsLoaded,
    sessionId: state.sessionId,
    setModel: state.setModel,
    setMode: state.setMode,
    updateSetting: state.updateSetting,
    updateGuiSetting: state.updateGuiSetting,
    refreshInfo: state.refreshInfo,
    refreshSettings: state.refreshSettings,
  })));
  const [loadError, setLoadError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [appInfo, setAppInfo] = useState(null);
  const [appInfoError, setAppInfoError] = useState('');
  const [systemAction, setSystemAction] = useState(null);
  const [openingUserData, setOpeningUserData] = useState(false);
  const [exportingDiagnostics, setExportingDiagnostics] = useState(false);
  const [checkingForUpdates, setCheckingForUpdates] = useState(false);
  const [openingUpdateDownload, setOpeningUpdateDownload] = useState(false);
  const [updateStatus, setUpdateStatus] = useState(null);
  const [saveError, setSaveError] = useState('');
  const [selectionStatus, setSelectionStatus] = useState(null);
  const activeProjectId = useStore((state) => state.activeProjectId);
  const activeThreadId = useStore((state) => state.activeThreadId);
  const reloadRequestIdRef = useRef(0);
  const saveFeedbackVersionRef = useRef(0);
  const mountedRef = useRef(true);

  const updateSetting = useCallback(async (key, value) => {
    const projectId = activeProjectId;
    const feedbackVersion = ++saveFeedbackVersionRef.current;
    setSaveError('');
    const saved = await persistSetting(key, value);
    if (saved === false && mountedRef.current && projectId === useStore.getState().activeProjectId && feedbackVersion === saveFeedbackVersionRef.current) {
      setSaveError(useStore.getState().error || `设置“${key}”保存失败，已恢复原值`);
    }
    return saved;
  }, [activeProjectId, persistSetting]);

  const updateGuiSetting = useCallback(async (key, value) => {
    const feedbackVersion = ++saveFeedbackVersionRef.current;
    setSaveError('');
    const saved = await persistGuiSetting(key, value);
    if (saved === false && mountedRef.current && feedbackVersion === saveFeedbackVersionRef.current) {
      setSaveError(useStore.getState().error || `GUI 设置“${key}”保存失败`);
    }
    return saved;
  }, [persistGuiSetting]);

  const reload = useCallback(async () => {
    const projectId = activeProjectId;
    const requestId = ++reloadRequestIdRef.current;
    setRefreshing(true);
    setLoadError('');
    try {
      const [infoResult, settingsResult] = await Promise.allSettled([refreshInfo(), refreshSettings()]);
      if (!mountedRef.current || requestId !== reloadRequestIdRef.current || projectId !== useStore.getState().activeProjectId) return false;
      const current = useStore.getState();
      const failures = [];
      if (infoResult.status === 'rejected') failures.push(`系统信息：${infoResult.reason?.message || '加载失败'}`);
      else if (infoResult.value === false && !current.infoLoaded) failures.push('系统信息：请求未完成');
      if (settingsResult.status === 'rejected') failures.push(`设置：${settingsResult.reason?.message || '加载失败'}`);
      else if (settingsResult.value === false && !current.settingsLoaded) failures.push('设置：请求未完成');
      if (failures.length) {
        setLoadError(failures.join('；'));
        return false;
      }
      setLoadError('');
      return true;
    } finally {
      if (mountedRef.current && requestId === reloadRequestIdRef.current && projectId === useStore.getState().activeProjectId) {
        setRefreshing(false);
      }
    }
  }, [activeProjectId, refreshInfo, refreshSettings]);

  const isLoading = !loadError && (!infoLoaded || !settingsLoaded);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      reloadRequestIdRef.current += 1;
      saveFeedbackVersionRef.current += 1;
    };
  }, []);

  useEffect(() => {
    reloadRequestIdRef.current += 1;
    saveFeedbackVersionRef.current += 1;
    setLoadError('');
    setSaveError('');
    setSelectionStatus(null);
    reload();
  }, [activeProjectId, reload]);

  useEffect(() => {
    setSelectionStatus(null);
  }, [activeThreadId]);

  useEffect(() => {
    if (selectionStatus?.type !== 'success') return undefined;
    const timer = setTimeout(() => setSelectionStatus(null), 3000);
    return () => clearTimeout(timer);
  }, [selectionStatus]);

  useEffect(() => {
    let active = true;
    setAppInfoError('');
    const request = window.electronAPI?.getAppInfo?.();
    if (!request) {
      setAppInfoError('应用信息接口不可用');
      return () => { active = false; };
    }
    request
      .then((value) => {
        if (!active) return;
        setAppInfo(value);
        setAppInfoError('');
      })
      .catch((error) => {
        if (active) setAppInfoError(error?.message || '加载应用信息失败');
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (systemAction?.type !== 'success') return undefined;
    const timer = setTimeout(() => setSystemAction(null), 3000);
    return () => clearTimeout(timer);
  }, [systemAction]);

  const copySystemPath = async (value, label) => {
    if (!value) return;
    setSystemAction(null);
    try {
      await copyTextToClipboard(value);
      if (mountedRef.current) setSystemAction({ type: 'success', message: `已复制${label}` });
    } catch (error) {
      if (mountedRef.current) setSystemAction({ type: 'error', message: error?.message || `复制${label}失败` });
    }
  };

  const openUserDataDirectory = async () => {
    if (openingUserData) return;
    setOpeningUserData(true);
    setSystemAction(null);
    try {
      if (!window.electronAPI?.openUserData) throw new Error('打开目录接口不可用');
      await window.electronAPI.openUserData();
      if (mountedRef.current) setSystemAction({ type: 'success', message: '已打开用户数据目录' });
    } catch (error) {
      if (mountedRef.current) setSystemAction({ type: 'error', message: error?.message || '打开用户数据目录失败' });
    } finally {
      if (mountedRef.current) setOpeningUserData(false);
    }
  };

  const exportDiagnostics = async () => {
    if (exportingDiagnostics) return;
    setExportingDiagnostics(true);
    setSystemAction(null);
    try {
      if (!window.electronAPI?.exportDiagnostics) throw new Error('诊断报告导出接口不可用');
      const result = await window.electronAPI.exportDiagnostics();
      if (!mountedRef.current || result?.canceled) return;
      setSystemAction({ type: 'success', message: `诊断报告已保存：${result.path}` });
    } catch (error) {
      if (mountedRef.current) setSystemAction({ type: 'error', message: error?.message || '导出诊断报告失败' });
    } finally {
      if (mountedRef.current) setExportingDiagnostics(false);
    }
  };

  const checkForGuiUpdates = async () => {
    if (checkingForUpdates) return;
    setCheckingForUpdates(true);
    setUpdateStatus({ type: 'checking', message: '正在检查 GitHub Releases...' });
    try {
      if (!window.electronAPI?.checkForUpdates) throw new Error('更新检查接口不可用');
      const result = await window.electronAPI.checkForUpdates();
      if (!mountedRef.current) return;
      if (result?.status === 'error') throw new Error(result.error || '更新检查失败');
      if (result?.updateAvailable) {
        setUpdateStatus({
          type: 'update',
          message: result.downloadUrl
            ? `发现新版本 v${result.latestVersion}，当前为 v${result.currentVersion}。`
            : `发现新版本 v${result.latestVersion}，但未找到对应的 Windows 安装包，请打开发布页。`,
          latestVersion: result.latestVersion,
          releaseUrl: result.releaseUrl,
          downloadUrl: result.downloadUrl,
        });
      } else if (result?.latestVersion) {
        setUpdateStatus({
          type: 'current',
          message: `已是最新版本 v${result.currentVersion}。`,
          releaseUrl: result.releaseUrl,
        });
      } else {
        setUpdateStatus({
          type: 'no-release',
          message: `GitHub 暂无正式发布，当前版本 v${result?.currentVersion || appInfo?.version || '-'}。`,
          releaseUrl: result?.releaseUrl,
        });
      }
    } catch (error) {
      if (mountedRef.current) setUpdateStatus({ type: 'error', message: error?.message || '更新检查失败' });
    } finally {
      if (mountedRef.current) setCheckingForUpdates(false);
    }
  };

  const openGuiReleasePage = async () => {
    try {
      if (!window.electronAPI?.openReleasePage) throw new Error('发布页打开接口不可用');
      await window.electronAPI.openReleasePage(updateStatus?.releaseUrl);
    } catch (error) {
      if (mountedRef.current) setUpdateStatus((current) => ({ ...(current || {}), type: current?.type || 'error', message: error?.message || '打开发布页失败' }));
    }
  };

  const openGuiUpdateDownload = async () => {
    if (openingUpdateDownload) return;
    setOpeningUpdateDownload(true);
    try {
      if (!updateStatus?.downloadUrl) throw new Error('当前发布未提供 Windows 安装包');
      if (!window.electronAPI?.openUpdateDownload) throw new Error('安装包下载接口不可用');
      await window.electronAPI.openUpdateDownload(updateStatus.downloadUrl);
      if (mountedRef.current) {
        setUpdateStatus((current) => ({
          ...(current || {}),
          message: `已在默认浏览器中开始下载 v${current?.latestVersion || ''} 安装包。`,
        }));
      }
    } catch (error) {
      if (mountedRef.current) {
        setUpdateStatus((current) => ({
          ...(current || {}),
          message: error?.message || '下载安装包失败，请打开发布页重试',
        }));
      }
    } finally {
      if (mountedRef.current) setOpeningUpdateDownload(false);
    }
  };

  const modelOptions = (models || []).map((m) => ({
    value: m.id || m.modelId,
    label: m.name || m.id || m.modelId,
  }));
  const currentModelName = useStore((s) => s.models.find(m => m.id === s.currentModel || m.modelId === s.currentModel)?.name || s.currentModel || '');
  const modeOptions = (modes || []).map((m) => ({
    value: m.id || m.modeId,
    label: m.name || m.id || m.modeId,
  }));

  const changeSessionSetting = async (kind, value) => {
    if (selectionStatus?.type === 'busy') return;
    const threadId = activeThreadId;
    const label = kind === 'model' ? '模型' : '模式';
    setSelectionStatus({ type: 'busy', message: `正在切换${label}...` });
    const changed = kind === 'model' ? await setModel(value) : await setMode(value);
    if (!mountedRef.current || threadId !== useStore.getState().activeThreadId) return;
    if (changed) {
      setSelectionStatus({ type: 'success', message: `${label}已切换` });
    } else {
      setSelectionStatus({
        type: 'error',
        message: useStore.getState().error || `${label}切换失败`,
      });
    }
  };

  const selectionBusy = selectionStatus?.type === 'busy';
  const selectionDisabled = selectionBusy || !sessionId || connectionState !== 'connected';

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-[var(--color-bg-primary)]">
      <div className="mx-auto w-full max-w-2xl px-8 py-8">
        <h1 className="mb-8 text-lg font-semibold text-[var(--color-text-primary)]">设置</h1>

        {loadError ? (
          <div className="mb-6 flex items-center justify-between rounded-md border border-[rgba(239,68,68,0.35)] bg-[rgba(239,68,68,0.08)] px-4 py-3 text-sm text-[var(--color-accent-red)]">
            <span>{loadError}</span>
            <button className="btn-ghost px-3 py-1 text-xs" disabled={refreshing} onClick={reload}>{refreshing ? '重试中...' : '重试'}</button>
          </div>
        ) : null}

        {saveError ? (
          <div className="mb-6 flex items-center justify-between rounded-md border border-[rgba(239,68,68,0.35)] bg-[rgba(239,68,68,0.08)] px-4 py-3 text-sm text-[var(--color-accent-red)]">
            <span>{saveError}</span>
            <button className="btn-ghost px-3 py-1 text-xs" onClick={() => setSaveError('')}>关闭</button>
          </div>
        ) : null}
        {isLoading ? (
          <>
            {[1, 2, 3].map((n) => (
              <div key={n} className="card mb-6">
                <div className="skeleton animate-pulse h-5 w-1/3 rounded mb-4" style={{background:'var(--color-bg-hover)'}} />
                <div className="skeleton animate-pulse h-4 w-full rounded mb-2" style={{background:'var(--color-bg-hover)'}} />
                <div className="skeleton animate-pulse h-4 w-5/6 rounded mb-2" style={{background:'var(--color-bg-hover)'}} />
                <div className="skeleton animate-pulse h-4 w-4/6 rounded mb-2" style={{background:'var(--color-bg-hover)'}} />
                <div className="skeleton animate-pulse h-4 w-3/6 rounded" style={{background:'var(--color-bg-hover)'}} />
              </div>
            ))}
          </>
        ) : (
          <>

        {/* 连接状态 */}
        <div className="settings-group">
          <h2 className="settings-heading">连接状态</h2>
          <div className="rounded-lg border border-[var(--color-border-default)] overflow-hidden">
            <SettingRow label="状态" control={
              <span className={`text-xs font-medium ${connectionState === 'connected' ? 'text-[var(--color-accent-green)]' : connectionState === 'error' ? 'text-[var(--color-accent-red)]' : 'text-[var(--color-accent-yellow)]'}`}>
                {connectionState === 'connected' ? '已连接' : connectionState === 'error' ? '连接失败' : '连接中...'}
              </span>
            } />
            {sessionId && (
              <SettingRow label="会话 ID" control={<span className="text-xs text-[var(--color-text-secondary)]">{sessionId.slice(0, 12)}...</span>} />
            )}
          </div>
        </div>

        {/* CodeBuddy GUI */}
        <div className="settings-group">
          <h2 className="settings-heading">CodeBuddy GUI</h2>
          <div className="rounded-lg border border-[var(--color-border-default)] overflow-hidden">
            <SettingRow label="界面主题" desc="立即应用于 CodeBuddy GUI" control={
              <div className="flex gap-1">
                {['跟随系统', '暗色', '亮色'].map(theme => (
                  <button
                    key={theme}
                    onClick={() => updateGuiSetting('theme', theme === '暗色' ? 'dark' : theme === '亮色' ? 'light' : 'system')}
                    className={`rounded-md px-2.5 py-1 text-xs border transition-colors ${
                    (guiSettings?.theme || 'dark') === (theme === '暗色' ? 'dark' : theme === '亮色' ? 'light' : 'system')
                      ? '' 
                      : 'border-[var(--color-border-default)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
                  }`}
                  style={(guiSettings?.theme || 'dark') === (theme === '暗色' ? 'dark' : theme === '亮色' ? 'light' : 'system') ? {borderColor:'var(--color-accent-blue)', background:'rgba(59,130,246,0.1)', color:'var(--color-accent-blue)'} : undefined}
                  >{theme}</button>
                ))}
              </div>
            } />
            <SettingRow label="显示提示建议" desc="在输入框上方显示 CodeBuddy 返回的提示建议" control={<Toggle value={!!guiSettings?.promptSuggestionEnabled} onChange={(v) => updateGuiSetting('promptSuggestionEnabled', v)} />} />
            <SettingRow label="允许剪贴板贴图" desc="允许从剪贴板添加当前运行时支持的图片附件" control={<Toggle value={!!guiSettings?.enablePasteImageFromClipboard} onChange={(v) => updateGuiSetting('enablePasteImageFromClipboard', v)} />} />
            <SettingRow label="显示 Token 计数" desc="在对话输入区显示当前会话的 Token 使用量" control={<Toggle value={!!guiSettings?.showTokensCounter} onChange={(v) => updateGuiSetting('showTokensCounter', v)} />} />
            <SettingRow label="桌面通知" desc="窗口隐藏或未聚焦时，在后台任务完成或失败后通知" control={<Toggle value={guiSettings?.desktopNotificationsEnabled !== false} onChange={(v) => updateGuiSetting('desktopNotificationsEnabled', v)} />} />
          </div>
        </div>

        {/* 模型选择 */}
        <div className="settings-group">
          <h2 className="settings-heading">模型选择</h2>
          <div className="rounded-lg border border-[var(--color-border-default)] overflow-hidden">
            <SettingRow label="当前模型" control={
              modelOptions.length > 0 ? (
                <Select value={currentModel} options={modelOptions} disabled={selectionDisabled} onChange={(value) => changeSessionSetting('model', value)} />
              ) : (
                <span className="text-xs text-[var(--color-text-secondary)]">{currentModelName || currentModel || '加载中...'}</span>
              )
            } />
            <SettingRow label="当前模式" control={
              modeOptions.length > 0 ? (
                <Select value={currentMode} options={modeOptions} disabled={selectionDisabled} onChange={(value) => changeSessionSetting('mode', value)} />
              ) : (
                <span className="text-xs text-[var(--color-text-secondary)]">{currentMode || 'Default'}</span>
              )
            } />
            {selectionStatus ? (
              <div className={`border-t border-[var(--color-border-muted)] px-4 py-2 text-xs ${
                selectionStatus.type === 'error' ? 'text-[var(--color-accent-red)]' :
                selectionStatus.type === 'success' ? 'text-[var(--color-accent-green)]' :
                'text-[var(--color-text-muted)]'
              }`}>{selectionStatus.message}</div>
            ) : null}
          </div>
        </div>

        {/* CodeBuddy CLI 模型与推理 */}
        <div className="settings-group">
          <h2 className="settings-heading">CodeBuddy CLI：模型与推理</h2>
          <div className="rounded-lg border border-[var(--color-border-default)] overflow-hidden">
            <SettingRow label="默认模型" desc="设置默认使用的 AI 模型" control={
              <TextInput scopeKey={activeProjectId} value={settings?.model || currentModelName || currentModel || ''} onChange={(v) => updateSetting('model', v)} />
            } />
            <SettingRow label="推理努力级别" desc="控制模型的推理深度" control={
              <select
                className="rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-tertiary)] px-3 py-1.5 text-xs text-[var(--color-text-primary)]"
                value={settings?.reasoningEffort || 'high'}
                onChange={(e) => updateSetting('reasoningEffort', e.target.value)}
              >
                <option value="">-</option>
                <option value="minimal">最小</option>
                <option value="low">低</option>
                <option value="medium">中</option>
                <option value="high">高</option>
                <option value="xhigh">极高</option>
                <option value="max">最大</option>
              </select>
            } />
            <SettingRow label="始终启用深度思考" control={
              <Toggle value={!!settings?.alwaysThinkingEnabled} onChange={(v) => updateSetting('alwaysThinkingEnabled', v)} />
            } />
          </div>
        </div>

        {/* CodeBuddy CLI 行为 */}
        <div className="settings-group">
          <h2 className="settings-heading">CodeBuddy CLI：行为</h2>
          <div className="rounded-lg border border-[var(--color-border-default)] overflow-hidden">
            <SettingRow label="自动压缩上下文" control={<Toggle value={!!settings?.autoCompactEnabled} onChange={(v) => updateSetting('autoCompactEnabled', v)} />} />
            <SettingRow label="提交包含 Co-authored-by" control={<Toggle value={!!settings?.includeCoAuthoredBy} onChange={(v) => updateSetting('includeCoAuthoredBy', v)} />} />
            <SettingRow label="文件检查点" desc="启用文件版本回退功能" control={<Toggle value={!!settings?.fileCheckpointingEnabled} onChange={(v) => updateSetting('fileCheckpointingEnabled', v)} />} />
            <SettingRow label="折叠 Hook 输出" desc="控制 CodeBuddy 返回的 Hook 输出默认展示方式" control={<Toggle value={!!settings?.hookOutputCollapsed} onChange={(v) => updateSetting('hookOutputCollapsed', v)} />} />
            <SettingRow label="忽略 .gitignore" desc="搜索文件时忽略 .gitignore 规则" control={<Toggle value={!!settings?.ignoreGitignore} onChange={(v) => updateSetting('ignoreGitignore', v)} />} />
            <SettingRow label="延迟加载工具" control={<Toggle value={!!settings?.lazyLoadTools} onChange={(v) => updateSetting('lazyLoadTools', v)} />} />
            <SettingRow label="终端进度条" desc="控制 CodeBuddy 命令输出中的进度显示，不影响 GUI 内置终端" control={<Toggle value={!!settings?.enableTerminalProgressBar} onChange={(v) => updateSetting('enableTerminalProgressBar', v)} />} />
          </div>
        </div>

        {/* CodeBuddy CLI 记忆 */}
        <div className="settings-group">
          <h2 className="settings-heading">CodeBuddy CLI：记忆</h2>
          <div className="rounded-lg border border-[var(--color-border-default)] overflow-hidden">
            <SettingRow label="启用记忆功能" control={<Toggle value={!!settings?.memory?.enabled} onChange={(v) => updateSetting('memory', { ...settings?.memory, enabled: v })} />} />
            <SettingRow label="自动记忆" desc="自动保存重要信息到记忆库" control={<Toggle value={!!settings?.memory?.autoMemoryEnabled} onChange={(v) => updateSetting('memory', { ...settings?.memory, autoMemoryEnabled: v })} />} />
          </div>
        </div>

        {/* CodeBuddy CLI 语言与通知 */}
        <div className="settings-group">
          <h2 className="settings-heading">CodeBuddy CLI：语言与通知</h2>
          <div className="rounded-lg border border-[var(--color-border-default)] overflow-hidden">
            <SettingRow label="响应语言" desc="设置 AI 回复语言，不会翻译 CodeBuddy GUI 界面" control={
              <div className="flex gap-1">
                {['跟随系统', '简体中文', 'English'].map(lang => (
                  <button
                    key={lang}
                    onClick={() => updateSetting('language', lang)}
                    className={`rounded-md px-2.5 py-1 text-xs border transition-colors ${
                    (settings?.language || '简体中文') === lang
                      ? ''
                      : 'border-[var(--color-border-default)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
                  }`}
                  style={(settings?.language || '简体中文') === lang ? {borderColor:'var(--color-accent-blue)', background:'rgba(59,130,246,0.1)', color:'var(--color-accent-blue)'} : undefined}
                  >{lang}</button>
                ))}
              </div>
            } />
            <SettingRow label="通知渠道" desc="传递给 CodeBuddy CLI；与上方 GUI 桌面通知开关相互独立" control={
              <TextInput scopeKey={activeProjectId} value={settings?.preferredNotifChannel || 'Auto'} onChange={(value) => updateSetting('preferredNotifChannel', value)} />
            } />
          </div>
        </div>

        {/* CodeBuddy CLI 高级 */}
        <div className="settings-group">
          <h2 className="settings-heading">CodeBuddy CLI：高级</h2>
          <div className="rounded-lg border border-[var(--color-border-default)] overflow-hidden">
            <SettingRow label="聊天记录保留天数" control={
              <SpinButton value={settings?.cleanupPeriodDays ?? 30} onChange={(v) => updateSetting('cleanupPeriodDays', v)} />
            } />
            <SettingRow label="图片保留轮数" desc="对话历史中保留图片的最近轮数" control={
              <SpinButton value={settings?.imageHistoryRetainRounds ?? 2} onChange={(v) => updateSetting('imageHistoryRetainRounds', v)} />
            } />
            <SettingRow label="自动更新" desc="控制 CodeBuddy CLI 自身更新，不会更新 CodeBuddy GUI" control={<Toggle value={!!settings?.autoUpdates} onChange={(v) => updateSetting('autoUpdates', v)} />} />
            <SettingRow label="启用全部项目 MCP" desc="由 CodeBuddy CLI 加载项目中配置的 MCP 服务" control={<Toggle value={!!settings?.enableAllProjectMcpServers} onChange={(v) => updateSetting('enableAllProjectMcpServers', v)} />} />
            <SettingRow label="信任全部目录" control={<Toggle value={!!settings?.trustAll} onChange={(value) => updateSetting('trustAll', value)} />} />
            <SettingRow label="状态栏命令" desc="配置 CodeBuddy CLI 状态栏，不会改变 GUI 状态栏" control={
              <TextInput scopeKey={activeProjectId} value={settings?.statusLine?.command || ''} width="w-72" onChange={(value) => updateSetting('statusLine.command', value)} />
            } />
            <SettingRow label="网关认证" desc="CodeBuddy 网关使用的认证值，仅保存到 CodeBuddy 配置" control={
              <TextInput scopeKey={activeProjectId} inputType="password" value={settings?.gateway?.auth || settings?.['gateway.auth'] || ''} width="w-72" onChange={(value) => updateSetting('gateway.auth', value)} />
            } />
            <SettingRow label="环境变量" desc="应用于每个会话的环境变量 (JSON)" control={
              <JsonObjectEditor scopeKey={activeProjectId} value={settings?.env} onSave={(value) => updateSetting('env', value)} />
            } />
            <SettingRow label="可信目录" control={
              <JsonArrayEditor scopeKey={activeProjectId} value={settings?.trustedDirectories} ariaLabel="可信目录 JSON" onSave={(value) => updateSetting('trustedDirectories', value)} />
            } />
          </div>
        </div>

        {/* CodeBuddy CLI 安全沙箱 */}
        <div className="settings-group">
          <h2 className="settings-heading">CodeBuddy CLI：安全沙箱</h2>
          <div className="rounded-lg border border-[var(--color-border-default)] overflow-hidden">
            <SettingRow label="启用安全沙箱" desc="在沙箱中运行 Bash 命令，限制文件和网络访问" control={<Toggle value={!!settings?.sandbox?.enabled} onChange={(v) => updateSetting('sandbox', { ...settings?.sandbox, enabled: v })} />} />
            <SettingRow label="沙箱内自动批准命令" desc="命令在沙箱中运行时自动批准" control={<Toggle value={!!settings?.sandbox?.autoAllowBashIfSandboxed} onChange={(v) => updateSetting('sandbox', { ...settings?.sandbox, autoAllowBashIfSandboxed: v })} />} />
            <SettingRow label="允许非沙箱命令" control={<Toggle value={!!settings?.sandbox?.allowUnsandboxedCommands} onChange={(v) => updateSetting('sandbox', { ...settings?.sandbox, allowUnsandboxedCommands: v })} />} />
          </div>
        </div>

        {/* 系统信息 */}
        <div className="settings-group">
          <h2 className="settings-heading">系统信息</h2>
          <div className="overflow-hidden rounded-lg border border-[var(--color-border-default)]">
            <SettingRow label="CodeBuddy GUI" control={<span className="text-xs text-[var(--color-text-secondary)]">{appInfoError ? '信息不可用' : appInfo?.version ? `v${appInfo.version}` : '加载中...'}</span>} />
            <SettingRow label="应用模式" control={<span className="text-xs text-[var(--color-text-secondary)]">{appInfo ? (appInfo.packaged ? '安装版' : '开发版') : '-'}</span>} />
            <SettingRow label="GUI 更新" desc={updateStatus?.message || '检查 GitHub Releases，可直接下载 Windows 安装包；安装仍由用户确认'} control={
              <div className="flex items-center gap-1">
                <button className="btn-ghost shrink-0 px-2 py-1 text-[11px]" disabled={checkingForUpdates || openingUpdateDownload} onClick={checkForGuiUpdates}>
                  {checkingForUpdates ? '检查中...' : updateStatus ? '重新检查' : '检查更新'}
                </button>
                {updateStatus?.type === 'update' && updateStatus?.downloadUrl ? (
                  <button className="btn-primary shrink-0 px-2 py-1 text-[11px]" disabled={openingUpdateDownload} onClick={openGuiUpdateDownload}>
                    {openingUpdateDownload ? '启动下载...' : '下载安装包'}
                  </button>
                ) : null}
                <button className="btn-ghost shrink-0 px-2 py-1 text-[11px]" disabled={openingUpdateDownload} onClick={openGuiReleasePage}>发布页</button>
              </div>
            } />
            <SettingRow label="诊断报告" desc="导出已脱敏的应用、运行时与日志信息；不包含对话或项目文件" control={
              <button className="btn-ghost shrink-0 px-2 py-1 text-[11px]" disabled={exportingDiagnostics} onClick={exportDiagnostics}>
                {exportingDiagnostics ? '导出中...' : '导出'}
              </button>
            } />
            <SettingRow label="用户数据目录" desc="项目、对话、界面状态和诊断日志的本地保存位置" control={
              <div className="flex min-w-0 items-center gap-1">
                <span className="max-w-[160px] truncate text-xs text-[var(--color-text-secondary)]" title={appInfo?.userDataPath || ''}>{appInfo?.userDataPath || '-'}</span>
                <button
                  className="btn-icon ml-1 shrink-0"
                  title="复制用户数据目录"
                  disabled={!appInfo?.userDataPath}
                  onClick={() => copySystemPath(appInfo?.userDataPath, '用户数据目录')}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
                  </svg>
                </button>
                <button className="btn-ghost shrink-0 px-2 py-1 text-[11px]" disabled={openingUserData || !appInfo?.userDataPath} onClick={openUserDataDirectory}>
                  {openingUserData ? '打开中...' : '打开'}
                </button>
              </div>
            } />
            <SettingRow label="工作目录" control={
              <div className="flex items-center gap-1">
                <span className="max-w-[180px] truncate text-xs text-[var(--color-text-secondary)]" title={info?.cwd || ''}>{info?.cwd || '-'}</span>
                <button className="btn-icon ml-1 shrink-0" title="复制工作目录" disabled={!info?.cwd} onClick={() => copySystemPath(info?.cwd, '工作目录')}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
                  </svg>
                </button>
              </div>
            } />
            <SettingRow label="操作系统" control={<span className="text-xs text-[var(--color-text-secondary)]">{info?.os || '-'} {info?.arch || ''}</span>} />
            <SettingRow label="Node.js" control={<span className="text-xs text-[var(--color-text-secondary)]">{info?.nodeVersion || '-'}</span>} />
            <SettingRow label="网关模式" control={<span className="text-xs text-[var(--color-text-secondary)]">{info?.gatewayMode || '-'}</span>} />
          </div>
          {appInfoError ? <div className="mt-2 text-xs text-[var(--color-accent-red)]">{appInfoError}</div> : null}
          {systemAction ? <div className={`mt-2 text-xs ${systemAction.type === 'success' ? 'text-[var(--color-accent-green)]' : 'text-[var(--color-accent-red)]'}`}>{systemAction.message}</div> : null}
        </div>

        </>)}
      </div>
    </div>
  );
}
