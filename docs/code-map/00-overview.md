# 00 总览

日期：2026-11-19
状态：现行
适用版本：v0.3.0
最后核对：2026-11-19

## 这是什么

CineLab 是本地运行的 AI 创作无限画布：画布负责素材与生成，剪辑室负责时间线，导演台负责 3D 预演，拉片室负责视频拆解；CineBot 用自然语言操作这四个空间。

## 技术栈

| 层 | 技术 |
|---|---|
| 桌面 | Electron、electron-vite、electron-builder |
| 渲染 | React 19、React Flow 12、Zustand 5、Tailwind 4 |
| 语言 | TypeScript、Zod |
| 3D | three.js |
| 媒体 | ffmpeg-static、ffprobe-static |
| 测试 | Vitest、Playwright |
| 打包 | electron-builder（Windows / macOS / Linux） |

## 进程模型

```
src/main/            主进程：文件、IPC、模型请求、ffmpeg、窗口、安全
src/preload/         contextBridge，暴露 CineApi
src/renderer/        React UI：画布、剪辑室、导演台、拉片室、Agent 面板
src/shared/          schema、命令、契约；前后端共用，不依赖 DOM/Electron
resources/           运行时组件、skills、sounds、worker
scripts/             构建、检查、CDP、发布辅助
```

约束：渲染进程不直接访问文件系统或外部 API；所有文件读写、模型请求走主进程。

## 目录职责

| 目录 | 职责 | 地图 |
|---|---|---|
| `src/renderer/src/canvas/` | 画布、节点、连线、工具栏、提示词栏 | [01](01-canvas.md) |
| `src/main/providers/`、`src/main/engine/`、`src/main/media/` | 供应商、生成、媒体 | [02](02-generation.md) |
| `src/main/timeline/`、`src/renderer/src/studio/` | 时间线、剪辑、字幕、音频 | [03](03-clip-studio.md) |
| `src/main/stage/`、`src/renderer/src/stage/`、`src/shared/previs/` | 导演台、程序化世界、白模预演 | [04](04-director-stage.md) |
| `src/main/film-study/` | 拉片、自动分镜 | [05](05-film-study.md) |
| `src/main/agent/`、`src/renderer/src/agent/` | CineBot、工具、提案、技能 | [06](06-agent.md) |
| `src/main/ipc/`、`src/preload/`、`src/main/project/`、`src/main/settings/` | 存储、IPC、安全 | [07](07-storage-ipc.md) |
| `src/renderer/src/components/`、`src/renderer/src/panels/`、`src/renderer/src/styles/` | UI 组件、面板、主题 | [10](10-ui.md) |

## 项目数据结构

项目文件夹后缀 `.cinelab`：

```
<project>.cinelab/
  canvases/<id>.json          画布（节点/连线/视图）
  timelines/<id>.json         时间线
  stages/<id>.json            导演台
  stages/<id>.world.json      程序化世界
  study/<id>.json             拉片
  assets/                     项目素材
  exports/                    导出物
  .cinelab/
    agent/sessions/*.jsonl    Agent 会话
    agent/proposals/          Agent 提案
    skills/                   项目技能
```

用户数据目录（`app.getPath('userData')`）：`recent-projects.json`、`models.json`、`skills/`、`components/`。

## 常用命令

```bash
corepack pnpm dev           # 启动 Electron + Vite
corepack pnpm dev:isolated  # 独立测试实例（独立 CDP 端口与 userData）
corepack pnpm typecheck     # 主进程 + 渲染进程类型检查
corepack pnpm test          # Vitest
corepack pnpm check:docs    # 文档 + 代码地图校验
corepack pnpm map:code      # 更新代码地图自动区
corepack pnpm check:ui      # UI 控件、圆角、浮层、硬编码色值
corepack pnpm build         # 构建
corepack pnpm dist:win      # Windows 安装包
corepack pnpm dist:mac      # macOS 安装包
```

> `pnpm` 不在 PATH 时统一用 `corepack pnpm`。

## 硬性约定

- 主题颜色只通过 `src/renderer/src/styles/tokens.css` 的 CSS 变量引用。
- 新增 UI 先查 `src/renderer/src/components/ui/index.ts`；禁止业务代码自建浮层或原生控件。
- 节点与画布的数据结构放 `src/shared/`。
- 所有文件读写、模型请求走主进程。
- 左侧 `+` 只作为 target，右侧 `+` 才发起下游生成。
- 节点卡片不带「尝试」列表，参数收进 Prompt Bar。
- 存储用 JSON/JSONL，不引入 SQLite 或原生模块。
- 弹窗与 topbar 平级，不渲染在 topbar 内部。
- 发版同步 `README.md` 与 `README.en.md`。

## 模块地图

| 编号 | 模块 | 状态 |
|---|---|---|
| 01 | 画布 | 稳定 |
| 02 | 生成与模型 | 稳定 |
| 03 | 剪辑室 | 稳定 |
| 04 | 导演台与白模预演 | 部分实现 |
| 05 | 拉片室 | 稳定 |
| 06 | CineBot 与 Agent | 稳定 |
| 07 | 存储、IPC 与安全 | 稳定 |
| 10 | UI 组件与面板 | 稳定 |

能力状态见 [08-capabilities.md](08-capabilities.md)；接口与测试清单见 [_generated.md](_generated.md)。
