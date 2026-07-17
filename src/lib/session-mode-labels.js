const MODE_LABELS = {
  default: '始终询问',
  acceptedits: '接受编辑',
  plan: '计划模式',
  bypasspermissions: '跳过权限确认',
  dontask: '不再询问',
  auto: '自动执行',
  delegate: '协调模式',
  fullaccess: '完全访问',
  work: '工作模式',
  ignore: '继承主会话模式',
  alwaysask: '始终询问',
  autoapprovefileedits: '接受编辑',
  planmode: '计划模式',
  bypasspermissionsmode: '跳过权限确认',
  noprompts: '不再询问',
  automode: '自动执行',
  delegatemode: '协调模式',
  fullaccessmode: '完全访问',
  workmode: '工作模式',
};

function normalizeModeKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_'-]+/g, '');
}

export function getSessionModeLabel(mode, fallback = '') {
  const id = typeof mode === 'string' ? mode : mode?.id || mode?.modeId || mode?.value;
  const name = typeof mode === 'string' ? '' : mode?.name || mode?.label;
  return MODE_LABELS[normalizeModeKey(id)]
    || MODE_LABELS[normalizeModeKey(name)]
    || name
    || id
    || fallback;
}
