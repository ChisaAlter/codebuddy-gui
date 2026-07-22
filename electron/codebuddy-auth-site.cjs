const fs = require('fs');
const os = require('os');
const path = require('path');

/**
 * CLI OAuth is stored under CodeBuddyExtension shared auth, keyed by product auth id.
 * Domain on that session decides China vs international product env.
 */

function authDirCandidates(env = process.env) {
  const localAppData = env.LOCALAPPDATA || (env.USERPROFILE ? path.join(env.USERPROFILE, 'AppData', 'Local') : null);
  const appData = env.APPDATA || (env.USERPROFILE ? path.join(env.USERPROFILE, 'AppData', 'Roaming') : null);
  const home = env.USERPROFILE || env.HOME || os.homedir();
  return [
    localAppData ? path.join(localAppData, 'CodeBuddyExtension', 'Data', 'Public', 'auth') : null,
    appData ? path.join(appData, 'CodeBuddyExtension', 'Data', 'Public', 'auth') : null,
    home ? path.join(home, '.codebuddy', 'auth') : null,
  ].filter(Boolean);
}

function isChinaAuthDomain(domain) {
  const host = String(domain || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .split('/')[0];
  if (!host) return false;
  return (
    host === 'www.codebuddy.cn' ||
    host.endsWith('.codebuddy.cn') ||
    host === 'copilot.tencent.com' ||
    host.endsWith('.copilot.tencent.com') ||
    host.includes('staging-copilot.tencent.com') ||
    host.includes('staging.codebuddy.cn')
  );
}

function isInternationalAuthDomain(domain) {
  const host = String(domain || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .split('/')[0];
  if (!host) return false;
  return (
    host === 'www.codebuddy.ai' ||
    host.endsWith('.codebuddy.ai') ||
    host.includes('staging-codebuddy.tencent.com')
  );
}

function readJsonFile(filePath) {
  try {
    const text = fs.readFileSync(filePath, 'utf8');
    if (!text) return null;
    return JSON.parse(text);
  } catch (_) {
    return null;
  }
}

function accountLoginSiteFromAuthPayload(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const domain =
    payload?.auth?.domain ||
    payload?.account?.sso?.domain ||
    payload?.domain ||
    null;
  if (isChinaAuthDomain(domain)) return 'cn';
  if (isInternationalAuthDomain(domain)) return 'global';
  return null;
}

/**
 * Read newest valid primary auth session (not timestamped backups).
 * @returns {{ site: 'cn'|'global'|null, domain: string|null, userId: string|null, nickname: string|null, path: string|null }}
 */
function readCodeBuddyDiskAuth(env = process.env) {
  const empty = { site: null, domain: null, userId: null, nickname: null, path: null };
  for (const dir of authDirCandidates(env)) {
    let entries = [];
    try {
      entries = fs.readdirSync(dir).filter((name) => name.endsWith('.info') && !/\.\d{4}-\d{2}-\d{2}T/.test(name));
    } catch (_) {
      continue;
    }
    // Prefer coding-copilot primary file, then any non-backup .info
    const ordered = [
      ...entries.filter((name) => name === 'Tencent-Cloud.coding-copilot.info'),
      ...entries.filter((name) => name !== 'Tencent-Cloud.coding-copilot.info'),
    ];
    for (const name of ordered) {
      const filePath = path.join(dir, name);
      const payload = readJsonFile(filePath);
      if (!payload?.auth || !payload?.account) continue;
      const domain = payload.auth.domain || null;
      const site = accountLoginSiteFromAuthPayload(payload);
      return {
        site,
        domain,
        userId: payload.account.uid || payload.account.userId || null,
        nickname: payload.account.nickname || payload.account.userName || null,
        path: filePath,
      };
    }
  }
  return empty;
}

/**
 * Resolve site for spawning CLI:
 * 1) on-disk OAuth domain always wins over conflicting GUI preference
 * 2) explicit GUI preference when valid
 * 3) disk site when no preference
 * 4) null → caller preserves process env / CLI default (no forced global)
 */
function resolveAccountLoginSiteForRuntime(preferred, env = process.env) {
  const disk = readCodeBuddyDiskAuth(env);
  const pref = preferred === 'cn' || preferred === 'global' ? preferred : null;
  if (disk.site && pref && disk.site !== pref) {
    // Disk token is source of truth for product environment.
    return disk.site;
  }
  if (pref) return pref;
  if (disk.site) return disk.site;
  return null;
}

module.exports = {
  authDirCandidates,
  isChinaAuthDomain,
  isInternationalAuthDomain,
  accountLoginSiteFromAuthPayload,
  readCodeBuddyDiskAuth,
  resolveAccountLoginSiteForRuntime,
};
