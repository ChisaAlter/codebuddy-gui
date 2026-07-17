const LOCAL_RENDERER_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);

function rendererOriginForEntry(value) {
  const parsed = new URL(String(value || ''));
  if (!['http:', 'https:'].includes(parsed.protocol) || !LOCAL_RENDERER_HOSTS.has(parsed.hostname)) {
    throw new Error(`Renderer entry must use a local HTTP origin: ${parsed.toString()}`);
  }
  return parsed.origin;
}

function isTrustedRendererNavigation(value, trustedOrigin) {
  if (!trustedOrigin) return false;
  try {
    return new URL(String(value || '')).origin === trustedOrigin;
  } catch (_) {
    return false;
  }
}

function normalizeExternalHttpUrl(value) {
  try {
    const parsed = new URL(String(value || ''));
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) return null;
    return parsed.toString();
  } catch (_) {
    return null;
  }
}

module.exports = {
  isTrustedRendererNavigation,
  normalizeExternalHttpUrl,
  rendererOriginForEntry,
};
