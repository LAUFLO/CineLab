# CineLab 项目概览

## 项目

本地优先的 AI 创作无限画布。Electron 45 + React 19 + React Flow 12 + Zustand + Tailwind 4 + TypeScript 7。主进程即后端，渲染进程不直接访问文件系统或外部 API；存储使用 JSON / JSONL。

## 结构

| 目录 | 内容 |
|---|---|
| `src/main` | 主进程：项目、设置、生成、媒体、时间线、拉片、Agent |
| `src/shared` | 画布/时间线/技能/Agent 类型与纯函数 |
| `src/renderer/src` | 画布、剪辑室、拉片室、导演台入口、Agent 面板 |
| `docs` | 方案、规格、计划 |
| `.opencode/handover` | 状态真相源、接续包、证据 |

## 当前进度

`phase = AGENT`，进行中。通用 AgentRuntime 已基于 `origin/main` 重建，旧剪辑助手已删除。

| 项 | 结论 |
|---|---|
| `AGENT-SPIKE-1` | 自研运行时闭环；真实 Agnes 3.0 Flash 工具调用、SSE 流式、Image 2.5 Flash 出图、本地代理通过 |
| `AGENT-TOOLS-1` | 工具注册表 + `CanvasCommand`；同一回合多命令一条撤销 |
| `AGENT-SKILLS-1` | 内置/全局/项目三级技能目录；`SKILL.md` 解析、`skill_list` / `skill_read` |
| `AGENT-CANVAS-TOOLS-1` | 创建 / 连接 / 删除节点 |
| `AGENT-GROUP-TOOLS-1` | 分组 / 解散分组 |
| `AGENT-PROPOSAL-1` | 生成提案 propose/submit、提案卡、幂等、失效 |
| `STAGE-COMMANDS-1` | 导演台场景 schema、17 类命令、原子 batch、撤销/重做历史 |
| `STAGE-NODE-STORAGE-1` | 画布导演台节点、`stages/` 场景读写、复制深拷贝、重开保留 |
| `STAGE-VIEWPORT-1` | 原生 three.js 3D 视口、机位切换、选中、截图回画布、自动保存 |
| `STAGE-AGENT-EDITING-1` | stage Agent 工具、TransformControls、属性编辑、增删对象/机位、落盘保护 |
| `STAGE-TIMELINE-PREVIEW-1` | 运镜关键帧、时间轴、播放预演、隐藏窗口逐帧渲染、ffmpeg 白模视频 |
| `CLIP-PROFILE-1` | 剪辑室 Agent 上下文、时间线工具、回合级撤销、剪辑助手 UI |
| `SKILLS-UI-1` | 三级技能管理、覆盖开关、创建/编辑/删除、文件浏览 |
| `AGENT-CONFIRM-1` | 删除 / 批量操作二次确认，确认前不执行 |
| `AGENT-FAB-1` | 底部工具栏 robot 按钮移除，AI 悬浮按钮位置与 SVG 图标调整 |
| `AGENT-UI-2` | LibTV 风格助手、会话历史、文本模型/技能选择、工具过程隐藏 JSON |
| `CLIP-ADVANCED-TOOLS-1` | 自动字幕、删静音、转场、导出四个剪辑 Agent 工具；长任务超时与取消 |
| `AGENT-CINEBOT-1` | 助手统一命名 CineBot；移除角色标签；工具状态兜底修正 |
| `AGENT-ASSET-REFS-1` | 画布/资产库/本地附件引用；素材节点自动创建与连线；提示词回填 |
| `AGENT-UI-REFINE-1` | 面板对齐/会话删除/多能力模型/@ 引用/技能弹窗/上下文圆环与手动压缩 |
| `SKILLS-FILES-1` | 技能 references/assets 上传、覆盖、删除；同名技能快速覆盖 |
| `AGENT-ACCEPTANCE-1` | CineBot 画布/剪辑/技能/上下文/会话整体自验收 |
| `MERGE-MAIN-1` | 同步 origin/main 9f4511d，解决 6 个冲突，合并后 277 测试通过 |
| `PR-CINELAB-2` | 已推送 feat/agent-runtime，PR #2 创建，CI build 通过，状态 CLEAN |
| `AGENT-CAPABILITY-PLAN-1` | CineBot 能力覆盖盘点、节点操作桥、能力注册表、未来功能接入清单 |
| 验证 | 40 文件 277 测试、`typecheck`、`build` 通过；画布生成提案与模型覆盖、剪辑转场、技能上传/覆盖/删除、上下文压缩、会话删除、素材引用、CineBot UI、合并后剪辑室分页与 studio 成片回归通过 |
| 分支 | `feat/agent-runtime` 领先 `origin/main` 34 个提交、落后 0，已推送；PR #2 等待 review/merge |

## 关键工件

- `docs/agent-full-scope.md`：Agent 完整功能范围
- `docs/agent-architecture-plan.md`：运行时、工具协议、权限、回合、上下文、技能
- `docs/agent-generation-proposal-plan.md`：生成提案字段、状态机、幂等与失效规则
- `docs/director-stage-plan.md`：3D 片场 + 本地白模预演
- `docs/director-stage-viewport-plan.md`：原生 three.js 视口与 A1/A2/A3 范围
- `docs/clip-studio-plan.md`：剪辑室
- `docs/film-study-plan.md`：拉片室
- `.opencode/handover/state.json`：唯一状态真相源
- `.opencode/handover/evidence/AGENT-*.md`：Agent 验证记录

## 下一步

1. 剪辑高级工具：自动字幕、删静音、转场、导出
2. 技能文件上传与覆盖快捷操作
3. 整体验收
4. Agnes 视频补测
5. 推送前同步 origin/main

## 设计约定

- 主题只通过 `styles/tokens.css` 的 CSS 变量。
- 画布/时间线/技能/Agent 数据结构放 `src/shared`。
- 模型请求走主进程 `httpFetch`，保持 Electron 会话代理生效。
- Agent 会话存 `<project>/.cinelab/agent/sessions/<id>.jsonl`。
- 生成提案存 `<project>/.cinelab/agent/proposals/<id>.json`。
- 导演台场景存 `<project>/stages/<stageId>.json`；手动编辑与 Agent 共用 `StageCommand`。
- 导演台 3D 视口用原生 three.js 渲染内核 + React 外壳，不引入 R3F。
- stage Agent 工具执行后立即保存场景；保存拒绝更旧 `updatedAt`。
- 白模预演使用隐藏窗口 `stage-render.html` 逐帧渲染，ffmpeg 编码后写入 assets/vid。
- 剪辑助手与画布助手共用 AgentRuntime，按 profile 切换系统提示与工具集。
- 技能覆盖配置：全局 `<userData>/skills-config.json`，项目 `<project>/.cinelab/skills-config.json`。
- 技能文件：内置技能只读；global/project 技能可上传 references/assets，同名文件覆盖；同名技能可快速克隆为更高优先级覆盖。
- 高风险 Agent 工具执行前确认；删除、删静音、导出与超过 10 个片段的批量操作强制确认。
- 画布 AI 入口使用 `assets/agent-icon.svg`。
- 助手品牌统一为 CineBot；面板采用 LibTV 风格：历史会话、多能力模型选择、技能插入、上下文圆环、工具过程折叠。
- 输入框 `@` 引用画布/资产库素材，`/` 打开技能选择；上下文可手动压缩。
- 消息区不显示「你 / 助手」标签；工具状态按最新 callId 更新，回合结束时兜底。
- Agent 会话按项目 JSONL 保存，meta 存标题，首条消息自动命名。
- 工具执行在渲染进程；主进程构造 scope、权限和回合事务。
- 生成必须走提案确认，不直接执行；`generation_submit` 不暴露给模型。
- 生成引用：画布节点用 `refNodeIds`，资产库用 `library_search` + `libraryRefs`，本地附件用上传后的附件 nodeId；引用素材自动补线，提示词回填目标节点。
- 新功能接入 Agent：UI 与 Agent 共用执行器，写操作走命令层；节点工具栏操作统一走 `node-operation-runner`，能力用 `AgentCapability` 注册，详见 `docs/agent-capability-plan.md`。

## 输入源

`AGENTS.md` 的「状态与工件路径约定」；`state.json` 为真相源；`docs/` 提供方案；`evidence/` 提供验证记录。敏感 Key 只存在仓库外本地测试目录，不写入仓库。
