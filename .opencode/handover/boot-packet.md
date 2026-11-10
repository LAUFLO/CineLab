# CineLab · Boot Packet

> **下一会话优先**：等待/处理用户整体验收反馈；Agnes 视频队列恢复后补测；推送前先同步 origin/main。

## 状态

2026-11-10：CineBot 整体自验收通过。

- 画布：无空格 `用@` 引用素材、四类模型选择、生成提案模型覆盖、引用 chip 清空。
- 剪辑室：设置转场工具、思考过程、时间线写入、回合撤销正常。
- 技能：项目覆盖、references/assets 上传按钮、文件删除、管理入口正常。
- 上下文：圆环、压缩确认、summary 注入、会话历史正常。
- 会话：删除与二次确认正常。
- `@` / `/` 支持方向键、Enter、Esc。

37 文件 260 测试通过，`typecheck` / `build` 通过。`feat/agent-runtime` 领先 `origin/main` 29 个提交、落后 11 个，未推送。

## Frontier

1. 用户验收反馈与修复（下一项）
2. Agnes 视频补测
3. 推送前同步 origin/main

## Gates

- G-AGENT-VIDEO：Agnes Video 2.5 Flash 队列 503，待恢复重试。
- G-AGENT-MAIN：origin/main 最新 8d6a4fb，落后 11 个提交；推送前先同步，重点检查 StudioNodeView / CineNodeView / AudioPlayer / TimelinePane / canvas store / film-study / preload / ipc-contract / provider 参数配置冲突。

## 证据

`.opencode/handover/evidence/` 下 `AGENT-ACCEPTANCE-1.md`、`SKILLS-FILES-1.md`、`AGENT-UI-REFINE-1.md`、`AGENT-ASSET-REFS-1.md`、`AGENT-CONTEXT-*.png`、`SKILLS-UPLOAD-1.png`、`AGENT-*-1.md`、`STAGE-*-1.md`、`CLIP-ADVANCED-TOOLS-1.md`。

## 已知缺口

- 无独立 `film` Agent 工具集/入口；拉片仍以画布节点和界面操作为主。
- 导演台没有独立 `stage` profile UI，当前由 canvas profile 使用 `stage_*` 工具。
- 原生技能文件选择对话框未自动化；导入函数与 UI 按钮已验证。
- 上下文预算固定 32K、3 字符≈1 token。
- Agnes Video 可能 503。

## 关键 lessons

- 技能文件上传只允许 references/assets；同名覆盖并返回 overwritten；删除不允许 SKILL.md。
- 同名技能覆盖用 cloneSkill 递归复制到更高优先级作用域，并清除目标旧 override。
- CineBot 模型选择分文本/生图/生视频/音频；生成提案按目标类型覆盖模型。
- 上下文压缩 v1：3 字符≈1 token、32K 固定预算、保留最近 6 条、summary 存 coveredMessages。
- `@` 引用素材、`/` 打开技能；引用随 `agent:chat.references` 注入系统提示。
- 生成引用素材时先登记提案再改画布；素材节点、连线和提示词一起撤销。
- 工具过程折叠为「思考过程」，不展示 JSON。
- 长任务工具单独放宽超时；回合取消时取消转写/导出。

## 设计约定

- CineBot 面板为 LibTV 风格：`CineBot · 会话标题`、上传/模型/权限/技能 chip、上下文圆环、圆形发送按钮。
- 输入框 `@` 引用素材、`/` 选择技能。
- 技能覆盖优先 project > global > builtin；内置技能只读。
- 主题只通过 `styles/tokens.css` 的 CSS 变量。
