export const NAV_GROUPS = [
  {
    id: 'primary',
    title: 'Primary',
    items: [
      { id: 'chat', label: '对话' },
      { id: 'instances', label: '实例' },
      { id: 'remote-control', label: '远程控制' },
    ],
  },
  {
    id: 'workspace',
    title: '工作区',
    items: [
      { id: 'tasks', label: '任务' },
      { id: 'terminal', label: '终端' },
      { id: 'canvas', label: '画布' },
      { id: 'editor', label: '编辑器' },
      { id: 'changes', label: '变更' },
      { id: 'plugins', label: '插件' },
    ],
  },
  {
    id: 'observability',
    title: '可观测',
    items: [
      { id: 'stats', label: '统计' },
      { id: 'traces', label: '链路' },
      { id: 'monitor', label: '监控' },
      { id: 'metrics', label: '指标' },
      { id: 'logs', label: '日志' },
      { id: 'workers', label: 'Workers' },
    ],
  },
  {
    id: 'preferences',
    title: '配置',
    items: [
      { id: 'settings', label: '设置' },
      { id: 'keybindings', label: '快捷键' },
      { id: 'docs', label: '文档' },
    ],
  },
];

export const SETTINGS_GROUPS = [
  {
    id: 'modelAndReasoning',
    title: '模型与思考',
    items: [
      { key: 'model', label: '默认模型', type: 'text' },
      {
        key: 'reasoningEffort',
        label: '思考强度',
        type: 'select',
        options: [
          ['minimal', 'Minimal'],
          ['low', 'Low'],
          ['medium', 'Medium'],
          ['high', 'High'],
          ['xhigh', 'Extra High'],
          ['max', 'Max'],
        ],
      },
      { key: 'alwaysThinkingEnabled', label: '始终启用 Thinking', type: 'boolean' },
    ],
  },
  {
    id: 'behavior',
    title: '行为',
    items: [
      { key: 'autoCompactEnabled', label: '自动压缩上下文', type: 'boolean' },
      { key: 'includeCoAuthoredBy', label: '包含 Co-authored-by', type: 'boolean' },
      { key: 'fileCheckpointingEnabled', label: '文件检查点', type: 'boolean' },
      { key: 'promptSuggestionEnabled', label: '提示建议', type: 'boolean' },
      { key: 'hookOutputCollapsed', label: '折叠 Hook 输出', type: 'boolean' },
      { key: 'enablePasteImageFromClipboard', label: '允许剪贴板贴图', type: 'boolean' },
      { key: 'enableTerminalProgressBar', label: '终端进度条', type: 'boolean' },
    ],
  },
  {
    id: 'memory',
    title: '记忆',
    items: [
      { key: 'memory.enabled', label: '启用记忆', type: 'boolean' },
      { key: 'memory.autoMemoryEnabled', label: '自动记忆', type: 'boolean' },
    ],
  },
  {
    id: 'language',
    title: '语言',
    items: [
      { key: 'theme', label: '主题', type: 'text' },
      { key: 'language', label: '语言', type: 'text' },
      { key: 'preferredNotifChannel', label: '通知渠道', type: 'text' },
    ],
  },
  {
    id: 'advanced',
    title: '高级',
    items: [
      { key: 'cleanupPeriodDays', label: '会话保留天数', type: 'number' },
      { key: 'imageHistoryRetainRounds', label: '图片保留轮数', type: 'number' },
      { key: 'autoUpdates', label: '自动更新', type: 'boolean' },
      { key: 'enableAllProjectMcpServers', label: '启用全部项目 MCP', type: 'boolean' },
      { key: 'trustAll', label: '信任全部', type: 'boolean' },
      { key: 'statusLine.command', label: '状态栏命令', type: 'text' },
      { key: 'gateway.auth', label: '网关认证', type: 'text' },
    ],
  },
  {
    id: 'sandbox',
    title: '安全沙箱',
    items: [
      { key: 'sandbox.enabled', label: '启用沙箱', type: 'boolean' },
      { key: 'sandbox.autoAllowBashIfSandboxed', label: '沙箱内自动允许 Bash', type: 'boolean' },
      { key: 'sandbox.allowUnsandboxedCommands', label: '允许非沙箱命令', type: 'boolean' },
    ],
  },
];

export function getByPath(obj, path) {
  return path.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

export function formatValue(value) {
  if (typeof value === 'boolean') return value ? '已开启' : '已关闭';
  if (value == null) return '未设置';
  if (Array.isArray(value)) return `${value.length} 项`;
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
