// Git IPC 校验纯函数模块：electron/main.cjs 内联同名规则的 ESM 镜像，供单元测试 import
// 注意：main.cjs 是 CJS 不能 require ESM，故两份并存——修改任一份须同步另一份
// （CI 的 e2e-launch.cjs 会正则校验 main.cjs 内规则形态，能抓漂移）

const GIT_ALLOWED_COMMANDS = new Set([
  'add', 'branch', 'checkout', 'commit', 'diff', 'fetch', 'init', 'log', 'pull', 'push', 'remote', 'reset', 'stash', 'status',
]);

// 二级子命令白名单：只校验出现在主命令后第一位置的子动词（非选项，即不以 - 开头）
// 缺省为 ['*'] 表示不约束（如 add/status/diff 等本身不再细分）
// checkout 特殊：既能切分支又能 checkout 文件，分支名是任意字符串无法白名单，故只约束选项
const GIT_ALLOWED_SUBCOMMANDS = {
  branch: new Set(['--show-current', '--format=%(refname:short)']),
  checkout: new Set(['-b']),
  stash: new Set(['pop', 'list']),
  remote: new Set(['get-url']),
  reset: new Set(['HEAD']),
};

// git 选项黑名单：拦截可执行外部命令 / 改变传输行为的危险选项
// 参考 git-receive-pack / git-upload-pack 可被恶意 server 触发执行任意 hook
const GIT_BLOCKED_OPTIONS = new Set([
  '--upload-pack',
  '--receive-pack',
  '--config',
  '-c',
  '--exec',
  '--shallow-exclude',
  '--local-config',
]);

const GIT_PATH_OPTIONS = new Set(['--']);

export function normalizeGitRequest(payload) {
  const request = Array.isArray(payload) ? { args: payload } : (payload || {});
  const args = Array.isArray(request.args) ? request.args.map(String) : [];
  const cwd = typeof request.cwd === 'string' && request.cwd.trim() ? request.cwd.trim() : '.';
  return { args, cwd };
}

export function validateGitArgs(args) {
  if (!args.length) return 'empty git command';
  const command = args[0] === '-C' ? args[2] : args[0];
  if (!command || command.startsWith('-') || !GIT_ALLOWED_COMMANDS.has(command)) {
    return `git subcommand is not allowed: ${command || '<empty>'}`;
  }
  const cmdIndex = args[0] === '-C' ? 2 : 0;

  // 二级子命令约束：主命令后第一项若是子动词或受限选项必须在白名单
  // '--' 是路径段分隔符，遇之跳入路径豁免（如 checkout -- file 不算二级子命令）
  // checkout 特例：只校验选项式（-b 等），非选项分支名/文件名不约束（任意字符串无法白名单）
  const allowedSubs = GIT_ALLOWED_SUBCOMMANDS[command];
  const next = args[cmdIndex + 1];
  if (allowedSubs && next && next !== '--') {
    const isOption = next.startsWith('-');
    const skipSubverb = command === 'checkout' && !isOption;
    if (!isOption && !skipSubverb) {
      if (!allowedSubs.has(next)) return `git ${command} subcommand is not allowed: ${next}`;
    } else if (isOption && next.startsWith('--')) {
      const branchFmtOk = command === 'branch' && next.startsWith('--format=');
      if (!branchFmtOk && !allowedSubs.has(next)) return `git ${command} option is not allowed: ${next}`;
    }
  }

  // 选项黑名单 + '--' 后路径段豁免
  let inPath = false;
  for (let i = cmdIndex + 1; i < args.length; i++) {
    const a = args[i];
    if (inPath) continue;
    if (GIT_PATH_OPTIONS.has(a)) { inPath = true; continue; }
    const key = a.split('=')[0];
    if (GIT_BLOCKED_OPTIONS.has(key)) {
      return `git option is blocked for security: ${key}`;
    }
  }
  return null;
}
