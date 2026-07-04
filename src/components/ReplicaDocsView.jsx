import React, { useMemo, useState } from 'react';

const DOC_SECTIONS = [
  {
    group: '入门指南',
    items: ['概述', '快速开始', '安装指南', '常见工作流', '交互模式', '无头模式', '故障排除', '最佳实践', '动态工作流'],
  },
  {
    group: '配置',
    items: ['设置', '模型配置', '记忆', '状态行配置', '终端配置', '环境变量', '目录结构说明'],
  },
  {
    group: '高级功能',
    items: ['监控', 'IDE 集成', 'ACP 协议集成', 'MCP 使用文档', '工具延迟加载覆盖', '斜杠命令', '自定义快捷键', '子代理', 'Agent Teams', 'Skills 功能', 'Hooks 使用指南', '插件系统', '插件市场', '检查点', 'Git Worktree 支持', '远程控制', 'Web UI', 'Daemon 模式', '自动化', 'Goal', '定时任务'],
  },
  {
    group: '安全',
    items: ['安全概述', '身份和访问管理', '权限模式', '权限规则', 'Bash 沙箱'],
  },
  {
    group: '参考文档',
    items: ['CLI 命令参考', 'Hooks 配置参考', '插件 API 参考', '成本管理', '工具参考', 'HTTP API (Beta)', 'SDK', 'Python SDK 参考', 'TypeScript SDK 参考'],
  },
];

const DOC_CONTENT = {
  '概述': {
    title: '概述',
    paragraphs: [
      'CodeBuddy Code 是基于腾讯云 AI 技术的智能编程工具，深度集成腾讯云生态，提供从代码编写到项目部署的全链路 AI 辅助。',
      '它的目标是让你用自然语言驱动整个开发与运维生命周期，而不是停留在一个只会聊天的界面。',
    ],
    bullets: [
      '终端原生工作流，无缝接入本地工程环境。',
      '围绕会话、工具、权限、插件、监控构建完整工作台。',
      '支持 Web UI、远程控制、自动化与定时任务等能力。',
    ],
  },
  '快速开始': {
    title: '快速开始',
    paragraphs: [
      '启动 CodeBuddy Code 后，可以直接从对话、终端、编辑器和画布开始工作。',
      '推荐先确认模型、模式、工作区路径，再进入实际编码或自动化任务。',
    ],
    bullets: [
      '检查连接状态与当前工作区。',
      '选择模型和权限模式。',
      '从新对话、终端或编辑器进入主工作流。',
    ],
  },
  '监控': {
    title: '监控',
    paragraphs: [
      '监控页聚合认证、Daemon、资源占用、Channels 与 Workers 等运行态信息。',
      '适合快速确认实例健康状态与后台进程分布。',
    ],
    bullets: [
      '认证与网关状态',
      'CPU / Memory / Disk 指标',
      'Workers 与实例健康',
    ],
  },
};

function getDoc(name) {
  return DOC_CONTENT[name] || {
    title: name,
    paragraphs: ['该文档条目已纳入本地文档中心结构，但正文尚未完整同步。'],
    bullets: [],
  };
}

export default function ReplicaDocsView() {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState('概述');

  const filteredSections = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return DOC_SECTIONS;
    return DOC_SECTIONS.map((section) => ({
      ...section,
      items: section.items.filter((item) => item.toLowerCase().includes(q)),
    })).filter((section) => section.items.length > 0 || section.group.toLowerCase().includes(q));
  }, [query]);

  const doc = getDoc(selected);

  return (
    <div className="flex min-h-0 flex-1 bg-[var(--color-bg-primary)]">
      <div className="flex min-h-0 w-[320px] shrink-0 flex-col border-r border-[var(--color-border-default)] bg-[var(--color-bg-secondary)]">
        <div className="border-b border-[var(--color-border-default)] px-5 py-4">
          <div className="text-lg font-semibold text-white">文档中心</div>
          <div className="mt-1 text-sm text-[var(--color-text-secondary)]">CodeBuddy Code CLI v2.114.2</div>
        </div>
        <div className="border-b border-[var(--color-border-default)] px-5 py-4 space-y-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索文档..."
            className="input-field"
          />
          <div className="flex items-center gap-3">
            <button className="btn-ghost" onClick={() => setQuery('API')}>API 文档</button>
            <button className="btn-ghost" onClick={() => window.open('about:blank', '_blank')}>独立窗口打开</button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          {filteredSections.map((section) => (
            <div key={section.group} className="mb-4">
              <div className="mb-2 px-2 text-xs text-[var(--color-text-muted)]">{section.group}</div>
              <div className="space-y-1">
                {section.items.map((item) => (
                  <button
                    key={item}
                    className="block w-full rounded-md px-3 py-2 text-left text-sm transition"
                    style={{
                      background: selected === item ? 'rgba(0,120,212,0.12)' : 'transparent',
                      color: selected === item ? '#ffffff' : 'var(--color-text-secondary)',
                    }}
                    onClick={() => setSelected(item)}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {!filteredSections.length ? <div className="px-2 text-sm text-[var(--color-text-muted)]">未找到相关文档</div> : null}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="border-b border-[var(--color-border-default)] px-6 py-4">
          <div className="text-2xl font-semibold text-white">{doc.title}</div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
          <div className="prose max-w-none">
            {doc.paragraphs.map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
            {doc.bullets.length ? (
              <ul>
                {doc.bullets.map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
