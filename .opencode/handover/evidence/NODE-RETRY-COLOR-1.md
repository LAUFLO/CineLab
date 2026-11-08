# 失败节点手动重试与状态颜色

日期：2026-11-08
关联：`NODE-RETRY-COLOR-1`

## 手动重新生成

所有节点类型（文本 / 图片 / 视频 / 音频）共用 `CineNodeView`，在失败状态显示：

- 错误信息
- 「重新生成」按钮

实现：

- 从 `generation-history` 中取该节点最近一次 `GenerateRequest`
- 点击后立即把节点置为 `queued`，隐藏按钮，避免重复点击
- 调用 `useGenerationStore.run(entry.request)` 复用原提示词、模型、参数、引用
- 历史记录不存在时提示「找不到上次生成参数，请在提示词栏重新生成」

实测：

- 注入一条失败历史（模型 `missing/missing`）
- 点击「重新生成」
- 历史 `createdAt` 更新为当前时间
- 节点重新进入失败状态并显示新的接口错误

## 状态颜色

之前 `--success` 和 `--warning` 都是灰色，导致「已完成」没有完成感。

调整 token：

- 深色主题：`--success: #4ade80`、`--warning: #fbbf24`
- 浅色主题：`--success: #16a34a`、`--warning: #d97706`

实测：

- 「已完成」徽标颜色 `rgb(74, 222, 128)`
- 「失败」徽标颜色 `rgb(239, 68, 68)`

## 逐帧拉片入口方案更新

采纳「视频工具栏 → 创建拉片节点 → 节点内进入拉片室」的形态，已更新 `docs/film-study-plan.md`：

- 新增 `study` 节点类型
- 拉片节点显示抽帧进度、帧数、段落数
- 节点内按钮打开拉片室浮窗
- 拉片节点不参与生成、引用和 Prompt Bar

## 验证

```text
corepack pnpm typecheck  通过
corepack pnpm test       7 files / 21 tests 通过
corepack pnpm build      通过
```
