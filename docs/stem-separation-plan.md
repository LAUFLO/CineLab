# 人声与背景音分离方案

日期：2026-11-22
状态：参考（已实施，待听感验收）
关联：[ui-spec.md](ui-spec.md)、[code-map/01-canvas.md](code-map/01-canvas.md)、[code-map/07-storage-ipc.md](code-map/07-storage-ipc.md)、[agent-capabilities.md](agent-capabilities.md)

## 1. 背景

当前视频节点的「分离音视频」只有一个操作：用 ffmpeg 拆出无声视频和完整音轨，没有菜单，也没有人声/背景音能力。

目标是把入口扩展为三项：

1. **分离音视频**：无声视频 + 原始音轨。
2. **人声提取**：无声视频 + 人声音轨。
3. **背景音提取**：无声视频 + 背景音轨。

同时支持音频节点：音频节点只提供「人声提取 / 背景音提取」，不提供「分离音视频」。

## 2. 最终决策

### 2.1 输出

| 源节点 | 菜单项 | 输出 |
|---|---|---|
| 视频 | 分离音视频 | 无声视频 + 原始音轨 |
| 视频 | 人声提取 | 无声视频 + 人声音轨 |
| 视频 | 背景音提取 | 无声视频 + 背景音轨 |
| 音频 | 人声提取 | 人声音轨 |
| 音频 | 背景音提取 | 背景音轨 |

- 音频源没有视频流，只输出音频节点，不生成空白视频。
- 每次操作都新建无声视频节点；文件按内容哈希去重，磁盘不会重复存储。
- 组内纵向排列（视频在上、音频在下），组名为「音视频组 N / 人声提取组 N / 背景音提取组 N」。
- 音频输出统一为 44.1kHz 立体声 AAC 192k `.m4a`；5.1 下混，v1 取第一条音轨。
- 背景音 = `drums + bass + other`（Demucs 默认 `add`）。

### 2.2 交互

- 视频节点：`分离音视频` → `分离音视频 / 人声提取 / 背景音提取`。
- 音频节点：`音频分离` → `人声提取 / 背景音提取`。
- 按截图做下拉菜单，不新增三个一级按钮。
- 沿用现有 `NodeToolbar` 的 `menu` / `MenuItem`，不新增浮层组件。

### 2.3 时长与质量策略

- 不设硬上限。
- ≤10 分钟：整段 `apply_model`，`shifts=1`，优先质量；峰值内存约 2–2.5GB。
- >10 分钟：7.8 秒分段、25% 重叠、`shifts=0`，memmap 叠加，峰值内存不随时长增长。
- 超过 10 分钟提示预计耗时；不阻塞、不强制确认；随时可取消。
- 会话级缓存：按「源路径 + mtime + size + 模型 SHA」缓存人声和背景音 WAV，LRU 保留最近 2 个素材；退出应用清理。

### 2.4 任务与生命周期

- 人声/背景音异步执行；普通「分离音视频」仍同步 ffmpeg。
- 分离任务串行队列 FIFO；节点显示「排队中 · 第 N 位 / 分离中 42%」。
- 完成、失败、取消都保留占位节点：
  - 失败/取消显示错误面板；
  - 「重试」从任一节点发起，重试整个组，复用原占位节点；
  - 只有用户删除/撤销才移除节点。
- 删除任一占位节点、整个组或源视频 → 取消整个任务，剩余占位标记「已取消」。
- 切换/关闭项目时弹确认，确认后取消任务并标记中断；退出应用直接终止子进程；重启后把未完成任务标记「任务已中断，请重试」。
- 任务运行时禁止卸载 `stem-model` 或 `depth-runtime`。
- 完成通知复用现有系统通知：任务超过 60 秒或窗口不在前台时通知；前台只 toast。
- 任务进度只在节点本地显示，不做全局任务中心。

### 2.5 运行时与模型分发

- 内部 `ComponentKind` 保持 `'depth-runtime'` 不变；显示名改为「本地 AI 运行时」。
- 描述说明它同时服务深度动作捕捉、视觉增强、人声/背景音分离。
- Demucs worker 代码随应用发布，放在 `resources/stem-worker`，不走组件下载。
- 组件改为单数 `stem-model`，只包含 `htdemucs.th` 模型文件（约 84MB）。
- 模型从 Meta 官方地址下载，失败回退 HF 镜像；SHA256 校验后安装；应用不重新分发权重。
- v1 不做手动导入模型；下载失败给重试和镜像。
- 未安装组件时打开「设置 → 模型与运行时 → 组件」，高亮「本地 AI 运行时」和「HTDemucs 模型」两个卡片；不自动下载大文件。

### 2.6 Agent

- 继续使用 `split-av` + `itemId`，不新增第 18 个操作。
- `itemOptions`：`['av', 'vocal', 'background']`；`itemId` 必填。
- 音频节点只暴露 `vocal` / `background`；对音频节点传 `av` 明确报错。
- 人声/背景音立即返回 `taskId` 和占位节点 ID；完成后界面自动写入。
- 扩展 `canvas_get`，节点摘要增加 `status` 和 `progress`，不新增任务状态工具。
- 人声分离与视觉/深度任务不共用队列；只串行分离任务。

### 2.7 验收与提交

- 合并前由开发者准备 2–3 条真实素材（对白 + BGM、纯音乐、环境声），用户听感确认后再合并。
- macOS 不作为合并/发版阻断项：CI 能跑就跑一次冒烟；跑不了或失败只记录，Release notes 标注「macOS 未实机验证」。
- 本次实现完成后只本地提交，不推送、不打 tag、不打包。

## 3. 现状

| 层 | 现状 |
|---|---|
| 操作定义 | `split-av` 只支持 `video`，没有 `menu` |
| 执行器 | `executeSplitAv` 创建无声视频 + 音轨两个占位节点并成组 |
| 主进程 | `splitAv` 用 ffmpeg 拆视频和 AAC 音轨 |
| IPC | `media:split-av`，请求只有 `path` |
| 组件 | 已有按需下载的 `depth-runtime`、`vision-models`、`whisper-*` |
| Agent | `split-av` 可直接执行，没有 `itemRequired` |
| 文档 | `ui-spec.md`、`code-map/01-canvas.md`、`agent-capabilities.md` 只写了单项 |

关键文件：

- `src/renderer/src/canvas/nodes/node-operations.ts`
- `src/renderer/src/canvas/nodes/node-operation-runner.ts`
- `src/renderer/src/canvas/NodeContextMenu.tsx`
- `src/renderer/src/canvas/nodes/NodeToolbar.tsx`
- `src/main/media/video.ts`
- `src/main/ipc/media.ts`
- `src/preload/index.ts`
- `src/shared/media.ts`
- `src/shared/node-operation-specs.ts`

## 4. 技术路线

### 4.1 普通分离

继续用 ffmpeg：

- 无声视频：`-an -c:v copy -movflags +faststart`
- 原始音轨：`-vn -c:a aac -b:a 192k`

无新增依赖，沿用 `splitAv`。

### 4.2 人声/背景音

使用本地 **Demucs v4 `htdemucs`**：

- 复用 `depth-runtime` 的 Python 3.11.9 + PyTorch 2.8.0 CPU；
- worker 代码随应用发布，不新增 Python/torch 运行时；
- 完全本地推理，不上传素材；
- 输出 `vocals` 和 `drums + bass + other`。

不采用：

| 方案 | 不采用原因 |
|---|---|
| ffmpeg 声道相减 | 只能削中置声道，音乐会被一起削掉，对白不纯 |
| `dialoguenhance` | 对话增强，不是分轨 |
| `arnndn` / `afftdn` | 降噪，不是人声分离 |
| 云端 API | 需要 Key、上传素材、按分钟计费 |
| ONNX + onnxruntime | 模型更大，还要新增运行时/原生依赖；当前 PyTorch 路线已验证 |

### 4.3 原型验证

| 项目 | 结果 |
|---|---|
| 模型 | `htdemucs.th`，84,141,911 字节 |
| SHA256 | `8726e21a993978c7ba086d3872e7608d7d5bfca646ca4aca459ffda844faa8b4` |
| 模型加载 | 约 0.37 秒 |
| 10 秒音频分离 | 约 7.4–7.6 秒 |
| 峰值内存 | 约 1.6GB |
| 对白 + 测试音 | 人声轨测试音能量很低，背景轨保留测试音 |

短素材、合成素材验证通过；真实影视素材仍需听感抽测。

## 5. 交互与输出

### 5.1 操作定义

`split-av` 扩展为视频和音频共用，并按节点类型覆盖标签、菜单和分区：

```ts
{
  id: 'split-av',
  label: '分离音视频',
  labelByKind: { audio: '音频分离' },
  kinds: ['video', 'audio'],
  defaultPrimary: true,
  section: 'video',
  sectionByKind: { audio: 'audio' },
  menu: [
    { id: 'av', label: '分离音视频' },
    { id: 'vocal', label: '人声提取' },
    { id: 'background', label: '背景音提取' }
  ],
  menuByKind: {
    audio: [
      { id: 'vocal', label: '人声提取' },
      { id: 'background', label: '背景音提取' }
    ]
  }
}
```

`operationsForKind(kind)` 负责应用 `labelByKind`、`menuByKind`、`sectionByKind`。工具栏、右键菜单、Agent 能力目录都从同一份结果读取。

### 5.2 输出节点

| 模式 | 视频源 | 音频源 |
|---|---|---|
| `av` | 无声视频 + 原始音轨，组名「音视频组 N」 | 不允许 |
| `vocal` | 无声视频 + 人声音轨，组名「人声提取组 N」 | 人声音轨，不成组 |
| `background` | 无声视频 + 背景音轨，组名「背景音提取组 N」 | 背景音轨，不成组 |

节点标题：

- 无声视频：`原标题 · 无声`
- 原始音轨：`原标题 · 音轨`
- 人声：`原标题 · 人声`
- 背景音：`原标题 · 背景音`

所有输出都从源节点自动连线，保留来源关系。

## 6. 架构

### 6.1 数据流

```text
NodeToolbar / ContextMenu
  → executeNodeOperation({ operationId: 'split-av', itemId })
  → av：同步 ffmpeg
  → vocal/background：启动本地任务
      → 主进程串行队列
      → 命中会话缓存？直接编码
      → 未命中：ffmpeg 解码 44.1kHz 立体声 WAV
      → Python worker（≤10 分钟整段 / >10 分钟分段流式）
      → memmap/WAV + ffmpeg 编码 m4a
      → ingestAsset
      → 任务完成事件
      → 渲染进程应用视频/音频输出
```

### 6.2 共享类型

`src/shared/media.ts`：

```ts
export type StemMode = 'vocal' | 'background'
export type SplitAvMode = 'av' | StemMode

export interface SplitAvRequest {
  path: string
}

export interface SplitAvResult {
  video: GeneratedAsset
  audio: GeneratedAsset | null
}

export interface StemTaskRequest {
  path: string
  mode: StemMode
  sourceKind?: 'video' | 'audio'
  title?: string
}

export interface StemTaskResult {
  video: GeneratedAsset | null
  audio: GeneratedAsset
}

export type StemTaskStatus =
  | 'queued'
  | 'running'
  | 'done'
  | 'error'
  | 'cancelled'

export interface StemTaskEvent {
  taskId: string
  status: StemTaskStatus
  percent?: number
  message?: string
  queuePosition?: number
  result?: StemTaskResult
  error?: string
}

export interface StemTaskStartResult {
  taskId: string
  queuePosition: number
}
```

普通分离仍使用 `SplitAvRequest` / `SplitAvResult`；人声/背景音使用独立的任务类型，避免把视频结果强制改成可空。

### 6.3 主进程

新增：

- `src/main/media/stems.ts`
  - 校验 `depth-runtime` 和 `stem-model`；
  - 校验音轨、时长、源类型；
  - ffmpeg 解码/编码；
  - 调用 Python worker；
  - 会话缓存；
  - `ingestAsset`。
- `src/main/media/stem-tasks.ts`
  - 仿照 `depth-tasks.ts` 的任务生命周期；
  - FIFO 串行队列；
  - 排队、运行、完成、失败、取消；
  - 通过 `stem-task:event` 广播；
  - 完成通知。
- `src/main/media/process.ts`（或等价公共模块）
  - 抽取 `pythonBinary()`、`withTempDir()`、进程终止等公共逻辑。

IPC：

- `media:split-av`：同步普通分离（仅视频源）。
- `media:stem-start`：启动人声/背景音任务，返回 `taskId` 和队列位置。
- `media:stem-cancel`：取消任务。
- `stem-task:event`：任务状态与进度。

`preload` 和 `src/shared/ipc-contract.ts` 同步暴露以上接口。

### 6.4 Worker

新增 `resources/stem-worker/worker.py`：

- 读取 ffmpeg 生成的 44.1kHz 立体声 PCM WAV；
- 加载 `htdemucs.th`；
- ≤10 分钟：整段 `apply_model(shifts=1)`；
- >10 分钟：7.8 秒分段、25% 重叠、`shifts=0`、memmap 叠加；
- 人声 = `vocals`；
- 背景音 = `drums + bass + other`；
- 输出 WAV；
- stdout 输出 JSON 进度：

```json
{"stage":"progress","percent":42.5}
{"stage":"done","percent":100}
{"stage":"error","message":"..."}
```

- 分段路径峰值内存约为「模型 + 一个分段」；
- 临时磁盘约为「时长 × 4 字节 × 3 份」，任务结束清理；
- 取消由主进程终止子进程。

### 6.5 渲染进程任务

新增 `src/renderer/src/stores/stem-tasks.ts`：

- 订阅 `stem-task:event`；
- 任务 meta 保存 `pendingVideoId`、`pendingAudioId`、`mode`、`title`、`sourceNodeId`；
- `running` 时更新占位节点 `progress`；
- `done` 时应用 `result.video` / `result.audio`；
- `error` / `cancelled` 时保留节点并标记状态；
- 任务 ID 写入占位节点 `data.stemTaskId`；
- `App.tsx` 注册 `subscribeStemTasks()`。

### 6.6 占位节点、取消与重试

- 视频占位节点覆盖层显示「排队中 · 第 N 位 / 分离中 42%」；取消优先读 `data.stemTaskId`。
- 音频占位节点由 `AudioPlayer` 显示进度和取消。
- 视频/音频两个占位节点共享同一个任务 ID；从任一节点取消，两个节点都标记「已取消」。
- 失败/取消保留节点；错误面板「重试」从任一节点发起，重试整个组，复用原占位节点。
- 删除任一占位节点、整个组或源视频 → 取消任务。
- 项目切换/关闭弹确认并取消；应用退出终止子进程；重启标记中断。

## 7. 组件

### 7.1 组件与代码

- 新增 `ComponentKind: 'stem-model'`，目录 `stem-model`。
- 组件只包含 `htdemucs.th`（约 84MB），使用现有单文件模型下载流程。
- worker 代码、vendored Demucs/julius、LICENSE/NOTICE 放在 `resources/stem-worker`，随应用发布。
- `readInstalled` 检查 `stem-model/htdemucs.th`。
- 模型 URL：Meta 官方 + HF 镜像；SHA256 校验；失败重试。
- v1 不做手动导入。

设置页「模型与运行时 → 组件」新增卡片：

> **HTDemucs 人声分离模型**
> 约 84MB。用于人声提取和背景音提取，复用「本地 AI 运行时」。
> 未安装时点击人声/背景音会打开此页面并提示。

### 7.2 运行时显示名

- `COMPONENTS['depth-runtime'].label` 改为「本地 AI 运行时」。
- `ComponentsSection` 的 `COMPONENT_META` 同步。
- `vision.ts`、`NodeToolbar`、`DepthCaptureDialog` 的错误提示改为「本地 AI 运行时」。
- 内部 kind、目录、manifest、Release 资产保持 `depth-runtime` 不变。
- 在 `src/shared/components.ts` 或 `manifest.ts` 加注释，说明命名是历史兼容。

## 8. Agent

`src/shared/node-operation-specs.ts`：

```ts
'split-av': {
  executable: true,
  itemRequired: true,
  itemOptions: ['av', 'vocal', 'background']
}
```

- 音频节点的能力目录只返回 `vocal` / `background`。
- 对音频节点执行 `itemId: 'av'` 返回明确错误。
- `canvas_node_operations` 工具说明补充「分离音视频 / 人声提取 / 背景音提取」。
- 人声/背景音是异步任务，Agent 返回 `taskId` 和占位节点 ID。
- 扩展 `canvas_get` 节点摘要：`status`、`progress`。
- 不新增任务状态工具；取消由界面操作。
- 操作总数仍为 17 个。

## 9. 错误与边界

| 场景 | 行为 |
|---|---|
| 视频无音轨 | 整个 `split-av` 禁用，提示「当前视频无音轨」 |
| 音频节点选 `av` | 拒绝，提示只能提取人声或背景音 |
| 未装 `depth-runtime` | 打开组件设置，提示先安装「本地 AI 运行时」 |
| 未装 `stem-model` | 打开组件设置，提示安装「HTDemucs 人声分离模型」 |
| 素材超过 10 分钟 | 不阻止；提示预计耗时，可取消 |
| 多个任务同时发起 | FIFO 排队；节点显示「排队中 · 第 N 位」 |
| Worker 崩溃 / OOM | 任务失败，占位节点显示错误，临时文件清理 |
| 单声道 / 5.1 | 下混为 44.1kHz 立体声 |
| 多音轨视频 | v1 取第一条音轨 |
| 取消任务 | 终止子进程；两个占位节点标记「已取消」 |
| 删除占位/组/源视频 | 取消整个任务 |
| 切换/关闭项目 | 弹确认并取消任务，标记中断 |
| 应用重启 | 未完成任务标记「任务已中断，请重试」 |
| 任务运行时卸载组件 | 阻止卸载，提示先取消任务 |

## 10. 测试与验收

### 10.1 自动化

- 共享层：
  - `split-av` 三个 itemId 合法；
  - 缺 itemId 时 Agent 校验报错；
  - 非法 itemId 报错；
  - 音频节点菜单只有两项。
- 渲染层：
  - 视频节点标签「分离音视频」、菜单三项；
  - 音频节点标签「音频分离」、菜单两项；
  - 取消/重试按钮路由到 stem task。
- 主进程：
  - 普通分离仍能产生无声视频 + 原始音轨；
  - 无音轨报错；
  - 组件缺失报明确错误；
  - 任务排队、进度、完成、取消事件正确；
  - 音频源只输出音频；
  - 缓存命中不重复调用 worker。
- 现有测试、`typecheck`、`check:ui`、`check:docs`、`build` 保持通过。

### 10.2 手动验收

- 对白 + BGM 的 10 秒视频：人声轨对白清晰，背景轨保留音乐。
- 纯音乐、纯环境声、单声道、5.1 各一条。
- 音频节点：人声/背景音可出，且不生成无声视频。
- 视频节点：三项都生成「无声视频 + 音频」并成组。
- 未安装组件：点击后打开组件设置，不产生失败节点。
- 安装、卸载、重装组件正常；运行时禁止卸载。
- 超长素材：进度持续更新，取消能在数秒内停止。
- 切换项目/重启：任务取消或标记中断，不出现永久转圈。
- 听感验收：开发者准备 2–3 条真实素材，用户确认后合并。

## 11. 实施顺序

1. 方案文档、共享类型、按类型菜单与按钮标签。
2. 普通分离保持同步，补齐视频/音频节点的输出与分组。
3. `stem-model` 组件、worker、整段/分段推理、主进程任务队列。
4. 渲染进程任务状态、进度、取消、重试、占位节点。
5. Agent 规格、`canvas_get` 状态、工具说明、文档与测试。
6. 手动 QA、`map:code`、`check:docs`、全量测试、构建。

预计工作量约 4–5 天，不含真实素材质量返工。

## 12. 风险

1. **长素材耗时**：不限制时长，但 1 小时素材在 CPU 上约需 45–60 分钟；只能通过进度和取消改善体验。
2. **分段质量**：>10 分钟流式路径使用 `shifts=0`，质量略低于整段随机 shift；短素材走整段，优先质量。
3. **macOS**：不做发版阻断；CI 能跑就跑，跑不了标注「未实机验证」。
4. **模型许可**：应用只分发 MIT 代码，权重从官方/镜像下载，不随应用重新分发。
5. **内存并发**：只串行分离任务；视觉/深度任务保持现有并发，QA 观察 8GB 机器是否 OOM。
6. **音频源无视频**：音频节点只输出音频，不生成空白视频。

## 13. 完成定义

- [x] 视频节点三项菜单、音频节点两项菜单可用。
- [x] 视频源三项均输出「无声视频 + 对应音频」并成组。
- [x] 音频源只输出人声/背景音。
- [ ] 本地 Demucs 模型可下载、校验、卸载、重装。
- [x] 人声/背景音任务支持排队、进度、取消、重试。
- [x] 删除/撤销/切换项目/重启的任务生命周期正确。
- [x] 未安装组件时有明确引导，不产生失败节点。
- [x] Agent 能执行三个 itemId，音频节点拒绝 `av`。
- [x] `canvas_get` 返回节点状态和进度。
- [x] 文档、代码地图、能力清单同步。
- [x] `typecheck`、测试、`check:ui`、`check:docs`、构建通过。
- [ ] 用户完成真实素材听感验收。
- [ ] 仅本地提交，不推送、不打 tag、不打包。
