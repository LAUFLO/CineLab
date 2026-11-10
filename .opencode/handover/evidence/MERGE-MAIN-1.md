# MERGE-MAIN-1 · 同步 origin/main 并解决冲突

日期：2026-11-10
状态：完成，待推送分支和开 PR
范围：`origin/main` 9f4511d 合并进 `feat/agent-runtime`

## 1. 合并结果

```text
合并提交：5b4f0ea merge: sync origin/main into feat/agent-runtime
修复提交：a5a0ced fix: write timeline exports to merged studio node
落后：0 个提交
领先：31 个提交
```

合并前备份分支：

```text
backup/agent-runtime-before-main-merge
```

## 2. 冲突与处理

### 2.1 `AGENTS.md`

保留双方文档条目：

- main 的「剪辑室合并成片方案」
- 分支的导演台 / Agent / 剪辑 / 拉片文档条目

### 2.2 `.opencode/handover/state.json`

- 保留当前 Agent 阶段状态。
- 更新时间戳，合并 main 的完成项。
- 未使用 main 的旧 M7 phase 覆盖当前 Agent 状态。

### 2.3 `src/main/ipc/generate.ts`

- 保留分支拆分后的薄 IPC：`generate:run` 只调用 `startGeneration`。
- 丢弃 main 的旧内联生成逻辑。
- 把 main 的两处改动移植到 `src/main/engine/start-generation.ts`：
  - 图片输入错误文案改为「该模型不支持图片输入，请在设置 → 模型 → 输入能力中勾选「图片」」。
  - `generateText` 调用增加 `refs`，支持多模态文本模型图片输入。

### 2.4 `src/renderer/src/studio/InspectorPane.tsx`

- 以 main 的「属性 / 画面 / 音频」分页为基础。
- 删除旧的「助手」分页、`AssistantPane` import 和分支，因为 CineBot 已改为全局浮窗。
- 保留 main 新增的音频、画面、关键帧等分页内容。

### 2.5 `src/renderer/src/stores/canvas.ts`

以 main 的新画布能力为基础，重新叠加 Agent 需要的改动：

- `StageNode` 类型、`isStageNode`、`addStageNode`、`patchStageNode`。
- `commandTurns`、`applyCommands`、`endCommandTurn`。
- `pasteNodes` / `duplicateSelection` 支持 stageDocs。
- `groupSelection` / `ungroup` 支持 turnId，保持一轮 Agent 一条撤销历史。
- 保留 main 新增的 edge references、studio film merge、音频/剪辑室逻辑。

### 2.6 `src/renderer/src/styles/global.css`

- 以 main 的样式为基础。
- 重新移除旧 `.bottombar__agent`。
- 重新加入 stage 节点样式和 stage handle 隐藏规则。

### 2.7 自动合并文件

以下文件自动合并后通过类型检查：

- `preload/index.ts`
- `shared/ipc-contract.ts`
- `shared/canvas-schema.ts`
- `shared/project-schema.ts`
- `shared/timeline-schema.ts`
- `SettingsPanel.tsx`
- `AddNodeMenu.tsx` / `Canvas.tsx` / `NodeContextMenu.tsx`
- `PromptBar.tsx`
- main 的音频、拉片、模型配置、画幅相关文件

## 3. 合并后修复

main 把成片从独立 film 节点合并进 studio 节点，`applyFilmOutput` / `patchFilmNode` 已不存在。

`src/renderer/src/agent/timelineBridge.ts` 的 `timeline_export` 改为：

- 调用 `applyStudioOutput(studioNodeId, output)`。
- 调用 `patchStudioNode(studioNodeId, { upstreamAck })`。
- 工具结果返回 `studioNodeId` 和 `outputId`，不再返回 `filmNodeId`。

## 4. 验证

```text
40 test files, 277 tests passed
typecheck 通过
build 通过，主进程约 546KB
```

隔离实例 smoke test：

- 项目正常打开，无报错。
- 画布 15 个节点正常显示。
- CineBot 浮窗正常打开，模型 chip、上下文圆环正常。
- 剪辑室可进入，6 个片段正常。
- 检查器分页为「属性 / 画面 / 音频」，旧「助手」分页已移除。
- CineBot 浮窗在剪辑室上方正常显示。

## 5. 下一步

1. 推送 `feat/agent-runtime` 到 origin。
2. 创建到 main 的 PR。
3. PR 合并后，在 main 上继续优化已知缺口。
