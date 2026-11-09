# CineLab · Boot Packet

> **下一会话优先**：用通用 AgentRuntime 重建剪辑助手 `clip` profile，接入时间线读写、片段操作与剪辑室上下文。

## 状态

2026-11-09：生成提案 propose/submit 已完成并真实 Agnes 验证；金额预估已移除。导演台完成五批：StageCommand、stage 节点与场景存储、A1 3D 视口、A2 编辑与 stage Agent 工具、A3 运镜时间轴与本地白模预演。白模预演已验证 1280×720 / 5s / 24fps / H.264 导出，并自动创建视频节点。33 文件 233 测试通过，`typecheck` / `build` 通过。`feat/agent-runtime` 领先 `origin/main` 15 个提交、落后 4 个，未推送。

## Frontier

1. 剪辑助手 `clip` profile（下一项）
2. 技能管理 UI
3. 白模预演参数、取消与动作轨
4. 删除 / 批量二次确认
5. 整体验收；Agnes 视频补测

## Gates

- G-AGENT-VIDEO：Agnes Video 2.5 Flash 队列 503，待恢复重试。
- G-AGENT-MAIN：origin/main 新增 a768e64、6abef3d、3a406a7、436768d；推送前先同步，重点检查 StudioNodeView / CineNodeView / AudioPlayer / TimelinePane / canvas store / preload / ipc-contract 冲突。

## 证据

`.opencode/handover/evidence/AGENT-*-1.md`、`STAGE-{COMMANDS,NODE-STORAGE,VIEWPORT,AGENT-EDITING,TIMELINE-PREVIEW}-1.md`；方案见 `docs/director-stage-plan.md`、`docs/director-stage-viewport-plan.md`。

## 关键 lessons

- Agent 的 stage 工具必须立即保存场景文件，并拒绝更旧 `updatedAt` 的快照。
- 导演台播放依赖 rAF；窗口被遮挡会暂停，隔离测试实例用 `CINELAB_DISABLE_THROTTLE=1`。
- 白模预演必须走隐藏窗口 `stage-render.html` + ffmpeg image2pipe，不要截可见视口。
- 复制导演台必须深拷贝 `stages` 文件并换 `stageId`。

## 设计约定

- 导演台场景存 `<project>/stages/<stageId>.json`；手动编辑与 Agent 共用 `StageCommand`。
- 白模预演导出到 `exports/`，同时写入 `assets/vid` 并创建视频节点。
- 导演台 3D 视口用原生 three.js 渲染内核 + React 外壳。
- 工具执行在渲染进程；主进程构造 scope 与回合事务。
- 主题只通过 `styles/tokens.css` 的 CSS 变量。
