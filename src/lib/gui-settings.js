const STORAGE_KEY = 'codebuddy-gui-preferences';
const LEGACY_STORAGE_KEY = 'codebuddy-gui-settings';

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

export function loadGuiSettings() {
  if (typeof localStorage === 'undefined') return { ...DEFAULT_GUI_SETTINGS };
  try {
    const current = localStorage.getItem(STORAGE_KEY);
    if (current) return normalizeGuiSettings(JSON.parse(current));
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    const migrated = normalizeGuiSettings(legacy ? JSON.parse(legacy) : null);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
    return migrated;
  } catch (_) {
    return { ...DEFAULT_GUI_SETTINGS };
  }
}

export function saveGuiSettings(value) {
  const normalized = normalizeGuiSettings(value);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

export function stripGuiSettings(value) {
  const source = value && typeof value === 'object' ? value : {};
  return Object.fromEntries(Object.entries(source).filter(([key]) => !GUI_SETTING_KEY_SET.has(key)));
}
