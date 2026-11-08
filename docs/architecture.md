# CineLab 技术架构

> 本文档定义 Electron 桌面应用的整体结构、数据格式、模型接入层与执行引擎。
> 与 `ui-spec.md` 配套，前者定界面，本文定实现。

---

## 1. 产品形态

- 桌面应用，双击启动，无需任何外部服务。
- 数据完全存在本地项目文件夹，可整体拷走、备份、压缩发给别人。
- 模型调用由主进程直连各厂商 API，API Key 只存本机。
- 不依赖云端账号、不做多端同步、不做协作。

---

## 2. 技术选型

| 层 | 选择 | 理由 |
|---|---|---|
| 桌面壳 | Electron（最新稳定版，Node 22+） | 主进程原生 Node，全部逻辑用 TypeScript，无需 Rust |
| 构建 | electron-vite | 一套配置同时构建 main / preload / renderer，HMR 完善 |
| 前端 | React 19 + TypeScript | 生态最全 |
| 画布 | `@xyflow/react`（React Flow 12） | 节点即 DOM，自定义节点自由度高；连线、框选、缩放、小地图开箱即用；MIT |
| 状态 | Zustand + Immer | 画布数据、任务状态、设置三类 store，轻量 |
| 样式 | Tailwind CSS 4 + CSS 变量 | 主题切换只换变量；不引重型组件库 |
| 校验 | Zod | 前后端共享 schema，项目文件带版本号可迁移 |
| 打包 | electron-builder | NSIS 安装包 + 免安装 zip |

**不引入**：SQLite、ORM、Hono/Express、monorepo、Web Worker 集群。

---

## 3. 进程架构

```
┌──────────────────────────────────────────────────────────┐
│ main（Node）                                              │
│  · 窗口与菜单                                              │
│  · 项目文件读写（fs）                                       │
│  · 资产落盘、hash、缩略图                                    │
│  · Provider 调用（fetch，无 CORS）                          │
│  · 任务队列与执行引擎                                        │
│  · 设置（API Key 等）                                       │
│  · 系统通知、托盘                                            │
└──────────────────────┬───────────────────────────────────┘
                       │ IPC（contextBridge，类型安全）
┌──────────────────────┴───────────────────────────────────┐
│ preload                                                   │
│  · 用 contextBridge 暴露 window.api                        │
│  · 只暴露白名单方法，不透传 ipcRenderer                      │
└──────────────────────┬───────────────────────────────────┘
                       │
┌──────────────────────┴───────────────────────────────────┐
│ renderer（React）                                          │
│  · 画布、节点、prompt bar、菜单                             │
│  · 本地 UI 状态（Zustand）                                  │
│  · 不直接访问文件系统，不直接发模型请求                        │
└──────────────────────────────────────────────────────────┘
```

规则：

- `renderer` 无 Node 权限（`nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`）。
- 所有磁盘读写、网络请求必须走 `window.api`。
- 主进程不引用任何 React 代码，共享类型只从 `src/shared` 引入。

---

## 4. 目录结构

```
D:\CineLab
├─ package.json
├─ electron.vite.config.ts
├─ electron-builder.yml
├─ tsconfig.json
├─ docs/
│  ├─ ui-spec.md
│  └─ architecture.md
├─ resources/                  # 图标、安装包素材
└─ src/
   ├─ main/
   │  ├─ index.ts              # 启动、窗口、单实例锁
   │  ├─ window.ts             # BrowserWindow 配置
   │  ├─ menu.ts               # 应用菜单
   │  ├─ ipc/
   │  │  ├─ index.ts           # 注册所有 handler
   │  │  ├─ project.ts
   │  │  ├─ asset.ts
   │  │  ├─ generate.ts
   │  │  └─ settings.ts
   │  ├─ project/
   │  │  ├─ manager.ts         # 新建/打开/保存/最近项目
   │  │  ├─ schema.ts          # Zod schema + 迁移
   │  │  └─ autosave.ts        # 防抖保存
   │  ├─ assets/
   │  │  ├─ ingest.ts          # 写入资产、计算 hash、去重
   │  │  ├─ thumbnail.ts       # 图片/视频缩略图
   │  │  └─ cleanup.ts         # 回收站
   │  ├─ providers/
   │  │  ├─ types.ts           # ModelAdapter 接口
   │  │  ├─ registry.ts        # 适配器注册表
   │  │  ├─ openai-compat.ts   # OpenAI 兼容（图片/文本）
   │  │  ├─ kling.ts           # 可灵视频
   │  │  ├─ volcengine.ts      # 火山方舟（即梦）
   │  │  └─ http-template.ts   # 通用 HTTP 模板
   │  ├─ engine/
   │  │  ├─ queue.ts           # 任务队列（持久化到 JSONL）
   │  │  ├─ runner.ts          # 单节点执行
   │  │  └─ graph.ts           # 上游解析、环检测
   │  └─ settings/
   │     └─ store.ts           # 全局设置（Electron safeStorage 加密 Key）
   ├─ preload/
   │  └─ index.ts
   ├─ renderer/
   │  ├─ index.html
   │  └─ src/
   │     ├─ main.tsx
   │     ├─ App.tsx
   │     ├─ canvas/
   │     │  ├─ Canvas.tsx
   │     │  ├─ nodes/
   │     │  │  ├─ BaseNode.tsx
   │     │  │  ├─ TextNode.tsx
   │     │  │  ├─ ImageNode.tsx
   │     │  │  ├─ VideoNode.tsx
   │     │  │  └─ AudioNode.tsx
   │     │  ├─ edges/FlowEdge.tsx
   │     │  ├─ TopBar.tsx
   │     │  ├─ BottomBar.tsx
   │     │  ├─ StatusBar.tsx
   │     │  ├─ PromptBar.tsx
   │     │  ├─ AddNodeMenu.tsx
   │     │  └─ Watermark.tsx
   │     ├─ panels/            # 资产、历史、设置、消耗明细
   │     ├─ stores/
   │     │  ├─ project.ts
   │     │  ├─ generation.ts
   │     │  └─ ui.ts
   │     ├─ theme/
   │     └─ styles/
   └─ shared/
      ├─ schema.ts             # 项目、画布、节点、边的 Zod schema
      ├─ types.ts              # 派生类型
      ├─ capabilities.ts       # 能力枚举与参数定义
      └─ ipc-contract.ts       # IPC 方法签名与事件
```

---

## 5. 项目文件夹格式

一个项目就是一个以 `.cinelab` 结尾的文件夹。双击由应用打开。

```
《短剧第一集》.cinelab/
├─ project.json              # 项目元信息
├─ canvas-<id>.json          # 每个画布一个文件
├─ characters.json           # 角色库
├─ history.jsonl             # 生成历史，追加写
├─ tasks.jsonl               # 任务记录，追加写
├─ assets/
│  ├─ img/<sha256>.png
│  ├─ vid/<sha256>.mp4
│  ├─ aud/<sha256>.mp3
│  └─ thumb/<sha256>.webp
├─ exports/
├─ .trash/                   # 删除的资产，保留 30 天
└─ .lock                     # 防止同一项目被两个窗口打开
```

### 5.1 project.json

```json
{
  "schemaVersion": 1,
  "id": "01J8X...",
  "name": "短剧第一集",
  "createdAt": "2026-11-04T10:00:00.000Z",
  "updatedAt": "2026-11-04T12:30:00.000Z",
  "canvases": [
    { "id": "cv_1", "name": "画布 1", "file": "canvas-cv_1.json" }
  ],
  "activeCanvasId": "cv_1",
  "settings": {
    "watermark": { "enabled": true, "text": "刘飞龙 2026-11-04", "opacity": 0.035 }
  }
}
```

### 5.2 canvas-<id>.json

```json
{
  "schemaVersion": 1,
  "id": "cv_1",
  "name": "画布 1",
  "viewport": { "x": 0, "y": 0, "zoom": 1 },
  "nodes": [],
  "edges": []
}
```

### 5.3 保存策略

- 每次结构性变更（增删节点、连线、移动结束、参数修改）触发 **500ms 防抖**保存。
- 保存采用「写临时文件 → rename」原子替换，避免写一半崩溃损坏。
- 同时保留 `canvas-<id>.json.bak`，最近一次成功版本。
- 应用崩溃后启动时检测 `.bak`，提示恢复。
- 关闭窗口前强制执行一次同步保存。

### 5.4 为什么用 JSON 而不是 SQLite

- 个人项目量级（几千节点）下，全量读写 JSON 在 10ms 内完成。
- JSON 可读、可 diff、可手动修复、可纳入 git。
- 避免 Electron 原生模块编译（better-sqlite3 需要 ABI 对齐），打包零风险。
- 生成历史用 JSONL 追加写，不随文件增大而变慢。

---

## 6. 数据模型

所有模型定义在 `src/shared/schema.ts`，用 Zod 校验，前后端共用。

### 6.1 节点

```ts
type NodeType = 'text' | 'image' | 'video' | 'audio'
type NodeStatus = 'idle' | 'queued' | 'running' | 'done' | 'error'

interface CineNode {
  id: string
  type: NodeType
  title: string              // 「图片节点 1」
  position: { x: number; y: number }
  size: { width: number; height: number }   // 不含标题行
  prompt: PromptDraft
  outputs: OutputRef[]
  selectedOutputId?: string
  status: NodeStatus
  error?: { message: string; retryable: boolean }
  createdAt: string
  updatedAt: string
}
```

### 6.2 生成草稿

```ts
interface PromptDraft {
  modelId: string            // "openai/gpt-image-1"
  mode: string               // "t2i" | "i2i" | "t2v" | "i2v" | "chat" | "tts"
  text: string
  negativePrompt?: string
  params: Record<string, unknown>   // 由模型 schema 决定，如 { ratio: "16:9", quality: "2k" }
  refs: RefInput[]
}

interface RefInput {
  source: 'node' | 'asset' | 'upload'
  nodeId?: string
  outputId?: string
  assetId?: string
  role: 'reference' | 'firstFrame' | 'lastFrame' | 'context' | 'style'
}
```

### 6.3 输出

```ts
interface OutputRef {
  id: string
  assetId: string            // 指向 assets/ 下的文件
  kind: 'image' | 'video' | 'audio' | 'text'
  runId: string
  createdAt: string
  meta: {
    width?: number
    height?: number
    duration?: number
    model: string
    provider: string
    cost?: number
  }
}
```

### 6.4 边

```ts
interface CineEdge {
  id: string
  source: string
  target: string
  role: 'reference' | 'firstFrame' | 'lastFrame' | 'context' | 'auto'
  createdAt: string
}
```

`role: 'auto'` 表示按目标节点类型推断，实际角色在解析时决定。

### 6.5 角色

```ts
interface Character {
  id: string
  name: string
  description: string
  refAssetIds: string[]
  seed?: number
  lora?: { name: string; weight: number }
  createdAt: string
}
```

### 6.6 模型定义

```ts
type Capability = 'text.chat' | 'image.t2i' | 'image.i2i' | 'video.t2v' | 'video.i2v' | 'audio.tts' | 'audio.music'

interface ModelDef {
  id: string                 // "openai/gpt-image-1"
  providerId: string
  name: string               // 显示名
  capability: Capability
  params: ParamDef[]
}

interface ParamDef {
  key: string
  label: string
  type: 'select' | 'number' | 'text' | 'boolean'
  options?: Array<{ value: string; label: string }>
  default?: unknown
  min?: number
  max?: number
  advanced?: boolean          // 收进「更多」
}
```

### 6.7 校验与迁移

- 每个文件带 `schemaVersion`。
- 读取时若版本低于当前，依次执行迁移函数，迁移后备份原文件。
- 校验失败不覆盖原文件，进入「只读恢复模式」，提示用户选择忽略或从 `.bak` 恢复。

---

## 7. 模型接入层

### 7.1 适配器接口

```ts
interface ModelAdapter {
  providerId: string
  capabilities: Capability[]
  models: ModelDef[]

  run(
    input: NormalizedInput,
    ctx: RunContext
  ): AsyncGenerator<ProgressEvent, GenerationResult>
}
```

用 `AsyncGenerator` 把三种形态统一掉：同步返回、轮询任务、流式输出。上层只消费事件，不关心底层协议。

```ts
interface NormalizedInput {
  modelId: string
  mode: string
  prompt: string
  negativePrompt?: string
  params: Record<string, unknown>
  refs: Array<{
    kind: 'image' | 'video' | 'text'
    role: string
    data: Buffer | string
  }>
}

type ProgressEvent =
  | { type: 'submitted'; taskId: string }
  | { type: 'progress'; percent: number; message?: string }
  | { type: 'preview'; assetId: string }
  | { type: 'done'; outputs: RawOutput[] }
  | { type: 'error'; message: string; retryable: boolean }

interface RunContext {
  signal: AbortSignal
  log: (msg: string) => void
  provider: ProviderConfig
  fetch: typeof fetch
}
```

### 7.2 内置适配器

| 适配器 | 覆盖范围 | 实现要点 |
|---|---|---|
| `openai-compat` | OpenAI、Azure、中转站、vLLM、Ollama | `/v1/images/generations`、`/v1/images/edits`、`/v1/chat/completions`；Base URL 可改 |
| `kling` | 可灵文生视频/图生视频/首尾帧 | 提交任务 → 轮询 `task_id` |
| `volcengine` | 火山方舟（即梦图片/视频） | AK/SK 签名或 API Key，任务轮询 |
| `http-template` | 任意 HTTP 服务 | 用户填 URL、请求体模板、响应路径、轮询配置 |

### 7.3 通用 HTTP 模板

面向没有官方适配器的服务，配置示例：

```json
{
  "name": "我的中转站",
  "submit": {
    "url": "{{baseUrl}}/v1/images/generations",
    "method": "POST",
    "headers": { "Authorization": "Bearer {{apiKey}}" },
    "body": {
      "model": "{{model}}",
      "prompt": "{{prompt}}",
      "size": "{{params.size}}"
    }
  },
  "response": {
    "type": "sync",
    "imagePath": "data[0].url"
  }
}
```

异步服务的 `response.type` 改为 `poll`，配置 `taskIdPath`、`pollUrl`、`statusPath`、`successValue`、`resultPath`。

变量只允许白名单：`baseUrl`、`apiKey`、`model`、`prompt`、`negativePrompt`、`params.*`、`refs.*`。

### 7.4 API Key 存储

- Key 存在应用数据目录的 `settings.json`，用 Electron `safeStorage` 加密（Windows 走 DPAPI）。
- 项目文件夹内**不存 Key**，避免把项目发给别人时泄露。
- 设置页显示掩码，支持单独清除。

---

## 8. 执行引擎

### 8.1 单节点执行

```
点击发送
  → 校验（模型已配置、提示词非空、必填参数齐全）
  → 解析上游：沿边向上收集所有节点输出
  → 计算输入指纹：hash(模型 + 模式 + 提示词 + 参数 + 上游输出 hash)
  → 命中缓存？直接返回已有输出，不消耗额度
  → 入队
  → 适配器 run()，事件流推给 renderer
  → 输出落盘 → 写 history.jsonl → 更新节点
```

### 8.2 上游解析

- 从目标节点反向 BFS，收集所有可达节点。
- 检测环：DFS 染色，遇到回边直接拒绝。
- 多条连线进入同一节点时，按 `role` 分组；`auto` 按 UI 规格 5.4 推断。
- 上游节点未生成输出时报错：「上游节点 X 还没有结果」。

### 8.3 缓存

- 指纹存 `history.jsonl` 的每条记录里。
- 再次生成前先查最近 1000 条，命中则直接复用资产。
- 缓存可在设置里关闭（调试模型时有用）。
- 不缓存带随机种子的请求，除非种子被锁定。

### 8.4 队列

- 全局并发：默认 2，可配置 1–5。
- 按提交顺序 FIFO，支持单任务取消、全部取消。
- 任务状态持久化到 `tasks.jsonl`，应用重启后未完成任务标记为「已中断」，可手动重试。
- 视频任务超时：默认 15 分钟，可配置。
- 失败重试：仅对 `retryable: true` 的错误自动重试 2 次，间隔 3s / 9s。

### 8.5 事件推送

主进程 → 渲染进程使用 `webContents.send('generation:event', payload)`：

```ts
type GenerationEvent =
  | { kind: 'status'; nodeId: string; status: NodeStatus }
  | { kind: 'progress'; nodeId: string; percent: number; message?: string }
  | { kind: 'done'; nodeId: string; outputs: OutputRef[] }
  | { kind: 'error'; nodeId: string; message: string; retryable: boolean }
  | { kind: 'queue'; pending: number; running: number }
```

渲染进程只维护展示状态，真实状态以主进程为准。

---

## 9. IPC 协议

`preload` 暴露 `window.api`，全部方法带 TypeScript 类型，定义在 `src/shared/ipc-contract.ts`。

```ts
interface CineApi {
  project: {
    create(name: string): Promise<ProjectMeta>
    openDialog(): Promise<ProjectSnapshot | null>
    open(path: string): Promise<ProjectSnapshot>
    save(canvasId: string, data: CanvasData): Promise<void>
    close(): Promise<void>
    listRecent(): Promise<RecentProject[]>
    removeRecent(path: string): Promise<void>
  }
  asset: {
    pickFiles(): Promise<AssetMeta[]>
    ingestPath(path: string): Promise<AssetMeta>
    ingestBuffer(data: ArrayBuffer, ext: string): Promise<AssetMeta>
    readAsDataUrl(assetId: string): Promise<string>
    reveal(assetId: string): Promise<void>
  }
  generate: {
    run(nodeId: string, draft: PromptDraft): Promise<{ runId: string }>
    cancel(runId: string): Promise<void>
    cancelAll(): Promise<void>
    onEvent(cb: (e: GenerationEvent) => void): () => void
  }
  settings: {
    get(): Promise<AppSettings>
    set(patch: Partial<AppSettings>): Promise<AppSettings>
    testProvider(providerId: string): Promise<{ ok: boolean; message: string }>
  }
  app: {
    getInfo(): Promise<{ version: string; platform: string; dataDir: string }>
    setTheme(theme: 'light' | 'dark' | 'system'): Promise<void>
    showItemInFolder(path: string): Promise<void>
  }
}
```

约定：

- 所有方法返回 Promise，错误统一抛 `{ code, message }`，渲染层用 toast 呈现。
- 事件订阅返回取消函数，组件卸载时必须调用。
- 不暴露 `ipcRenderer` 本体，避免任意通道调用。

---

## 10. 资产管线

### 10.1 写入流程

```
素材来源（上传 / 模型返回 / 拖拽）
  → 计算 sha256
  → 检查 assets/ 下是否已存在
      ├─ 存在：直接复用，返回已有 assetId
      └─ 不存在：写临时文件 → rename 到 assets/<kind>/<sha256>.<ext>
  → 生成缩略图 → assets/thumb/<sha256>.webp
  → 返回 AssetMeta
```

### 10.2 缩略图方案（零原生依赖）

| 类型 | 方案 |
|---|---|
| 图片 | Electron `nativeImage.createFromPath().resize({ width: 320 })`，输出 webp |
| 视频 | 渲染进程用 `<video>` + `<canvas>` 抽首帧，回传 buffer 给主进程 |
| 音频 | 渲染进程用 Web Audio API 解码，计算 200 个峰值点，存成 JSON |

**不引入 sharp、ffmpeg-static**。前者是原生模块要编译，后者体积 70MB 且平台相关。上面的方案全部走 Electron / 浏览器内置能力。

### 10.3 删除

- 删除资产先移入 `.trash/<date>/`，保留 30 天。
- 项目关闭时可选「清空回收站」。
- 引用计数为 0 的资产在清理时才真正删除。

### 10.4 路径安全

- 所有资产访问都通过 `assetId` 查表得到路径，不接受渲染层传入的任意路径。
- 拼接后校验 `path.resolve()` 结果必须位于项目目录内，防止路径穿越。

---

## 11. 性能设计

| 问题 | 措施 |
|---|---|
| 节点多导致渲染慢 | React Flow `onlyRenderVisibleElements`；节点组件 `React.memo`；非选中节点不订阅状态 |
| 图片解码卡顿 | 画布中一律用 320px 缩略图，全尺寸仅在打开大图时加载；`decoding="async"` |
| 连线重绘 | 自定义 edge 只在状态变化时更新；关闭不必要的动画 |
| 拖动掉帧 | 拖动时降级：隐藏阴影、关闭发光、降低精度 |
| 保存卡顿 | 防抖 500ms + 只写变化的文件 + 原子替换 |
| 启动慢 | 项目按需加载画布；历史记录分页读取最后 200 条 |
| 大量状态更新 | 生成进度用 `requestAnimationFrame` 合并，不逐条 setState |

目标：**200 节点 / 300 连线 / 1080p 下拖拽保持 50fps 以上**。

---

## 12. 安全

- `contextIsolation: true`、`sandbox: true`、`nodeIntegration: false`。
- 渲染进程 CSP 禁止 `unsafe-eval`，禁止加载远程脚本。
- 外部链接一律走 `shell.openExternal`，不在应用内打开。
- API Key 用 `safeStorage` 加密，写入项目文件的只有 provider/model 标识。
- 项目文件读取前用 Zod 校验，拒绝超长字符串和异常尺寸。
- 单实例锁，避免两个窗口同时写同一项目。
- `.lock` 文件记录持锁进程 PID，崩溃后可自动清理。

---

## 13. 里程碑

| 阶段 | 内容 | 验收 |
|---|---|---|
| **M0** | 脚手架、Electron 三进程、主题变量、空画布 | `pnpm dev` 打开窗口，能看到点阵画布和顶栏/底栏 |
| **M1** | 画布核心：节点拖拽、选中、`+` 拉线、添加菜单、prompt bar 骨架、水印 | 能创建四种节点并连线，刷新后位置保留 |
| **M2** | 图像生成闭环：Provider 设置、OpenAI 兼容适配器、任务队列、输出落盘、版本切换 | 输入提示词能出图，图片存进项目文件夹 |
| **M3** | 视频生成：可灵/火山适配器、异步轮询、首尾帧 | 图生视频跑通，进度可见 |
| **M4** | 文本与音频节点、角色库、模板系统 | 四类节点全通 |
| **M5** | 打包、性能打磨、导入导出、崩溃恢复 | 生成安装包，双击可用 |

当前状态：**M0 之前，文档阶段**。

---

## 14. 决策记录

| 决策 | 选择 | 放弃的方案 | 原因 |
|---|---|---|---|
| 桌面壳 | Electron | Tauri | 全 TS 开发，无需 Rust；桌面能力成熟；150MB 体积可接受 |
| 画布引擎 | React Flow 12 | tldraw | tldraw SDK 有商用授权限制；React Flow 节点即 DOM，好做复杂交互；社区复刻案例多 |
| 存储 | JSON + JSONL | SQLite | 零原生依赖，打包不翻车；个人数据量用不上数据库；文件可读可修 |
| 模型接口 | AsyncGenerator | 回调 / Promise 轮询 | 同步、轮询、流式三种形态统一，调用方代码一致 |
| 后端 | 无独立服务 | Hono / Express | 主进程即后端，少一层进程，无端口无 CORS |
| 画布组织 | 自由画布 | 分镜 / 场次 / 网格 | 用户明确选择完全复刻 LibTV |
| 参数入口 | 仅 prompt bar | 节点内参数面板 | 节点保持干净，画布容纳更多内容 |
| 缩略图 | Electron nativeImage + 浏览器 API | sharp / ffmpeg-static | 避免原生模块和 70MB 依赖 |

---

## 15. 全局资产库（2026-11）

资产库不再跟随项目，统一存放在用户配置的全局目录，默认 `文档/CineLab Assets`，路径记录在 `userData/library.json`，可在设置 → 资产库中修改。

```
<全局库根>/
├─ 角色/
│  └─ 林小雨/
│     ├─ 正面.png
│     └─ 侧面.png
├─ 场景/
├─ 道具/
├─ 风格/
├─ 音频/
└─ 提示词/
   └─ 雪夜电影感.prompt.json
```

- 文件夹即分类，支持任意层级；首次启动自动创建上述 6 个默认文件夹。
- 角色是「角色/<角色名>/」目录约定，PromptBar 角色菜单按目录扫描。
- 提示词模板为 `.prompt.json`：`{ "version": 1, "kind": "image", "prompt": "..." }`，文件名即模板名。
- 资产以磁盘为准，不维护索引；扫描时忽略 `.*`、`Thumbs.db`、`*.meta.json`、`*.prompt.json`。
- 画布引用通过 `OutputRef.scope` 区分：`project` 相对项目根，`global` 相对库根。
- 协议：`cinelab-asset://local/<项目相对路径>`、`cinelab-asset://global/<库相对路径>`。
- 生成参考图按 scope 分别从项目根或库根读取。
- 节点工具栏「入库」把当前选中输出复制到指定文件夹，文件名默认取节点标题，重名追加 ` (2)`。
- 删除项目只删 `.cinelab` 文件夹，不影响全局资产库。

限制：导出项目 zip 暂未打包 global 引用；旧项目内 `library/` 不再读取。
