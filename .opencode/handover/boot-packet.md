# CineLab · Boot Packet

> **下一会话优先**：技能文件上传与覆盖快捷操作，随后整体验收；推送前先同步 origin/main。

## 状态

2026-11-09：生成提案、导演台全链路、剪辑助手 `clip`、技能管理 UI、删除/批量确认、AI 入口调整、助手 UI 重做、剪辑高级工具、CineBot 品牌修正、素材引用与自动连线均已完成。

CineBot 支持三类生成引用：画布节点、资产库素材、本地附件。引用素材会按需创建素材节点、自动补 source→target 连线，并把提示词写回目标节点；PromptBar 会同步外部提示词。剪辑高级工具（自动字幕、删静音、转场、导出）已接入 clip profile。36 文件 256 测试通过，`typecheck` / `build` 通过。`feat/agent-runtime` 领先 `origin/main` 23 个提交、落后 9 个，未推送。

## Frontier

1. 技能文件上传与覆盖快捷操作（下一项）
2. 整体验收
3. Agnes 视频补测
4. 推送前同步 origin/main

## Gates

- G-AGENT-VIDEO：Agnes Video 2.5 Flash 队列 503，待恢复重试。
- G-AGENT-MAIN：origin/main 新增 a768e64、6abef3d、3a406a7、436768d、91b16b4、71c8b48、336debb、1627ac9、72679c8；推送前先同步，重点检查 StudioNodeView / CineNodeView / AudioPlayer / TimelinePane / canvas store / film-study / preload / ipc-contract / provider 参数配置冲突。

## 证据

`.opencode/handover/evidence/` 下 `AGENT-*-1.md`、`STAGE-*-1.md`、`CLIP-PROFILE-1.md`、`CLIP-ADVANCED-TOOLS-1.md`、`AGENT-ASSET-REFS-1.md`、`SKILLS-UI-1.md`、`AGENT-CONFIRM-1.md`、`AGENT-FAB-1.md`、`AGENT-UI-2.md`、`AGENT-CINEBOT-*.png`、`AGENT-ASSET-REFS-1.png`。

## 关键 lessons

- 助手品牌统一为 CineBot；消息区不显示「你 / 助手」标签，用户右侧、CineBot 左侧。
- 工具状态按最新 callId 更新；turn_end 时把残留 running 兜底为完成或未完成。
- 生成提案引用素材时先登记提案再改画布；校验失败不能留下脏节点。
- 引用画布节点自动补线；引用资产库路径创建素材节点后连线；提示词通过 `CanvasCommand.updatePrompt` 写回目标节点。
- 本地附件先创建画布素材节点，再随 `agent:chat` 传 nodeId；发送后清空附件 chip，节点保留。
- PromptBar 必须监听同一节点 `data.prompt` 的外部变化。
- 助手工具过程折叠为「思考过程」，只显示中文工具名与状态，不展示 JSON。
- 长耗时工具（自动字幕、删静音、导出）单独放宽超时；回合取消时取消转写/导出。
- 只有真正修改时间线的工具计入撤销；读取、选择和导出不显示「撤销这一轮」。
- Agent 会话按项目 JSONL 保存，meta 条目存标题；首条消息自动命名；请求带 sessionId/modelKey。
- 高风险 Agent 工具执行前确认；拒绝或 60 秒超时不得执行。
- 时间线一轮 Agent 只压一条撤销历史。
- 技能启用/禁用与模型调用开关存 `scope:name` 覆盖配置。

## 设计约定

- 画布 AI 入口使用 `assets/agent-icon.svg`，底部工具栏不再放 robot 按钮。
- CineBot 面板为 LibTV 风格：`CineBot · 会话标题`、模型/权限/技能 chip、上传 chip、圆形发送按钮。
- 生成引用：画布用 `refNodeIds`，资产库用 `libraryRefs`，本地附件用附件 `nodeId`。
- 目标生成节点用 `canvas_add_node` 创建；优先传 `nearNodeId` 放在参考素材右侧。
- 技能覆盖配置：全局 `<userData>/skills-config.json`，项目 `<project>/.cinelab/skills-config.json`。
- 工具执行在渲染进程；主进程构造 scope 与回合事务。
- 主题只通过 `styles/tokens.css` 的 CSS 变量。
