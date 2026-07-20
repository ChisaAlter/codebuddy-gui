// GUI 偏好：主题、通知等本地 UI 开关。正式键与后端 settings 缓存分离。
export const GUI_PREFERENCES_KEY = 'codebuddy-gui-preferences';
// 后端 /api/v1/settings 的离线缓存键（历史也混放过 GUI 字段，仅作迁移源读取）。
export const SETTINGS_CACHE_KEY = 'codebuddy-gui-settings';

const STORAGE_KEY = GUI_PREFERENCES_KEY;
const LEGACY_STORAGE_KEY = SETTINGS_CACHE_KEY;

export const DEFAULT_GUI_SETTINGS = {
  theme: 'dark',
  promptSuggestionEnabled: false,
  enablePasteImageFromClipboard: false,
  showTokensCounter: false,
  desktopNotificationsEnabled: true,
};

export const GUI_SETTING_KEYS = Object.freeze(Object.keys(DEFAULT_GUI_SETTINGS));
const GUI_SETTING_KEY_SET = new Set(GUI_SETTING_KEYS);

export function isGuiSettingKey(key) {
  return GUI_SETTING_KEY_SET.has(String(key || ''));
}

export function normalizeGuiSettings(value) {
  const source = value && typeof value === 'object' ? value : {};
  const theme = ['dark', 'light', 'system'].includes(source.theme) ? source.theme : DEFAULT_GUI_SETTINGS.theme;
  return {
    theme,
    promptSuggestionEnabled: source.promptSuggestionEnabled === true,
    enablePasteImageFromClipboard: source.enablePasteImageFromClipboard === true,
    showTokensCounter: source.showTokensCounter === true,
    desktopNotificationsEnabled: source.desktopNotificationsEnabled !== false,
  };
}

function legacyHasGuiFields(source) {
  if (!source || typeof source !== 'object') return false;
  return GUI_SETTING_KEYS.some((key) => Object.prototype.hasOwnProperty.call(source, key));
}

export function loadGuiSettings() {
  if (typeof localStorage === 'undefined') return { ...DEFAULT_GUI_SETTINGS };
  try {
    const current = localStorage.getItem(STORAGE_KEY);
    if (current) return normalizeGuiSettings(JSON.parse(current));
    const legacyRaw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!legacyRaw) return { ...DEFAULT_GUI_SETTINGS };
    const legacy = JSON.parse(legacyRaw);
    // 仅当旧缓存里仍带 GUI 字段时迁移；后端-only 缓存不应写成“默认偏好”覆盖用户。
    if (!legacyHasGuiFields(legacy)) return { ...DEFAULT_GUI_SETTINGS };
    const migrated = normalizeGuiSettings(legacy);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
    return migrated;
  } catch (_) {
    return { ...DEFAULT_GUI_SETTINGS };
  }
}

export function saveGuiSettings(value) {
  const normalized = normalizeGuiSettings(value);
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  }
  return normalized;
}

export function stripGuiSettings(settings) {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return {};
  const next = { ...settings };
  for (const key of GUI_SETTING_KEYS) delete next[key];
  return next;
}
