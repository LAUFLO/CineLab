# CineLab · Boot Packet

> **下一会话优先**：整体验收与回归修复；随后补技能文件上传/覆盖快捷操作；推送前先同步 origin/main。

## 状态

2026-11-10：CineBot UI 精修、上下文圆环/手动压缩、多能力模型选择、@ 引用、/ 技能、会话删除均已完成。

- 面板底边与底部工具栏对齐；发送按钮 30px。
- 权限/技能浮窗从按钮上方居中展开；删除头部重复设置按钮。
- 会话支持删除（JSONL + 提案 + 二次确认）。
- 模型选择分文本/生图/生视频/音频；生成提案按目标类型使用已选模型。
- 输入 `@` 引用画布/资产库素材，输入 `/` 选择技能，支持方向键/Enter/Esc。
- 发送按钮左侧上下文圆环；点击确认后压缩旧对话，保留最近 6 条，摘要写入 session JSONL，运行时注入摘要。
- 运行时加载同会话历史（user/assistant，工具消息不进入上下文）。

37 文件 258 测试通过，`typecheck` / `build` 通过。`feat/agent-runtime` 领先 `origin/main` 26 个提交、落后 11 个，未推送。

## Frontier

1. 整体验收与回归修复（下一项）
2. 技能文件上传与覆盖快捷操作
3. Agnes 视频补测
4. 推送前同步 origin/main

## Gates

- G-AGENT-VIDEO：Agnes Video 2.5 Flash 队列 503，待恢复重试。
- G-AGENT-MAIN：origin/main 最新 8d6a4fb，落后 11 个提交；推送前先同步，重点检查 StudioNodeView / CineNodeView / AudioPlayer / TimelinePane / canvas store / film-study / preload / ipc-contract / provider 参数配置冲突。

## 证据

`.opencode/handover/evidence/` 下 `AGENT-UI-REFINE-1.md`、`AGENT-ASSET-REFS-1.md`、`AGENT-CONTEXT-*.png`、`AGENT-*-1.md`、`STAGE-*-1.md`、`CLIP-ADVANCED-TOOLS-1.md`、`AGENT-CINEBOT-*.png`。

## 关键 lessons

- CineBot 面板底边 `bottom: 16px`，与底部工具栏对齐；发送按钮 30px。
- 模型选择分文本/生图/生视频/音频；`generation_propose` 用 `scope.generationModels` 覆盖目标类型模型。
- 上下文压缩 v1：3 字符≈1 token、32K 固定预算、保留最近 6 条、summary 存 `coveredMessages`；失败不落盘。
- 圆环只统计对话与摘要，不含系统提示、技能和工具结果。
- `@` 引用素材、`/` 打开技能；引用随 `agent:chat.references` 注入系统提示。
- 生成引用素材时先登记提案再改画布；素材节点、连线和提示词一起撤销。
- 工具过程折叠为「思考过程」，不展示 JSON。
- 长任务工具单独放宽超时；回合取消时取消转写/导出。

## 设计约定

- CineBot 面板为 LibTV 风格：`CineBot · 会话标题`、上传/模型/权限/技能 chip、上下文圆环、圆形发送按钮。
- 输入框 `@` 引用素材、`/` 选择技能。
- 生成引用：画布用 `refNodeIds`，资产库用 `libraryRefs`，本地附件用附件 `nodeId`。
- 主题只通过 `styles/tokens.css` 的 CSS 变量。
