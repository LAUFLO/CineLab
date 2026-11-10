# CineLab · Boot Packet

> **下一会话优先**：等待 PR #2 review/merge；合并后继续优化已知缺口。

## 状态

2026-11-10：`feat/agent-runtime` 已推送并创建 PR。

- PR：https://github.com/LAUFLO/CineLab/pull/2
- 标题：`feat: CineBot agent runtime and advanced clip tools`
- base：`main`
- 合并状态：`MERGEABLE` / `CLEAN`
- GitHub Actions `build`：通过（3m25s）
- `origin/main` 9f4511d 已合并，6 个冲突已解决
- 合并后修复：`a5a0ced`（timeline_export 写回 studio 节点）
- 验证：40 文件 277 测试、`typecheck`、`build` 通过
- 隔离实例 smoke test：画布、CineBot、剪辑室、检查器分页正常

分支领先 `origin/main` 33 个提交、落后 0，已推送 `origin/feat/agent-runtime`。

## Frontier

1. 等待 PR #2 review/merge（下一项）
2. PR 合并后优化已知缺口

## Gates

- G-AGENT-VIDEO：Agnes Video 2.5 Flash 队列 503，待恢复重试。
- G-AGENT-MAIN：已解决，origin/main 9f4511d 已合并且 CI 通过。

## 证据

`.opencode/handover/evidence/` 下 `PR-CINELAB-2.md`、`MERGE-MAIN-1.md`、`AGENT-ACCEPTANCE-1.md`、`SKILLS-FILES-1.md`、`AGENT-UI-REFINE-1.md`、`AGENT-ASSET-REFS-1.md`、`AGENT-CONTEXT-*.png`、`SKILLS-UPLOAD-1.png`。

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
