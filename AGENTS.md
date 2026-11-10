> **新会话启动时，请首先读取 `.opencode/handover/boot-packet.md`，然后读取 `.opencode/handover/state.json` 获取完整状态与 frontier。**

# CineLab

本地运行的 AI 创作无限画布工具。1:1 复刻 LibTV 画布体验，模型接入完全开放，数据存在本地项目文件夹。

技术栈：Electron 45 + React 19 + React Flow 12 + Zustand + Tailwind 4 + TypeScript 7。

## 自动接续规则

1. 新会话开始：先读 `.opencode/handover/boot-packet.md`，再读 `state.json`。
2. 每完成一个 frontier 项：更新 `state.json` 中对应 todo 状态，并在 `evidence/` 留一条验证记录。
3. 用户说「收工 / 交接 / 同步状态 / handover」：执行 handover skill，重新生成投影文件。
4. `state.json` 是唯一真相源；`boot-packet.md` 与 `project_summary.md` 是只读投影，禁止反写。
5. 大功能（跨模块、涉及技术选型或外部依赖）在方案讨论确定后，必须先落 `docs/<feature>-plan.md`，再进入实现；方案变更先改文档再改代码。

## 状态与工件路径约定

| 用途 | 路径 |
|---|---|
| 状态真相源 | `.opencode/handover/state.json` |
| 接续包 | `.opencode/handover/boot-packet.md` |
| 项目概览 | `.opencode/handover/project_summary.md` |
| 验证证据 | `.opencode/handover/evidence/` |
| 界面规格 | `docs/ui-spec.md` |
| 技术架构 | `docs/architecture.md` |
| 模型配置 | `models.json`（用户数据目录） |
| 模型配置说明 | `docs/models.md` |
| 分组设计 | `docs/group-nodes.md` |
| 底部工具栏计划 | `docs/bottom-toolbar-plan.md` |
| 深度动作捕捉方案 | `docs/depth-capture-plan.md` |
| 后续路线图 | `docs/roadmap-plan.md` |
| 模型配置统一方案 | `docs/models-config-unify-plan.md` |
| 自动更新方案 | `docs/update-plan.md` |
| 派生节点自动成组 | `docs/derived-nodes-group-plan.md` |
| BeefTV 深度组件调研 | `docs/beef-tv-depth-research.md` |
| 深度 runtime 构建发布 | `docs/runtime-components-plan.md` |
| 剩余本地增强方案 | `docs/remaining-features-plan.md` |
| 剪辑室合并成片方案 | `docs/studio-film-merge-plan.md` |
| 导演台方案 | `docs/director-stage-plan.md` |
| 导演台 3D 视口 | `docs/director-stage-viewport-plan.md` |
| Agent 完整范围 | `docs/agent-full-scope.md` |
| Agent 架构 | `docs/agent-architecture-plan.md` |
| Agent 生成提案 | `docs/agent-generation-proposal-plan.md` |
| CineBot 能力扩展方案 | `docs/agent-capability-plan.md` |
| 剪辑室计划 | `docs/clip-studio-plan.md` |
| 拉片室计划 | `docs/film-study-plan.md` |
| 剪辑助手计划 | `docs/agent-plan.md` |

## 开发命令

```bash
corepack pnpm dev          # 启动 Electron + Vite
corepack pnpm dev:isolated # 独立测试实例：自动分配 CDP 端口和临时 userData
corepack pnpm typecheck    # 主进程 + 渲染进程类型检查
corepack pnpm check:encryption # 检查透明加密文件与 Git blob 是否为明文
corepack pnpm build        # 构建
corepack pnpm dist:win     # 打包 Windows 安装包
```

> `pnpm` 不在 PATH 时统一用 `corepack pnpm`。

## UI 测试与多会话隔离

- 测试前先检查 `http://127.0.0.1:9222/json/version`。如果已有窗口响应，说明其他会话正在使用，禁止复用、关闭或 attach 这个实例。
- 使用 `corepack pnpm dev:isolated` 启动独立实例：自动分配空闲 CDP 端口（9222 被占时从 9223 起）并创建临时 userData。
- 脚本会打印 `CINELAB_DEBUG_PORT`，`scripts/cdp-*.mjs` 会自动读取该环境变量。
- 独立实例有独立的最近项目、设置和 `models.json`，首次进入欢迎页；测试项目在实例内创建或打开。
- 隔离实例可以在整个会话期间保持运行，测试结束不必关闭；重复执行 `dev:isolated` 会复用已运行实例，`--new` 才会强制新开。
- 不要用 `SetForegroundWindow` 或 `Stop-Process` 操作其他会话的 Electron 窗口。
- 收工时只关闭自己启动的隔离实例，不关闭其他会话的窗口。

## 硬性约定

- 主题颜色只通过 `src/renderer/src/styles/tokens.css` 的 CSS 变量引用，组件内禁止硬编码色值。
- 节点与画布的数据结构放在 `src/shared/`，前后端共用。
- 所有文件读写、模型请求走主进程，渲染进程禁止直接访问文件系统或外部 API。
- 左侧 `+` 只作为 target 接收连线，右侧 `+` 才发起下游生成。
- 节点卡片不带「尝试」列表，参数全部收进 prompt bar。
- 存储用 JSON / JSONL，不引入 SQLite 或原生模块。
- 弹窗必须与 topbar 平级，禁止渲染在 topbar 内部（会被层叠上下文压住，且顶部 40px 是窗口拖拽区）。

## 已知环境注意事项

- pnpm 12 的构建白名单写在 `pnpm-workspace.yaml` 的 `allowBuilds`。
- Electron 二进制缺失时，用 `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/` 执行 `node node_modules/electron/install.js`。
- TypeScript 7 的 `tsconfig` 不支持 `baseUrl`，`paths` 必须写 `./` 相对路径。
- `pnpm typecheck` 自动探测：本地 TypeScript 7 可用时直接使用，检测到加密导致的 `Invalid character` 时自动回退 `typescript@5.9.3`。
- 企业加密软件会对部分 `.ts` 透明加密：Node、Git、Vite 读明文，TS7 原生 `tsgo` 读密文并报 `Invalid character`。`pnpm check:encryption` 会列出受影响文件并检查 Git blob；推送前确认 Git 为明文。
