# CineLab · Boot Packet

> **下一会话优先**：运镜时间轴（镜头列表、相机关键帧、播放预演），随后接本地白模预演视频导出。

## 状态

2026-11-09：生成提案 propose/submit 已完成并真实 Agnes 验证；金额预估已移除。导演台完成四批：StageCommand 骨架、stage 节点与场景存储、A1 3D 视口、A2 编辑与 stage Agent 工具。A2 支持 TransformControls、属性面板、增删对象/机位、撤销/重做；Agent 可调用 stage_get / capabilities / add_object / transform_object / add_camera 等。修复了旧快照覆盖新场景的落盘 bug。31 文件 219 测试通过，`typecheck` / `build` 通过，主进程约 458KB。`feat/agent-runtime` 领先 `origin/main` 14 个提交、落后 2 个，未推送。

## Frontier

1. 运镜时间轴与本地白模预演（下一项）
2. 剪辑助手 clip profile
3. 技能管理 UI
4. 删除 / 批量二次确认
5. 整体验收；Agnes 视频补测

## Gates

- G-AGENT-VIDEO：Agnes Video 2.5 Flash 队列 503，待恢复重试。
- G-AGENT-MAIN：origin/main 新增 a768e64、6abef3d、3a406a7；推送前先同步，重点检查 StudioNodeView / CineNodeView / AudioPlayer / canvas store / preload / ipc-contract 冲突。

## 证据

`.opencode/handover/evidence/AGENT-{SPIKE,TOOLS,SKILLS,CANVAS-TOOLS,GROUP-TOOLS,PROPOSAL}-1.md`、`STAGE-{COMMANDS,NODE-STORAGE,VIEWPORT,AGENT-EDITING}-1.md`；方案见 `docs/director-stage-plan.md`、`docs/director-stage-viewport-plan.md`。

## 关键 lessons

- Agent 的 stage 工具必须立即保存场景文件，不能只依赖窗口防抖保存。
- 场景保存要拒绝更旧 `updatedAt` 的快照，防止延迟保存覆盖新数据。
- 导演台复制/粘贴必须深拷贝 `stages` 文件并换 `stageId`。
- 截图前必须开启 `preserveDrawingBuffer` 并渲染一帧。

## 设计约定

- 导演台场景存 `<project>/stages/<stageId>.json`；手动编辑与 Agent 共用 `StageCommand`。
- 导演台 3D 视口用原生 three.js 渲染内核 + React 外壳。
- 工具执行在渲染进程；主进程构造 scope 与回合事务。
- 模型请求走现有 provider + httpFetch，保持代理生效。
- 主题只通过 `styles/tokens.css` 的 CSS 变量。
