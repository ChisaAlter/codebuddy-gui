const fs = require('fs');
const os = require('os');
const path = require('path');

function pathEntries(env = process.env) {
  return String(env.Path || env.PATH || '')
    .split(path.delimiter)
    .map((item) => String(item || '').trim())
    .filter(Boolean);
}

function fileExists(filePath) {
  try {
    return fs.statSync(filePath).isFile();
  } catch (_) {
    return false;
  }
}

function dirExists(dirPath) {
  try {
    return fs.statSync(dirPath).isDirectory();
  } catch (_) {
    return false;
  }
}

function uniquePaths(entries) {
  const seen = new Set();
  const result = [];
  for (const entry of entries) {
    const key = process.platform === 'win32' ? entry.toLowerCase() : entry;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(entry);
  }
  return result;
}

function windowsNpmGlobalDirs(env = process.env) {
  const home = env.USERPROFILE || env.HOME || os.homedir();
  const appData = env.APPDATA || (home ? path.join(home, 'AppData', 'Roaming') : null);
  const programFiles = env.ProgramFiles || 'C:\\Program Files';
  const programFilesX86 = env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  return [
    appData ? path.join(appData, 'npm') : null,
    path.join(programFiles, 'nodejs'),
    path.join(programFilesX86, 'nodejs'),
  ].filter(Boolean);
}

/**
 * GUI 从快捷方式启动时，偶发拿不到最新用户 PATH。
 * 在 Windows 上把常见 npm 全局目录补进 PATH，便于找到 codebuddy.cmd。
 */
function withAugmentedPath(env = process.env) {
  if (process.platform !== 'win32') return { ...env };
  const current = pathEntries(env);
  const extras = windowsNpmGlobalDirs(env).filter((dir) => dirExists(dir));
  const next = uniquePaths([...extras, ...current]);
  if (next.length === current.length && next.every((item, index) => item === current[index])) {
    return { ...env };
  }
  const joined = next.join(path.delimiter);
  return {
    ...env,
    Path: joined,
    PATH: joined,
  };
}

function candidateNames(basename) {
  if (process.platform !== 'win32') return [basename];
  return [`${basename}.cmd`, `${basename}.exe`, basename, `${basename}.bat`];
}

function findOnPath(basename, env = process.env) {
  for (const dir of pathEntries(env)) {
    for (const name of candidateNames(basename)) {
      const fullPath = path.join(dir, name);
      if (fileExists(fullPath)) return fullPath;
    }
  }
  return null;
}

function resolveNodeExecutable(env = process.env) {
  const fromPath = findOnPath('node', env);
  if (fromPath) return fromPath;
  if (process.platform === 'win32') {
    for (const dir of windowsNpmGlobalDirs(env)) {
      const candidate = path.join(dir, 'node.exe');
      if (fileExists(candidate)) return candidate;
    }
  }
  // 打包 Electron 的 process.execPath 是 GUI 本体，不能直接当 node 用。
  return 'node';
}

function resolveCodeBuddyJsEntry(cliPath) {
  if (!cliPath) return null;
  const dir = path.dirname(cliPath);
  const candidates = [
    path.join(dir, 'node_modules', '@tencent-ai', 'codebuddy-code', 'bin', 'codebuddy'),
    path.join(dir, 'node_modules', '@tencent-ai', 'codebuddy-code', 'bin', 'codebuddy.js'),
  ];
  for (const candidate of candidates) {
    if (fileExists(candidate)) return candidate;
  }
  return null;
}

function quoteForCmd(value) {
  const text = String(value ?? '');
  if (!text) return '""';
  if (!/[\s"]/u.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

/**
 * 解析可安全 shell:false 启动的 codebuddy 调用方式。
 * Windows 上 npm 全局命令是 .cmd 包装；CreateProcess 无法直接执行 .cmd，
 * 因此优先解析到 node + 真实 JS 入口，避免再走 cmd 二次分词。
 */
function resolveCodeBuddySpawnSpec(args = [], env = process.env) {
  const argv = Array.isArray(args) ? args.map((item) => String(item)) : [];
  const effectiveEnv = withAugmentedPath(env);
  const found = findOnPath('codebuddy', effectiveEnv);

  if (!found) {
    return {
      command: 'codebuddy',
      args: argv,
      env: effectiveEnv,
      resolved: false,
      source: null,
    };
  }

  const isWindowsShim = process.platform === 'win32' && (/\.(cmd|bat)$/i.test(found) || !path.extname(found));
  if (isWindowsShim) {
    const entry = resolveCodeBuddyJsEntry(found);
    if (entry) {
      return {
        command: resolveNodeExecutable(effectiveEnv),
        args: [entry, ...argv],
        env: effectiveEnv,
        resolved: true,
        source: found,
        entry,
      };
    }

    // 兜底：通过 cmd 执行 .cmd，参数单独引用，避免空格路径被拆坏。
    const comspec = effectiveEnv.ComSpec || process.env.ComSpec || 'cmd.exe';
    const commandLine = [quoteForCmd(found), ...argv.map(quoteForCmd)].join(' ');
    return {
      command: comspec,
      args: ['/d', '/s', '/c', commandLine],
      env: effectiveEnv,
      resolved: true,
      source: found,
      entry: null,
    };
  }

  return {
    command: found,
    args: argv,
    env: effectiveEnv,
    resolved: true,
    source: found,
    entry: null,
  };
}

module.exports = {
  pathEntries,
  withAugmentedPath,
  findOnPath,
  resolveCodeBuddyJsEntry,
  resolveCodeBuddySpawnSpec,
  quoteForCmd,
};
