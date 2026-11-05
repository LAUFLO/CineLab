> **新会话启动时，请首先读取 `.opencode/handover/boot-packet.md`，然后读取 `.opencode/handover/state.json` 获取完整状态与 frontier。**

# CineLab

本地运行的 AI 创作无限画布工具。1:1 复刻 LibTV 画布体验，模型接入完全开放，数据存在本地项目文件夹。

技术栈：Electron 45 + React 19 + React Flow 12 + Zustand + Tailwind 4 + TypeScript 7。

## 自动接续规则

1. 新会话开始：先读 `.opencode/handover/boot-packet.md`，再读 `state.json`。
2. 每完成一个 frontier 项：更新 `state.json` 中对应 todo 状态，并在 `evidence/` 留一条验证记录。
3. 用户说「收工 / 交接 / 同步状态 / handover」：执行 handover skill，重新生成投影文件。
4. `state.json` 是唯一真相源；`boot-packet.md` 与 `project_summary.md` 是只读投影，禁止反写。

## 状态与工件路径约定

| 用途 | 路径 |
|---|---|
| 状态真相源 | `.opencode/handover/state.json` |
| 接续包 | `.opencode/handover/boot-packet.md` |
| 项目概览 | `.opencode/handover/project_summary.md` |
| 验证证据 | `.opencode/handover/evidence/` |
| 界面规格 | `docs/ui-spec.md` |
| 技术架构 | `docs/architecture.md` |

## 开发命令

```bash
corepack pnpm dev          # 启动 Electron + Vite
corepack pnpm typecheck    # 主进程 + 渲染进程类型检查
corepack pnpm build        # 构建
corepack pnpm dist:win     # 打包 Windows 安装包
```

> `pnpm` 不在 PATH 时统一用 `corepack pnpm`。

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
- 公司电脑的企业加密软件会加密 `.ts` 源文件，TS 7 原生 `tsc` 会报 `Invalid character`；`pnpm typecheck` 已改为 `npx typescript@5.9.3`。
