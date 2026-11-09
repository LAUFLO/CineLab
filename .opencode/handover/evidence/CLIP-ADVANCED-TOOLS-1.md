# CLIP-ADVANCED-TOOLS-1 · 剪辑高级 Agent 工具与 CineBot 品牌修正

日期：2026-11-09
状态：完成
范围：自动字幕、删静音、转场、导出四个剪辑 Agent 工具；CineBot 品牌、消息标签与工具状态修正
关联：`CLIP-PROFILE-1`、`AGENT-UI-2`、`AGENT-CONFIRM-1`

## 1. 目标

把剪辑室已有的自动字幕、删静音、转场和导出能力接入通用 AgentRuntime，并修正助手 UI 的两个问题：

- 工具已经结束，但「思考过程」仍显示「执行中」，同时助手文本说「已完成」。
- 消息区出现「你 / 助手」标签；助手需要统一命名为 **CineBot**。

## 2. 新增 Agent 工具

| 工具 | 行为 | 参数 | 确认 |
|---|---|---|---|
| `timeline_auto_subtitles` | 对指定片段或整条时间线转写，创建/复用字幕轨并生成字幕片段 | `clipId?` | 否 |
| `timeline_remove_silence` | 检测并删除静音；指定或选中片段时只处理所在轨道 | `clipIds?`、`paddingMs`、`minDurationMs`、`ripple` | 是 |
| `timeline_set_transition` | 给视觉片段设置/移除片头转场 | `clipId`、`type`、`durationMs` | 否 |
| `timeline_export` | 渲染导出成片，并写回画布成片节点 | `codec` | 是 |

### 2.1 自动字幕

- 先检查 `whisper-runtime` 与 `whisper-model` 是否安装；缺失时返回设置引导。
- 优先使用显式 `clipId`；否则使用当前选中片段；没有选中则转写整条时间线。
- 复用 `timeline.transcribe`，字幕片段使用与手工自动字幕一致的字体、描边和阴影。
- 选中的片段带变速时，字幕时间按 `speed` 映射回时间线。
- 只使用未锁定的字幕轨；没有则新建，轨道数达到上限时明确报错。

### 2.2 删静音

- 复用 `timeline.analyze({ kind: 'silences' })` 和 `buildRemoveSilencePlan`。
- 显式片段或选中片段时，把目标轨道 ID 传给 `buildRemoveSilencePlan`，只切分目标轨道；不再误伤视频、字幕或其他音频轨。
- 没有显式选择时，处理全部未锁定轨道上的视频/音频片段。
- 音频片段或轨道锁定会被拒绝。
- 执行前通过 `confirm_request` 二次确认。

### 2.3 转场

- 支持 `fade`、`dip-black`、`wipe-left`、`wipe-right`、`slide-left`、`slide-right`、`zoom-in`，传 `none` 移除。
- 音频片段、锁定轨道会拒绝。
- 时长限制 100–10000ms，默认 500ms。

### 2.4 导出

- 复用 `timeline.export`，支持 `h264` / `hevc` / `av1`。
- 成功后查找当前剪辑室对应的成片节点，写入新的 `OutputRef`，并更新 `upstreamAck`。
- 导出结果包含文件路径、时长、分辨率、帧率与成片节点 ID。
- 导出前二次确认。

## 3. 长任务与撤销

- 工具超时单独放宽：
  - 自动字幕 15 分钟
  - 删静音 10 分钟
  - 导出 30 分钟
- 长任务执行期间轮询当前回合；用户停止或回合结束时取消 `timeline.transcribe` / `timeline.export`，避免迟到的写操作。
- `isTimelineWriteTool` 只把真正修改时间线文档的工具标记为可撤销：
  - 计入：移动、裁剪、切分、删除、更新、轨道、标记、自动字幕、删静音、转场。
  - 不计入：`timeline_get`、`timeline_select_clips`、`timeline_export`。

## 4. CineBot 与消息状态修正

### 4.1 品牌

- 面板标题：`CineBot · <会话标题>`。
- 空状态：`我是 CineBot`。
- FAB：`aria-label="打开 CineBot"`，`title="CineBot（Ctrl+Shift+A）"`。
- 系统提示：`你是 CineBot，CineLab 的画布助手/剪辑助手`。
- 提案过期、会话未就绪等错误文案统一改为 CineBot。

### 4.2 消息

- 移除「你 / 助手」角色标签。
- 用户消息继续靠右，CineBot 消息靠左。
- 助手消息支持简单行内 Markdown：`**粗体**` 与 `` `行内代码` ``。

### 4.3 工具状态

- `tool_end` 按**最新**匹配 `callId` 的工具消息更新，避免复用 call ID 时更新到旧消息。
- `turn_end` 时把本轮仍为 `running` 的工具兜底：
  - 回合正常完成 → `ok`
  - 取消/失败 → `error`，错误文本「本轮已结束」。
- 系统提示补充：工具报错或用户取消时，不要声称已完成。

## 5. 验证

### 5.1 自动化

```text
36 test files, 251 tests passed
typecheck 通过
build 通过，主进程约 509KB
```

新增测试：

- 四个工具的参数校验。
- 删静音/导出确认原因。
- clip profile 工具暴露；只读模式不暴露导出与删静音。
- `isTimelineWriteTool` 只把时间线写工具计入撤销。

### 5.2 真实 Agnes

- 转场：Agnes 调用 `timeline_set_transition`，视频片段写入 `fade / 500ms`。
- 自动字幕：Agnes 调用 `timeline_auto_subtitles`，真实生成两条字幕：
  - `This is a test for automatic subtitles.` 0–3080ms
  - `The quick brown fox jumps over the lazy dog.` 3080–6920ms
- 删静音：确认卡允许后，真实执行 `timeline_remove_silence`；音频轨被切分，视频与字幕轨保持不变。
- 导出：真实 Agnes 触发 `timeline_export`，生成 `exports/成片-1794235038770.mp4`，时长 7.722s、1280×720、24fps、H.264，成片节点新增输出。
- Agnes 文本接口偶发 `503 queue full`：工具可能已经执行成功，但后续说明文本请求失败；不影响时间线与成片结果。

### 5.3 本地 mock 文本模型

用本地 OpenAI 兼容 mock 服务完整跑通四个工具：

```text
自动字幕 → 2 条字幕，思考过程「完成」
删静音 → 确认卡允许 → 仅音频轨切分，视频/字幕不变
转场 → fade / 500ms
导出 → 成片节点输出 +1，思考过程「完成」，不显示「撤销这一轮」
拒绝导出确认 → 思考过程「未完成 / 用户取消了该操作」
```

截图：

- `.opencode/handover/evidence/AGENT-CINEBOT-1.png`：CineBot 面板、无角色标签、行内代码样式。
- `.opencode/handover/evidence/AGENT-CINEBOT-2.png`：工具被取消后显示「未完成」。
- `.opencode/handover/evidence/AGENT-CINEBOT-EMPTY-1.png`：新对话空状态「我是 CineBot」。
- `.opencode/handover/evidence/AGENT-CINEBOT-CONFIRM-1.png`：导出确认卡。
- `.opencode/handover/evidence/AGENT-CLIP-EXPORT-1.png`：成片节点已生成可导出成片。

## 6. 已知限制

- 自动字幕暂不支持选择语言，沿用 whisper `-l auto`。
- 自动字幕会追加到现有字幕轨，不自动替换旧字幕。
- 删静音按目标轨道处理；如果同时选中视频轨和分离音频轨，需要分别指定或选中对应片段。
- 导出任务没有面板内进度条，只有「思考过程」的运行状态。
- 简单 Markdown 只处理粗体和行内代码，不渲染标题、表格、链接和代码块。
- Agnes 文本接口的 503 仍可能出现；工具执行结果以时间线与成片节点为准。

## 7. 关键文件

- `src/main/agent/tools.ts`
- `src/main/agent/runtime.ts`
- `src/main/agent/__tests__/tools.test.ts`
- `src/renderer/src/agent/timelineBridge.ts`
- `src/renderer/src/agent/agentStore.ts`
- `src/renderer/src/agent/AgentPanel.tsx`
- `src/renderer/src/styles/agent.css`
- `src/shared/timeline-schema.ts`
- `docs/agent-plan.md`
- `docs/agent-architecture-plan.md`
