# CineLab 技术架构

日期：2026-11-13
状态：现行
适用版本：v0.1.0
最后核对：2026-11-13

> 本文定义 Electron 桌面应用的整体结构、数据格式、模型接入层与执行引擎。
> 与 `ui-spec.md` 配套：前者定实现，后者定界面。

## 1. 产品形态

- 桌面应用，双击启动，无需外部服务。
- 数据完全存在本地项目文件夹，可整体拷走、备份、压缩发给别人。
- 模型调用由主进程直连各厂商 API，API Key 只存本机。
- 不依赖云端账号、不做多端同步、不做协作。
- 内置 CineBot Agent，但模型、Key 和会话都由用户本地配置和管理。

## 2. 技术选型

| 层 | 选择 | 说明 |
|---|---|---|
| 桌面壳 | Electron 45 | 主进程原生 Node，全部逻辑用 TypeScript |
| 构建 | electron-vite | main / preload / renderer 一套配置 |
| 前端 | React 19 + TypeScript 7 + Vite 8 | 严格类型、快速 HMR |
| 画布 | React Flow 12（`@xyflow/react`） | 节点即 DOM，自定义节点自由度高 |
| 状态 | Zustand 5 | 画布、时间线、场景、Agent、设置分开管理 |
| 样式 | Tailwind CSS 4 + CSS 变量 | 主题只换变量 |
| 校验 | Zod 4 | 前后端共享 schema |
| 媒体 | ffmpeg-static + ffprobe-static | 本地转码、抽帧、导出 |
| 3D | three.js | 导演台视口与白模预演 |
| 打包 | electron-builder | NSIS 安装包 + 免安装 zip |
| Agent | 自研 AgentRuntime | OpenAI 兼容 function calling、SSE、回合事务 |

不引入 SQLite、ORM、Web Worker 集群、云端同步。

## 3. 进程架构

```text
main（Node）
  · 窗口、菜单、单实例锁
  · 项目文件读写与自动保存
  · 资产落盘、hash、缩略图
  · Provider 调用与 API Key 管理
  · 生成队列、时间线导出、导演台预演、拉片抽帧
  · AgentRuntime、工具注册表、会话、技能、生成提案
  · 组件下载、自动更新、日志

preload
  · contextBridge 暴露 window.api
  · 只暴露白名单方法，不透传 ipcRenderer

renderer（React）
  · 画布、节点、Prompt Bar、工具栏
  · CineBot 面板、剪辑室、导演台、拉片
  · Zustand UI 状态
  · 不直接访问文件系统或外部 API
```

规则：

- `renderer` 无 Node 权限（`nodeIntegration: false`、`contextIsolation: true`、`sandbox: true`）。
- 所有磁盘读写、网络请求必须走 `window.api`。
- 主进程不引用 React；共享类型只从 `src/shared` 引入。
- Agent 工具执行在渲染进程，通过 `agent:tool-call` / `agent:tool-result` 与主进程往返。

## 4. 目录结构

```text
src/
├─ main/
│  ├─ index.ts                 # 启动、窗口、单实例锁
│  ├─ window.ts / menu.ts
│  ├─ ipc/                     # 所有 IPC handler
│  ├─ project/                 # 新建/打开/保存/最近项目/封面
│  ├─ assets/                  # 写入资产、hash、缩略图、清理
│  ├─ providers/               # OpenAI 兼容、可灵、火山、MiniMax、Vidu、HTTP 模板
│  ├─ engine/                  # 生成队列、运行器、图解析
│  ├─ agent/                   # AgentRuntime、工具、能力、会话、技能、提案
│  ├─ timeline/                # 镜头/静音/节拍分析、ffmpeg 导出
│  ├─ stage/                   # 场景存储、白模预演
│  ├─ film-study/              # 抽帧、镜头检测、AI 分析、导出
│  ├─ components/              # 本地 runtime / 模型组件下载
│  ├─ media/                   # ffmpeg 封装、路径解析
│  ├─ library/                 # 全局资产库
│  ├─ settings/                # models.json、Key、偏好
│  ├─ export/                  # 项目 ZIP、画布 PNG、素材 ZIP
│  ├─ update/                  # electron-updater
│  └─ types/
├─ preload/
│  └─ index.ts                 # window.api
├─ renderer/
│  └─ src/
│     ├─ canvas/               # 画布、节点、连线、工具栏、Prompt Bar、拉片节点
│     ├─ agent/                # CineBot 面板、会话状态、canvas/timeline/stage/film 桥
│     ├─ studio/               # 剪辑室时间线、检查器、导出
│     ├─ stage/                # 导演台视口、检查器、时间线、预演导出
│     ├─ stores/               # Zustand store
│     ├─ panels/               # 设置、资产库、项目中心
│     ├─ components/           # 通用组件
│     ├─ theme/                # 主题
│     └─ styles/               # CSS 变量与全局样式
└─ shared/
   ├─ canvas-schema.ts         # 节点、边、输出、分组
   ├─ canvas-commands.ts       # 画布命令与撤销
   ├─ project-schema.ts        # 项目/画布/封面
   ├─ provider-schema.ts       # Provider / 模型 / 参数
   ├─ generation.ts            # GenerateRequest、资产
   ├─ timeline-*.ts            # 时间线 schema、命令、编辑、布局、分析
   ├─ stage-*.ts               # 场景 schema、命令、预览
   ├─ film-study.ts            # 拉片数据模型
   ├─ agent.ts / agent-tools.ts / agent-session.ts
   ├─ node-operation-specs.ts  # 节点操作 Agent 规格
   ├─ skills.ts
   └─ ipc-contract.ts          # IPC 方法签名与事件
```

## 5. 项目文件夹格式

一个项目就是一个以 `.cinelab` 结尾的文件夹。

```text
《短剧第一集》.cinelab/
├─ project.json                 # 项目元信息
├─ canvas-<id>.json             # 每个画布一个文件
├─ characters.json              # 角色库
├─ history.jsonl                # 生成历史
├─ tasks.jsonl                  # 任务记录
├─ assets/
│  ├─ img/<sha256>.png
│  ├─ vid/<sha256>.mp4
│  ├─ aud/<sha256>.mp3
│  ├─ thumb/<sha256>.webp
│  └─ study/<studyId>/frames/   # 拉片代表帧
├─ timelines/<timelineId>.json  # 剪辑室时间线
├─ stages/<stageId>.json        # 导演台场景
├─ study/<studyId>.json         # 拉片数据
├─ .cinelab/
│  ├─ agent/sessions/<id>.jsonl # Agent 会话
│  ├─ agent/proposals/<id>.json # 生成提案
│  └─ skills/                   # 项目技能
├─ exports/
├─ .trash/                      # 回收站
└─ .lock                        # 单窗口锁
```

保存策略：

- 结构性变更触发 500ms 防抖保存。
- 写临时文件后 rename，避免写一半崩溃。
- 保留 `.bak`，启动时检测恢复。
- 关闭窗口前强制保存。
- 时间线和场景文件有独立的 `updatedAt`，避免异步保存覆盖新内容。

## 6. 数据模型

### 6.1 画布

```ts
type CanvasNodeKind =
  | 'text' | 'image' | 'video' | 'audio' | 'study'
  | 'studio' | 'stage' | 'film' | 'video-op' | 'group'

interface CineNodeData {
  kind: NodeKind
  title: string
  status: 'idle' | 'queued' | 'running' | 'done' | 'error'
  text?: string
  outputs?: OutputRef[]
  selectedOutputId?: string
  prompt?: string
  studyId?: string
  sourceNodeId?: string
  studySummary?: ...
  templates: string[]
}
```

画布命令：`updateTitle`、`updateText`、`updatePrompt`、`moveNode`、`addNode`、`removeNode`、`connect`、`removeEdge`。批量命令支持 `turnId` 合并历史。

### 6.2 时间线

```ts
interface TimelineDoc {
  schemaVersion: 1
  id: string
  name: string
  video: { width: number; height: number; fps: number; colorSpace: 'sdr' }
  background: { type: 'none' | 'color' | 'image'; ... }
  tracks: TimelineTrack[]   // video / audio / subtitle
  clips: TimelineClip[]     // video / image / audio / text
  markers: TimelineMarker[]
  linkage: boolean
  createdAt: string
  updatedAt: string
}
```

命令层：`addClip`、`addClips`、`moveClips`、`trimClip`、`splitClips`、`splitAt`、`removeClips`、`removeRanges`、`updateClip`、`setClipSpeed`、`setTimelineVideo`、`setTimelineBackground`、`addMarker`、`batch` 等。

### 6.3 导演台

```ts
interface DirectorStageDoc {
  version: 1
  stageId: string
  name: string
  background: { kind: 'color' | 'panorama' | 'model'; value: string }
  objects: StageObject[]
  cameras: StageCamera[]
  shots: StageShot[]
  activeCameraId?: string
  updatedAt: string
}
```

命令层：对象增删改/姿势/颜色/可见性、机位增删改、镜头增删改、机位关键帧、背景、渲染预演。

### 6.4 拉片

```ts
interface FilmStudy {
  schemaVersion: 1
  id: string
  sourceNodeId: string
  sourcePath: string
  sourceName: string
  duration: number
  fps: number
  frameInterval: number
  frames: FilmStudyFrame[]
  segments: FilmStudySegment[]
  macroAnalysis?: ...
  storyLines?: ...
  audienceCurvePoints?: ...
  subtitles?: ...
  analysisModel?: string
  autoAnalyzedAt?: string
  createdAt: string
  updatedAt: string
}
```

### 6.5 Agent

- 会话：`<project>/.cinelab/agent/sessions/<id>.jsonl`，包含 message / tool / turn / summary / model_change 等条目。
- 提案：`<project>/.cinelab/agent/proposals/<id>.json`，状态 pending / submitting / submitted / completed / failed / cancelled / expired。
- 技能：内置 / 全局 / 项目三级目录，`SKILL.md` + references + assets。

## 7. 模型接入层

- `models.json` 是唯一模型清单，位置 `%APPDATA%\cinelab\models.json`。
- `settings.json` 只存加密后的 API Key。
- 适配器：OpenAI 兼容、可灵、火山方舟、MiniMax、Vidu、HTTP 模板。
- 模型能力：`image.t2i`、`image.i2i`、`video.t2v`、`video.i2v`、`text.chat`、`audio.tts`、`audio.music`。
- 支持模型参数、参考图/参考视频、蒙版、Seed、数量等字段。

## 8. 生成引擎

流程：

```text
Prompt Bar / Agent proposal
  → 生成请求 GenerateRequest
  → 队列排队
  → 调用 Provider
  → 下载/落盘资产
  → 写 OutputRef 到节点
  → 更新历史
```

- 队列持久化到 `tasks.jsonl`，支持并发限制、进度事件、取消、失败重试。
- 生成结果进入 `assets/img|vid|aud`，缩略图进入 `assets/thumb`。
- Agent 生成走两段式：`generation_propose` 只登记，用户确认后 `submit`，带幂等键。

## 9. 时间线与导出

- 镜头检测、静音检测、节拍检测在主进程调用 ffmpeg 分析。
- 自动粗剪只生成 `TimelineCommand[]`，由 UI/Agent 共用 `timeline-plan-runner` 提交。
- 导出使用 ffmpeg filter graph，支持多轨、字幕、转场、BGM、音量。
- 导出完成后写回画布剪辑室节点的 `OutputRef`。

## 10. 导演台与预演

- 场景保存为 `stages/<stageId>.json`。
- `StageCommand` 是唯一写入口。
- 白模预演在隐藏 BrowserWindow 的 `stage-render.html` 中逐帧渲染，再交给 ffmpeg 编码。
- 导出结果写回画布视频节点。

## 11. 拉片

- 自动分镜：ffmpeg 帧级 RGB 直方图 + 跳变检测，连续运动视频使用运动峰值候选。
- 代表帧保存到 `assets/study/<studyId>/frames`。
- AI 描述使用支持图片输入的文本模型，补齐景别、机位、运镜、光线、画面、提示词等字段。
- 拉片结果直接生成分镜组和分镜表节点；原拉片室保留为高级编辑。
- 导出 Markdown、AI 分析包、完整拉片包。

## 12. AgentRuntime

- 自研循环：模型请求 → 工具调用 → 工具结果 → 继续请求，直到最终回复/预算耗尽/取消。
- 工具定义在 `src/main/agent/tools.ts`，当前 56 个；`capabilities/` 提供只读投影和关键词搜索。
- Profile：`canvas` / `clip` / `film` / `stage`。
- 权限：`read-only` / `current` / `full-access`。
- 确认：`toolConfirmationReason` + `agent:confirm`，60 秒超时。
- 回合事务：画布/时间线/场景用 `turnId` 合并一条历史；拉片用 study 快照；`AgentTurnChange` 记录各域变更。
- 上下文：系统提示 + 业务摘要 + 最近对话 + 工具结果；支持手动压缩和摘要注入。
- 技能：三级目录，正文按需读取，压缩后补回。

## 13. IPC 契约

主要通道：

| 通道 | 作用 |
|---|---|
| `project:*` | 新建/打开/保存/最近项目/封面 |
| `asset:*` / `library:*` | 资产落盘、资产库 |
| `generate:*` | 生成请求、取消、事件 |
| `timeline:*` | 加载/保存/分析/转写/导出 |
| `stage:*` | 场景加载/保存/导出预演 |
| `film-study:*` | 抽帧/自动拉片/保存/导出/字幕 |
| `components:*` | 本地 runtime / 模型组件 |
| `agent:chat` / `agent:event` / `agent:tool-call` / `agent:tool-result` / `agent:confirm` | Agent 回合、流式事件、工具往返、确认 |
| `agent:proposal-*` | 生成提案创建/查询/提交/取消 |
| `agent:session-*` / `agent:skill-*` | 会话和技能 |
| `settings:*` / `update:*` | 设置和自动更新 |

完整签名以 `src/shared/ipc-contract.ts` 为准。

## 14. 安全

- 所有媒体路径经 `resolveInside` / `resolveMediaPath` 校验，限制在项目/全局库内。
- API Key 只存加密 settings，不写会话、日志、模型上下文。
- 技能导入拒绝 `..`、绝对路径、符号链接逃逸；脚本默认不执行。
- 工具结果、素材元数据、网页内容、技能正文都视为资料，不作为指令。
- 写操作必须经过权限、确认、幂等和回合撤销。
- 渲染进程保持 sandbox，不开 Node 集成。

## 15. 测试与 CI

- Vitest：`src/**/*.test.ts`，当前 48 个文件、344 个用例。
- 覆盖：项目/画布 schema、画布命令、时间线编辑、场景命令、生成提案、Agent 工具校验、能力注册表、拉片分析、媒体参数。
- GitHub Actions `Build Windows`：install → typecheck → test → check:encryption → build → electron-builder → artifact。
- 本地 `dev:isolated` 提供独立 userData 和 CDP 端口，用于 UI 烟测。

## 16. 变更记录

- 2026-11-11：补 Agent Phase 1–4、剪辑室、导演台、逐帧拉片、组件 runtime、CI；更新目录、项目格式、IPC 和安全。
- 2026-11-10：补生成提案、能力注册表、节点操作桥。
- 2026-11-05：初版架构。
