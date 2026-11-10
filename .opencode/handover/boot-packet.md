# CineLab · Boot Packet

> **下一会话优先**：推送 `feat/agent-runtime` 并创建到 main 的 PR；已知缺口在 PR 合并后继续优化。

## 状态

2026-11-10：`origin/main` 9f4511d 已合并进 `feat/agent-runtime`。

- 合并提交：`5b4f0ea`
- 合并后修复：`a5a0ced`（timeline_export 写回 studio 节点）
- 冲突文件：`AGENTS.md`、`state.json`、`generate.ts`、`InspectorPane.tsx`、`canvas.ts`、`global.css`
- main 新增 `marked` 依赖，已执行 `pnpm install`
- main 的 `generate.ts` 图片引用改动已移植到 `start-generation.ts`
- main 的成片合并进 studio 节点，`timeline_export` 已改为 `applyStudioOutput`
- InspectorPane 保留「属性 / 画面 / 音频」，移除旧「助手」分页

验证：40 文件 277 测试通过，`typecheck` / `build` 通过；隔离实例 smoke test 通过。

分支领先 `origin/main` 32 个提交、落后 0，未推送。

## Frontier

1. 推送 `feat/agent-runtime`（下一项）
2. 创建到 main 的 PR
3. PR 合并后优化已知缺口

## Gates

- G-AGENT-VIDEO：Agnes Video 2.5 Flash 队列 503，待恢复重试。
- G-AGENT-MAIN：已同步 9f4511d，合并提交 5b4f0ea，冲突已解决。

## 证据

`.opencode/handover/evidence/` 下 `MERGE-MAIN-1.md`、`AGENT-ACCEPTANCE-1.md`、`SKILLS-FILES-1.md`、`AGENT-UI-REFINE-1.md`、`AGENT-ASSET-REFS-1.md`、`AGENT-CONTEXT-*.png`、`SKILLS-UPLOAD-1.png`。

## 已知缺口（PR 合并后处理）

- 无独立 `film` Agent 工具集/入口；拉片仍以画布节点和界面操作为主。
- 导演台没有独立 `stage` profile UI，当前由 canvas profile 使用 `stage_*` 工具。
- 原生技能文件选择对话框未自动化；导入函数与 UI 按钮已验证。
- 上下文预算固定 32K、3 字符≈1 token。
- Agnes Video 可能 503。

## 关键 lessons

- `generate.ts` 已是薄 IPC，main 的旧文件改动要移植到 `start-generation.ts`。
- main 成片已合并进 studio 节点，导出写回用 `applyStudioOutput` / `patchStudioNode`。
- InspectorPane 保留属性/画面/音频，旧助手分页删除。
- `canvas.ts` 合并时以 main 为基础，再叠加 stage、`applyCommands`、回合撤销。
- CineBot 模型选择分文本/生图/生视频/音频；生成提案按目标类型覆盖模型。
- 上下文压缩 v1：3 字符≈1 token、32K 固定预算、保留最近 6 条、summary 存 coveredMessages。
- `@` 引用素材、`/` 打开技能；引用随 `agent:chat.references` 注入系统提示。
- 技能文件上传只允许 references/assets；同名覆盖并返回 overwritten；删除不允许 SKILL.md。
- 工具过程折叠为「思考过程」，不展示 JSON。
- 长任务工具单独放宽超时；回合取消时取消转写/导出。

## 设计约定

- CineBot 面板为 LibTV 风格：`CineBot · 会话标题`、上传/模型/权限/技能 chip、上下文圆环、圆形发送按钮。
- 输入框 `@` 引用素材、`/` 选择技能。
- 技能覆盖优先 project > global > builtin；内置技能只读。
- 主题只通过 `styles/tokens.css` 的 CSS 变量。
