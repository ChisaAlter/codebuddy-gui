import { useStore } from '../store';
import { fetchJson } from './acp';

// Git cwd 跟随当前工作区：优先读 store.workspacePath，兜底 '.'
// 注意：每次 runGit 调用都动态读取，切工作区后下一次 git 调用立即生效
function getWorkspaceCwd() {
  try {
    const state = useStore.getState?.();
    if (state && state.workspacePath) return state.workspacePath;
  } catch (_) { /* store 未初始化时兜底 */ }
  return '.';
}

export async function runGit(commandArgs = [], cwd = getWorkspaceCwd()) {
  const proc = await window.electronAPI?.runGit?.({ args: commandArgs, cwd });
  if (!proc || !proc.ok) {
    throw new Error(proc?.error || 'git command failed');
  }
  return proc.output || '';
}

/**
 * Git HTTP API 对照路径（对照源 bundle：POST /api/v1/git/{command}，body 拼 cwd）
 * - 与本地 IPC runGit 并存，不替换主路径
 * - 用途：后端有 git 但本机无 spawn 能力的环境兜底；亦供对照源真实 UI 路径回归比对
 * - body 形状：{...args, cwd: workspacePath}，对照源 FO() 读 editor-store.rootPath
 * - 返回：后端 git 结果（json 或 string），由调用方自行解析
 * @param {string} command - git 子命令，如 'status'/'log'/'diff'/'commit'
 * @param {object} [args] - 命令参数对象，如 { short: true, count: 20 }
 * @returns {Promise<object|string>}
 */
export async function runGitRemote(command, args = {}) {
  const cwd = getWorkspaceCwd();
  const body = { ...args, cwd };
  const payload = await fetchJson(`/api/v1/git/${encodeURIComponent(command)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return payload?.data ?? payload ?? null;
}

export async function getGitStatus() {
  const output = await runGit(['status', '--short']);
  return output
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => ({
      raw: line,
      indexStatus: line.slice(0, 1),
      worktreeStatus: line.slice(1, 2),
      path: line.slice(3).trim(),
    }));
}

export async function getCurrentBranch() {
  return (await runGit(['branch', '--show-current'])).trim();
}

export async function getBranches() {
  return (await runGit(['branch', '--format=%(refname:short)']))
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean);
}

export async function getDiff(path) {
  return await runGit(['diff', '--', path]);
}

export async function stageFile(path) {
  return await runGit(['add', '--', path]);
}

export async function unstageFile(path) {
  return await runGit(['reset', 'HEAD', '--', path]);
}

export async function discardFile(path) {
  return await runGit(['checkout', '--', path]);
}

export async function stageAll() {
  return await runGit(['add', '-A']);
}

export async function unstageAll() {
  return await runGit(['reset', 'HEAD', '--', '.']);
}

export async function discardAll() {
  return await runGit(['checkout', '--', '.']);
}

export async function switchBranch(name) {
  return await runGit(['checkout', name]);
}

export async function createBranch(name) {
  return await runGit(['checkout', '-b', name]);
}

export async function pushBranch() {
  return await runGit(['push']);
}

export async function pullBranch() {
  return await runGit(['pull']);
}

/**
 * Git commit
 * @param {string} message - 提交信息
 * @returns {Promise<string>}
 */
export async function commit(message) {
  return await runGit(['commit', '-m', message]);
}

/**
 * Git log（返回最近 N 条提交历史，精简格式）
 * @param {number} [count=20] - 返回的提交数量
 * @returns {Promise<Array<{raw: string}>>}
 */
export async function getLog(count = 20) {
  const output = await runGit(['log', `-${count}`, '--oneline', '--decorate']);
  return output
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => ({ raw: line }));
}

/**
 * Git log 详细版（返回最近 N 条提交历史，带完整信息）
 * @param {number} [count=20] - 返回的提交数量
 * @returns {Promise<Array<{hash: string, shortHash: string, author: string, date: string, subject: string}>>}
 */
export async function getLogDetailed(count = 20) {
  const output = await runGit(['log', `-${count}`, '--format=%H|%h|%an|%ai|%s']);
  return output
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [hash, shortHash, author, date, ...subjectParts] = line.split('|');
      return { hash, shortHash, author, date, subject: subjectParts.join('|') };
    });
}

/**
 * Git stash 暂存当前工作区修改
 * @returns {Promise<string>}
 */
export async function stash() {
  return await runGit(['stash']);
}

/**
 * Git stash pop 恢复最近一次暂存
 * @returns {Promise<string>}
 */
export async function stashPop() {
  return await runGit(['stash', 'pop']);
}

/**
 * Git stash 列表
 * @returns {Promise<Array<{raw: string}>>}
 */
export async function stashList() {
  const output = await runGit(['stash', 'list']);
  return output
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => ({ raw: line }));
}

/**
 * Git fetch 从远程获取最新 refs
 * @returns {Promise<string>}
 */
export async function fetch() {
  return await runGit(['fetch']);
}

/**
 * 获取未暂存的 diff
 * @returns {Promise<string>}
 */
export async function getUnstagedDiff() {
  return await runGit(['diff']);
}

/**
 * 获取已暂存区的 diff
 * @returns {Promise<string>}
 */
export async function getStagedDiff() {
  return await runGit(['diff', '--cached']);
}

/**
 * 获取远程仓库 URL
 * @returns {Promise<string>}
 */
export async function getRemoteUrl() {
  try {
    return (await runGit(['remote', 'get-url', 'origin'])).trim();
  } catch (_) {
    return '';
  }
}
