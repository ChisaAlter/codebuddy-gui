## 背景与决策

`/effort` 是 CLI 服务端斜杠命令，接受 `low | medium | high | xhigh | max | ultracode`，底层调用 `sessionManager.setOverrideThinking(...)`。程序侧等价接口是 `session/set_config_option`（`configId:"thought_level"`），接受 `disabled | enabled | minimal | low | medium | high | xhigh | max`。两者对 5 个档位完全等价；分歧在 `ultracode`（仅 `/effort` 独有，复合模式）和 `minimal`/`enabled`/`disabled`（仅 `thought_level` 独有）。

已确认采用**档位 + ultracode 混合**方案：
- `low / medium / high / xhigh / max` → 通过 `session/set_config_option`（`configId:"thought_level"`）静默设置，不污染聊天历史。
- `ultracode` → 发送 `/effort ultracode` 斜杠命令（与手动输入效果一致），会留下一条命令消息。

GUI 已在 `src/store/slices/sessions-chat.js:84` 解析 `thought_level`，但未存入 runtime、未发送。本方案补齐这条链路。

## 实现计划

### 1. 扩展 thread runtime（`src/store/helpers/thread-runtime.js`）
- `emptyThreadRuntime()` 增加：`thoughtLevel: null,` 和 `thoughtLevelOptions: [],`。
- `ACTIVE_THREAD_RUNTIME_KEYS` 末尾追加 `'thoughtLevel', 'thoughtLevelOptions',`。
- 这两个 key 经 `patchThreadRuntime`/`activateThreadRuntime` 现有逻辑自动同步到顶层 store，无需改 `store.js`。

### 2. 让 `applySessionConfigUpdate` 落地 `thought_level` 的选项与当前值（`src/store/slices/sessions-chat.js:84`）
将
```js
if (option.id === 'thought_level') next.thoughtLevel = option.currentValue;
```
替换为
```js
if (option.id === 'thought_level') {
  next.thoughtLevel = option.currentValue;
  const opts = configOptionChoices(option);
  if (Array.isArray(opts) && opts.length) {
    next.thoughtLevelOptions = opts
      .map((o) => {
        const id = o?.value ?? o?.id;
        return id ? { id, name: o?.name || o?.label || id } : null;
      })
      .filter(Boolean);
  }
}
```
两条路径（`handleSessionUpdate` line 93、`handleThreadSessionUpdate` line 193）均经过此函数，自动覆盖。

### 3. 新增 store action `setThoughtLevel`（`src/store/slices/sessions-chat.js`，紧跟 `setMode` 之后约 line 1011）
复刻 `setMode` 结构，仅替换方法与字段：
- 前置检查 `threadResponseInProgress`。
- 占用 `queueSessionSettingOperation(\`${threadId}:thought_level\`, …)`。
- `await client.request('session/set_config_option', { sessionId, configId: 'thought_level', value });`
- 成功后 `patchThreadRuntime(threadId, { thoughtLevel: value })`；若为当前活跃会话再 `set({ thoughtLevel: value })`。
- **不**写入 `updateThreadRecord`（`thought_level` 是会话级运行时状态，新会话回归默认，不持久化到会话记录）。
- 错误处理同 `setMode`：失败 `set({ error: error.message })`，返回 false。

### 4. `ultracode` 走 `sendPrompt('/effort ultracode')`
不在 store 新增 action。在 `ReplicaChatView` 的 `changeSessionSetting` 里，当 `kind === 'effort'` 且 `value === 'ultracode'` 时调用已有的 `sendPrompt('/effort ultracode')`（与手动输入完全等价）。成功后本地 `setShowEffortPicker(false)` 并乐观更新 `thoughtLevel` 为 `'ultracode'`；服务端随后通过 `config_option_update` 回推的 `thoughtLevel` 会覆盖（`ultracode` 实际落 `xhigh` + meta，回推值会校正显示）。
- 其它档位走 `setThoughtLevel(value)`。
- `sendPrompt` 已在 `ReplicaChatView` 顶层组件读取（line 1167），需透传到 `ChatComposer`。

### 5. 在 `ReplicaChatView.jsx` 接线
**5.1 读取状态与 action（约 line 1185，与 `setModel`/`setMode` 并列）**
```js
const setThoughtLevel = useStore((s) => s.setThoughtLevel);
const thoughtLevel = useStore((s) => s.thoughtLevel);
const thoughtLevelOptions = useStore((s) => s.thoughtLevelOptions);
const sendPrompt = useStore((s) => s.sendPrompt); // 已存在于 line 1167，复用即可
```
新增本地 state：`const [showEffortPicker, setShowEffortPicker] = useState(false);`（紧邻 `showModePicker` line 1198）。
在 `useEffect` 重置块（line 1238-1239）末尾追加 `setShowEffortPicker(false);`。

**5.2 派生选项与当前名称**（参照 `modeOptions`/`currentModeName` line 1241-1255）
- `effortOptions = useMemo(...)`：以服务端回推的 `thoughtLevelOptions` 为准（限定在 5 档内）；若为空回退完整列表 `[{id:'low',name:'Low'},{id:'medium',name:'Medium'},{id:'high',name:'High'},{id:'xhigh',name:'Xhigh'},{id:'max',name:'Max'}]`；末尾固定追加 `{ id:'ultracode', name:'Ultracode' }`。
- `currentEffortName`：从 `effortOptions` 按 `id === thoughtLevel` 取 `name`，回退到 `thoughtLevel` 或 `'思考'`。若 `thoughtLevel` 是 `enabled` 显示「思考：开」、`disabled` 显示「思考：关」、`ultracode` 显示「Ultracode」。

**5.3 扩展 `changeSessionSetting`（line 1290-1341）**
- `label` 改为：`kind === 'model' ? '模型' : kind === 'mode' ? '模式' : '思考强度'`。
- 执行分支：
  ```js
  let changed;
  if (kind === 'model') changed = await setModel(value);
  else if (kind === 'mode') changed = await setMode(value);
  else if (kind === 'effort') {
    if (value === 'ultracode') {
      changed = await sendPrompt('/effort ultracode');
    } else {
      changed = await setThoughtLevel(value);
    }
  }
  ```
- 成功后关闭对应 picker：`model`→`setShowModelPicker(false)`、`mode`→`setShowModePicker(false)`、`effort`→`setShowEffortPicker(false)`。
- deps 数组追加 `setThoughtLevel`, `sendPrompt`。
- 注意 `changeSessionSetting` 现有前置守卫会拦截 `isAwaitingResponse` 等状态——`ultracode` 也走同守卫，避免响应进行中误发命令。

**5.4 透传 props**
- 顶层 → `ChatComposer`（line 1894 附近）：追加 `showEffortPicker`, `setShowEffortPicker`, `effortOptions`, `thoughtLevel`, `currentEffortName`，`sendPrompt`（`changeSessionSetting` 已透传）。
- `ChatComposer` 解构（line 1970 附近）：对应新增参数。

### 6. 编辑器底栏右侧组新增下拉按钮（`src/components/ReplicaChatView.jsx`，line 2290-2335 的 `<div className="flex items-center gap-1.5">` 内）
在模型选择器 `<div className="relative">…</div>`（line 2291-2335）**之前**插入新的同结构 `<div className="relative">`，视觉上位于「模型左边」：
- 按钮样式与模型选择器一致（pill、`px-2.5 py-1 text-xs`），显示 `currentEffortName || '思考'`；点击 `setShowEffortPicker(!showEffortPicker)`。
- `disabled` 条件同模型选择器：`sessionSelectionBusy || connectionState !== 'connected' || sessionResponseBusy`。
- 弹层：`absolute bottom-full right-0 mb-1 z-20 w-44 …`（沿用模型弹层样式）；`effortOptions.map(o => <button … onClick={() => changeSessionSetting('effort', o.id)} …>{o.name}</button>)`；选中项 `color: var(--color-accent-blue)`。`ultracode` 项可加一个小标记或描述行（可选，简单起见同其它项即可）。
- 背景遮罩 `<div className="fixed inset-0 z-10" onClick={() => setShowEffortPicker(false)} />`。

放在模型左边：模型名通常较长，靠近发送键更顺手；短 pill 居左与左侧 mode picker 对称。

### 7. 边界与兼容
- `session/set_config_option` 在 CLI ≥ 2.122.0（本仓库最低要求）可用。
- `thoughtLevel` 为空时下拉显示「思考」，展开回退 5 档 + ultracode；用户选择后服务端 `config_option_update` 校正。
- 服务端回推 `options` 会按模型过滤（如某些模型不支持 `max`），下拉以回推为准；`ultracode` 始终追加，若模型/工作流禁用则发送 `/effort ultracode` 时服务端会返回错误提示（`/effort ultracode is unavailable …`），由现有 chatError 路径显示。
- 不持久化到 `threadsById` 会话记录：切会话时随 `config_option_update` 刷新，符合 CLI「每会话独立、新会话回归默认」语义。
- 设置页 `ReplicaSettingsView.jsx` 的全局 `reasoningEffort` 下拉框保持不变（全局默认值，与本会话级下拉框职责不同）。

## 不修改的部分
- `/effort` 斜杠命令行为不变。
- Electron 主进程、`acp.js` 不改动（`client.request` 已是通用 JSON-RPC 通道；`sendPrompt` 已存在）。

## 验证方式
1. 连接项目，底栏出现「思考强度」pill，默认显示当前 `thoughtLevel`。
2. 选 `High`：pill 立即变「High」，无报错、聊天历史无新消息；后续回复体现高强度思考。
3. 选 `Ultracode`：聊天里出现一条 `/effort ultracode` 消息，服务端回 `ultra_effort_enter` 提示；pill 显示「Ultracode」。
4. 切换会话再切回：pill 显示该会话自己的 `thoughtLevel`。
5. 切换模型后下拉可选项随服务端 `options` 变化。
6. 响应进行中下拉被禁用（与 model picker 一致）。