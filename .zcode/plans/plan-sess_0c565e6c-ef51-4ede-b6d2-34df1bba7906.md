## 目标

对齐 CodeBuddy WebUI 的思考区可读性：少而连续的可折叠「思考中 / 已思考」区块，而不是一长串「已思考（用时 0 秒）」碎片行。

参考截图差异：
- **WebUI**：单段（或工具前后各一段）连续长文案；折叠头「已思考（用时 12 秒）」；左侧竖线 + 次要色正文。
- **我们**：同一次回复被拆成多条独立 `ThinkingCard`，时长常显示 0 秒，视觉像一串状态日志。

---

## 根因（已核实）

| 问题 | 位置 | 说明 |
|------|------|------|
| 思考按条渲染、不合并 | `groupTimelineForDisplay` | 只聚合 tool/checkpoint 等，`thinking` 原样透出 |
| 合并键过严 | `mergeThinkingChunk` + `findLastByMessageId` | 无 `messageId` 时每个 chunk 都新建条目 |
| 工具后故意新开段 | `mergeThinkingChunk` + 测试 | tool 后同 id 思考会新开段（保留，贴近 WebUI 的 思考→工具→思考） |
| 用时 0 秒 | `ThinkingCard` + `finalizeThinkingEntry` / 历史 normalize | `completedAt ≈ createdAt` 时仍显示「用时 0 秒」 |
| 样式已接近 WebUI | `.thinking-block*` | 碎片多时再好的样式也会像列表噪音 |

---

## 方案（推荐：显示层合并 + 合并兜底 + 时长/文案打磨）

不改 ACP 协议，不把工具前后的思考硬并成一整段（保留 WebUI 的 思考 / 工具 / 思考 结构）。

### 1. 显示层：连续 thinking 合并（主修复）

**文件：** `src/lib/timeline.js` — `groupTimelineForDisplay`

在当前 turn 内，把**相邻**的 `type === 'thinking'` 条目合并为一条展示用条目，例如：

```js
{
  type: 'thinking',           // 或 'thinking_group'，UI 统一走 ThinkingCard
  id: `thinking-group-${first.id}`,
  content: parts.join('\n\n'), // 非空段用空行拼接，贴近连续散文
  streaming: parts.some(p => p.streaming),
  createdAt: first.createdAt,
  completedAt: last.completedAt ?? null,
  messageId: first.messageId,
  items: parts,               // 可选，调试/测试用
}
```

规则：
- **仅合并连续 thinking**；中间夹 tool_call / execution_group / message 等则断开。
- 流式中：任一段 `streaming` → 整组 streaming，并保留自动滚底。
- 空 content 段跳过拼接。

这样历史里已碎片化的数据也能立刻变干净，无需重写 store。

### 2. 数据层：缺 messageId 时合并兜底

**文件：** `src/lib/timeline.js` — `mergeThinkingChunk`

在现有「同 messageId 且中间无 execution」逻辑之外增加：

1. **`messageId` 为空**：若 timeline 末尾存在仍在 `streaming` 的 thinking → 追加 content，不新建。
2. **可选加固**：`messageId` 为空、末尾是刚结束的 thinking，且中间无 execution / message / interruption / question → 追加到该段并重新 `streaming: true`（修「每个完整 thought 事件都成新行」）。

**保持不变：** 工具调用后同 `messageId` 新开 thinking 段（现有测试 `工具调用之后同 messageId 的后续思考仍创建 thinking 段`）。

### 3. ThinkingCard 可读性与时长

**文件：** `src/components/ReplicaChatView.jsx` — `ThinkingCard`

- 时长文案与 `formatThinkingDuration` 对齐：
  - 流式：继续「思考中」+ 紫点（可选副标秒数）。
  - 完成：`<1 秒` / `N 秒` / `N 分 M 秒`；**不要**再出现「用时 0 秒」。
- `content` 为空且已完成：不渲染卡片（或仅不渲染 body）。
- 合并后的长文案：继续 `pre-wrap` + 左边框 + `max-height: 400px`（与现 CSS 一致）；完成默认折叠、流式默认展开（已有逻辑保留）。
- 点击折叠行为不变。

**文件：** `src/lib/i18n.js`（如需）

- 若改成 `已思考（用时 <1 秒）` / 动态 duration 字符串，微调 `thinking.seconds` 或改为 `thinking.doneWithDuration`。

**文件：** `src/index.css`（小打磨，非大改）

- 略减多卡片时的视觉权重：完成态 header 更 muted；组内 content 行高/段间距微调。
- 不引入气泡化思考块，保持 WebUI 的「次要旁注」风格。

### 4. 测试

| 文件 | 覆盖 |
|------|------|
| `tests/unit/timeline.test.js` | 连续 thinking 显示合并；无 messageId 流式追加；工具后仍两段 thinking |
| 现有 duration 相关（如 `chat-cancel.test.jsx`） | 0ms / 缺 completedAt 不显示「0 秒」 |
| 如有 ThinkingCard 单测 | 默认折叠/展开与空内容 |

### 5. 明确不做

- 不把整轮所有 thinking（跨 tool）合成唯一一张卡（与 WebUI 图2 不一致）。
- 不为 thinking 上完整 markdown 渲染（WebUI 为纯文本；避免与正文抢视觉）。
- 不改 execution_group 对 tool 的聚合逻辑（已接近 WebUI「N 个工具已执行」）。

---

## 实现顺序

1. `groupTimelineForDisplay` 连续 thinking 合并 + 单测  
2. `mergeThinkingChunk` 无 messageId 兜底 + 单测  
3. `ThinkingCard` 时长文案 + 空内容处理  
4. 必要时 i18n / CSS 微调  
5. 跑相关 unit tests，用一次带多段思考的会话肉眼对比 WebUI

---

## 预期效果（对应你的图3）

- 多条短「已思考（用时 0 秒）」→ **1～少量** 可折叠「已思考（用时 N 秒）」连续正文。  
- 工具前后仍可有两段思考（像 WebUI 图2）。  
- 时长不再刷 0 秒；折叠后聊天主路径更干净，展开后是连贯推理而非碎句列表。