# UX 优先落地计划（符合 CodeBuddy GUI 本机 CLI 产品模型）

## 目标
按「本机 CodeBuddy CLI GUI、布局对标 webui、多项目」重标定后的优先级执行：**先改用户能直接感知的体验与真实缺陷**，不做过度安全硬化（不收紧 attachment 任意读、不重做密码只留主进程、不关 DevTools）。

## 范围（本轮做 / 不做）

### 本轮做
| 批次 | 项 | 用户收益 |
|------|-----|----------|
| A 体验 | 确认框 Escape + 打开聚焦 | 键盘可用、防误触时仍可退出 |
| A 体验 | Chat 空态建议改为 button | 键盘可达 |
| A 体验 | 协议类事件中文标签 | 不再露出 `config_option_update` 等英文 |
| A 体验 | Copy 按钮 focus 可见 | 键盘用户能复制 |
| A 体验 | Chat timeline 渲染减负 | 流式回答时输入区/历史更稳 |
| B 正确性 | GUI / 后端 settings 存储键澄清与加固 | 主题/开关不因缓存互相踩 |
| C 可靠 | Windows `codebuddy` 子进程 argv 直 spawn | CLI 维护/插件/沙箱路径更稳 |
| C 回归 | ACP `truncated` 单测 | 长响应中断提示不回退 |
| C 轻量 | `requestCodeBuddy`/`fetchJson` 支持可选 `baseUrl`（默认全局） | 为切项目竞态留钩子，不大改架构 |

### 本轮明确不做
- 代理 port 绑定 runtime、attachment 路径 allowlist、password 不进渲染
- 虚拟列表大改、拆分整个 `store.js`
- 改 timeline 300 条上限（产品取舍，另议）
- 开 CI workflow（除非你后续单独要求）

---

## 实现方案

### A1. `ActionConfirmDialog` 键盘与焦点
**文件:** `src/components/ActionConfirmDialog.jsx`

- `open` 时：Cancel 按钮 `ref.focus()`（危险操作用取消更安全；`danger={false}` 时也可仍聚焦取消，保持简单一致）
- `keydown Escape`：仅当 `!busy` 调用 `onCancel`
- 卸载/关闭时移除监听
- 不改 props API，14 处调用方零改动

**测试:** 新增轻量 `tests/unit/action-confirm-dialog.test.jsx`（Escape / busy 时不取消 / 打开聚焦）

### A2–A4. Chat 可见文案与可访问性
**文件:** `src/components/ReplicaChatView.jsx`

1. **空态芯片**（~1742）：`<span onClick>` → `<button type="button">`，样式保持 pill
2. **协议分隔**（~1060–1076）：映射中文，例如  
   - `config_option_update` → 配置更新  
   - `session_info_update` → 会话信息  
   - `available_commands_update` → 命令更新  
   - `status_change` → 状态变更  
   - `model_update` / `mode_update` / `current_mode_update` → 模型/模式更新  
   - `initialized` → 已初始化（或继续不展示，与 timeline 过滤对齐）
3. **CopyButton**（~88）：`opacity-0` 增加 `focus-visible:opacity-100`（对齐侧栏操作按钮模式）

### A5. Chat 流式性能（低风险）
**文件:** `src/components/ReplicaChatView.jsx`

1. 停止 `{ ...item, showDate }` 克隆破坏引用；改为 `{ item, showDate }` 结构
2. `TimelineItem = React.memo(...)`，比较 `id/type/role/content/streaming/status/completedAt` 等稳定字段
3. 将 **composer（输入区）** 与 **消息列表** 拆成子组件，各自 `useStore` 订阅——流式 token 时减少整页（尤其 textarea）重渲染  
   - 列表组件订 `timeline` / 连接恢复相关  
   - 输入组件订 `draft/input/queue/attachments/...`
4. 不对 markdown 做大重构；若助手气泡 memo 后仍偏重，可再对「已完成且 content 未变」的 markdown 叶子做小 memo

**风险控制:** 不引入虚拟列表；保持 auto-scroll / 队列 / 取消行为不变。现有 `chat-cancel.test.jsx` 必须继续绿。

### B. Settings 键澄清（真缺陷，影响主题/开关）
**文件:**
- `src/lib/gui-settings.js`
- `src/store.js`（`persistSettingsCache` / `loadSettingsFromStorage`）

**策略（不破坏老用户）:**
1. 导出常量：  
   - `GUI_PREFERENCES_KEY = 'codebuddy-gui-preferences'`  
   - `SETTINGS_CACHE_KEY = 'codebuddy-gui-settings'`（后端 settings 离线缓存，**继续使用该键**，避免强制迁键丢缓存）
2. 文档化：两键职责分离；`LEGACY` 仅在 **prefs 缺失时** 用 `normalizeGuiSettings` 抽 GUI 字段迁到 prefs，**绝不删除** settings 缓存键
3. `loadGuiSettings`：若 legacy 解析后全是默认且无任何已知 GUI 字段命中，不要无意义写 prefs 覆盖（可选加固）
4. store 中硬编码字符串改为共享常量；所有写缓存路径继续 `stripGuiSettings`

**测试:** 新增 `tests/unit/gui-settings.test.js`（defaults / prefs 命中 / legacy 迁移 / strip / save 只写 prefs）

### C1. Windows CLI 直 spawn
**文件:** `electron/main.cjs` ~`runCodeBuddyCli`

```js
function runCodeBuddyCli(args, options = {}) {
  const argv = Array.isArray(args) ? args.map(String) : [];
  return runCapturedProcess('codebuddy', argv, options);
}
```

- `runCapturedProcess` 已是 `shell: false`
- 调用方均为已校验/固定 argv，无需改调用点
- 若 Windows 上 `codebuddy.cmd` 出现 ENOENT：在 `error` 分支保留现有「未找到 CLI」文案即可（与现行为一致）；必要时再解析 `where`，本轮先直 spawn（与非 Win 一致）

**不做:** 改 `codebuddy-runtime-manager` 的 serve 启动（风险面更大，另开）

### C2. ACP truncated 单测
**文件:** `tests/unit/acp-stream.test.js`（紧邻现有 stream-ended 用例）

- Mock IPC `requestCodeBuddy` 返回 `{ ok:true, body: partial SSE, truncated:true }` 且无匹配 RPC → 期望抛出含 `意外中断`
- 可选：已匹配 result 后 truncated → 仍返回 result

### C3. 可选 baseUrl（轻量，服务多项目 UX）
**文件:** `src/lib/acp.js`

- `requestCodeBuddy(pathOrUrl, init)`：若 `init.baseUrl` 且 path 相对，则用 `init.baseUrl` 拼 URL，否则 `getApiBase()`
- `fetchJson` 透传
- **不强制** 全库改调用；仅在已捕获 `state.apiBase` 的 store 路径（PTY/settings 已有）逐步受益
- 避免大改 `fs.js`/`ops.js` 全量签名（本轮 UX 优先）

---

## 验证
1. `npm test`（vitest 全量 unit）
2. 重点人工：Chat 流式输入是否跟手；确认框 Esc；主题开关持久；设置页 CLI 命令在 Win 仍可用（dev 环境有 codebuddy 时）
3. 不主动 `npm run build` / e2e（除非 unit 全绿后你要求）

## 提交方式
改完后按逻辑可分 1–2 个 commit（体验 / 设置+CLI+测试），**仅在你明确要求时再 commit**。

## 实施顺序
1. A1–A4（纯 UI，最快可见）  
2. A5（Chat 性能）  
3. B + 单测  
4. C1–C2  
5. C3（可选小补丁）  
6. 跑 `npm test` 修回归  

## 关键路径
- `src/components/ActionConfirmDialog.jsx`
- `src/components/ReplicaChatView.jsx`
- `src/lib/gui-settings.js`
- `src/store.js`（常量与 settings 缓存几处）
- `src/lib/acp.js`（baseUrl / truncated 已有逻辑）
- `electron/main.cjs`（`runCodeBuddyCli`）
- `tests/unit/gui-settings.test.js`（新）
- `tests/unit/action-confirm-dialog.test.jsx`（新）
- `tests/unit/acp-stream.test.js`（补）
- 必要时微调 `tests/unit/chat-cancel.test.jsx`