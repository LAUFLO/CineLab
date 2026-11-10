# CineLab · Boot Packet

> **下一会话优先**：整体验收与回归修复；随后补 Agnes 视频补测；推送前先同步 origin/main。

## 状态

2026-11-10：技能文件上传、删除与同名覆盖已完成。

- 技能 `references/` / `assets/` 支持多文件上传；同名文件覆盖，单次 20 个、单文件 20MB、单次 100MB。
- 技能文件列表支持删除 `references/assets` 文件；`SKILL.md` 不可删。
- 技能详情支持「创建项目覆盖」「创建全局覆盖」，递归复制 SKILL.md/references/assets。
- Agent 技能弹窗底部新增「管理技能」，直达设置 → 技能。
- CineBot UI 精修、上下文圆环/手动压缩、多能力模型、@ 引用、/ 技能、会话删除均已完成。

37 文件 260 测试通过，`typecheck` / `build` 通过。`feat/agent-runtime` 领先 `origin/main` 27 个提交、落后 11 个，未推送。

## Frontier

1. 整体验收与回归修复（下一项）
2. Agnes 视频补测
3. 推送前同步 origin/main

## Gates

- G-AGENT-VIDEO：Agnes Video 2.5 Flash 队列 503，待恢复重试。
- G-AGENT-MAIN：origin/main 最新 8d6a4fb，落后 11 个提交；推送前先同步，重点检查 StudioNodeView / CineNodeView / AudioPlayer / TimelinePane / canvas store / film-study / preload / ipc-contract / provider 参数配置冲突。

## 证据

`.opencode/handover/evidence/` 下 `SKILLS-FILES-1.md`、`AGENT-UI-REFINE-1.md`、`AGENT-ASSET-REFS-1.md`、`AGENT-CONTEXT-*.png`、`SKILLS-UPLOAD-1.png`、`AGENT-*-1.md`、`STAGE-*-1.md`、`CLIP-ADVANCED-TOOLS-1.md`。

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
