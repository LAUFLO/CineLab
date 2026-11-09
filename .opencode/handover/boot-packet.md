# CineLab · Boot Packet

> **下一会话优先**：继续 CineBot UI 精修 WIP——上下文使用圆环与手动压缩；随后做模型选择端到端生成验证与整体验收。

## 状态

2026-11-10 睡前：CineBot UI 精修已推进到 WIP，**未完成**。

已完成并验证：

- 面板底边与底部工具栏底边对齐；发送按钮 30px。
- 会话支持删除（API + 列表删除按钮 + 二次确认）。
- 权限浮窗改到按钮上方居中；技能浮窗从按钮上方展开。
- 删除右上角重复的模型设置按钮。
- 模型选择拆成文本 / 生图 / 生视频 / 音频四组；生成时按 `scope.generationModels` 覆盖目标类型模型。
- 输入 `@` 弹出画布/资产库素材引用；输入 `/` 弹出技能选择。
- Agent 运行时会加载历史对话与 session summary。

仍未完成：

- 发送按钮左侧的上下文使用圆环与手动压缩 UI/IPC。
- 模型选择端到端生成验证。
- `@` / `/` 弹窗键盘导航与细节回归。

当前 256 测试通过，`typecheck` / `build` 通过。分支 `feat/agent-runtime` 领先 `origin/main` 24 个提交、落后 10 个，未推送。

## Frontier

1. 上下文圆环 + 手动压缩（下一项）
2. 模型选择端到端生成验证
3. `@` / `/` 弹窗细节与键盘导航
4. 整体验收
5. Agnes 视频补测
6. 推送前同步 origin/main

## Gates

- G-AGENT-VIDEO：Agnes Video 2.5 Flash 队列 503，待恢复重试。
- G-AGENT-MAIN：origin/main 最新 ef5c0d1，落后 10 个提交；推送前先同步，重点检查 StudioNodeView / CineNodeView / AudioPlayer / TimelinePane / canvas store / film-study / preload / ipc-contract / provider 参数配置冲突。

## 证据

`.opencode/handover/evidence/` 下 `AGENT-ASSET-REFS-1.md`、`AGENT-UI-REFINE-*.png`、`AGENT-*-1.md`、`STAGE-*-1.md`、`CLIP-ADVANCED-TOOLS-1.md`、`AGENT-CINEBOT-*.png`。

## 关键 lessons

- CineBot 面板底边 `bottom: 16px`，与底部工具栏对齐；发送按钮 30px。
- 权限/技能浮窗以触发按钮为锚点，在按钮上方居中；头部不再放模型设置。
- 模型选择分文本/生图/生视频/音频；`generation_propose` 用 `scope.generationModels` 覆盖。
- `@` 引用素材、`/` 打开技能；引用随 `agent:chat.references` 注入系统提示。
- 上下文圆环/手动压缩尚未完成；session summary 与 runtime 历史加载已就绪，但缺少 `agent:session-compact` IPC 和 UI。
- 生成引用素材时先登记提案再改画布；素材节点、连线和提示词一起撤销。
- 助手工具过程折叠为「思考过程」，不展示 JSON。
- 长任务工具单独放宽超时；回合取消时取消转写/导出。

## 设计约定

- CineBot 面板为 LibTV 风格：`CineBot · 会话标题`、上传/模型/权限/技能 chip、圆形发送按钮。
- 模型 chip 打开四类模型选择；生成模型选择按能力独立保存。
- 输入框 `@` 引用素材、`/` 选择技能。
- 生成引用：画布用 `refNodeIds`，资产库用 `libraryRefs`，本地附件用附件 `nodeId`。
- 主题只通过 `styles/tokens.css` 的 CSS 变量。
