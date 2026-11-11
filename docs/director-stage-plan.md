# 导演台方案：3D 片场 + 本地白模预演

日期：2026-11-09
状态：**已实施**（2026-11-11 合并入 main）
适用版本：`main` @ `b76a064`
关联：LibTV 3D 导演台 / 3D-BOX、TapNow CineMap
关联文档：`docs/agent-capabilities.md`、`docs/ui-spec.md` 第 16 节、`docs/agent-full-scope.md`、`docs/clip-studio-plan.md`

## 当前实现摘要

- 场景：`DirectorsStageDoc` 存储于 `stages/<stageId>.json`，`StageCommand` 是唯一写入口。
- 对象：人物、立方体、球体、平面、群众、glTF；支持位置/旋转/缩放、姿势、颜色、可见性。
- 机位：多机位、位置/目标/FOV/画幅、机位关键帧运镜。
- 镜头：添加/修改/删除、时长、画幅、机位绑定。
- 背景：纯色、全景图、模型。
- 白模预演：three.js 隐藏窗口逐帧渲染 + ffmpeg 编码，导出后回画布。
- Agent：`stage_*` 工具覆盖对象、机位、镜头、运镜、背景和预演；写场景前自动打开导演台，同一轮合并一条场景撤销。
- 当前未开放：对象动作轨、独立灯光实体。

## 1. 产品定义

导演台是画布中的轻量级 3D 片场节点，不是完整 3D 建模软件。用户在三维空间里摆放人物素模、道具、场景和机位，调整运镜，导出机位截图与本地白模预演视频，再把结果送回画布，作为分镜、首帧或正式视频生成的参考。

核心定位：

> **先在 3D 片场里试拍，再决定正式画面怎么生成。**

导演台有两条入口，共用同一套场景数据与命令层：

- **手动编辑**：用户在 3D 视口里摆放、调整、设机位、调运镜。
- **Agent 编辑**：用户用自然语言描述场景和镜头，Agent 读取剧本/分镜/参考图，生成场景草案，确认后调用工具搭建和修改。

### 1.1 白模预演的定义

本文明确：

- 白模预演是**本地 3D 渲染**，由 three.js 按运镜时间轴逐帧渲染，ffmpeg 编码成 MP4。
- 白模预演**不是**用视频生成模型做的「白模风格视频」。
- 白模预演不消耗模型费用，只消耗本地 CPU/GPU。
- 白模预演视频是**参考素材**，不是最终成片；最终成片仍由正式视频模型生成，并在剪辑室完成。

### 1.2 输出物

| 输出 | 用途 |
|---|---|
| 机位截图 | 作为分镜参考图、首帧/尾帧参考、图片生成参考 |
| 白模预演视频 | 作为正式视频生成的参考视频，约束空间、站位、机位、运镜 |
| 场景 JSON | 项目内可复用、可继续编辑、可复制到其他画布 |
| 场景 glb（可选） | 导出给外部工具查看或备份 |

## 2. 参考产品已验证的形态

### 2.1 LibTV 3D-BOX

- 双击画布空白新建「导演台」节点，进入全屏 3D 空间。
- 人体素模、基础几何、群众阵列、本地上传模型。
- 元素列表支持删除、重命名、打组、隐藏；属性面板支持颜色、姿势、变换。
- V 移动、R 旋转、S 缩放，Shift 等比。
- 多机位：新增、位置、注视点、FOV、截图比例。
- 导演视角看全局，机位视角看最终构图。
- 机位截图一键回画布。
- 720° 全景背景，普通场景图可转全景。
- Agent 可以搭景、调度站位、手绘轨迹运镜。
- 白模预演片段作为参考视频，接正式视频生成。

### 2.2 TapNow CineMap

- 文本/图片转可交互 3D 片场，Agent 根据描述创建或修改场景。
- 片场内 Agent 输入框：说明场景里有什么、主体如何行动、镜头如何移动、持续多久。
- 片场设置 → 拍摄 → 选择镜头 → 选择运镜 → 播放运镜。
- 运镜调整打开时间轴，选中关键帧修改位置、旋转等设置。
- 导出当前帧到画布、下载 PNG、导出视频到画布。
- 上传 `.gltf` / `.glb`，支持补充纹理；场景可导出 glb。
- 预览、拍摄、进入片场不调用生成模型；片场内使用生成能力才计费。

两边共同验证了：

1. 手动 + Agent 混合是可行且必要的。
2. 白模预演视频是本地渲染，不是 AI 视频生成。
3. 运镜时间轴是核心，不只是静态截图。
4. 场景需要可复用、可继续编辑、可导出。

## 3. CineLab 目标

### 3.1 完整版

- 新节点类型 `stage`（导演台），作为画布中的 3D 片场节点。
- 全屏 3D 编辑器，三栏布局：元素列表 / 视口 / 属性。
- 内置人体素模，至少 4 体型；基础几何体；群众阵列。
- 变换工具：移动、旋转、缩放、吸附、对齐。
- 姿势预设：站、坐、走、跑、跪、伸手、对峙、回头等。
- 多机位：新增、切换、位置、注视点、FOV、画幅。
- 导演视角 / 机位视角切换。
- 机位截图回传画布，生成图片节点。
- 720° 全景背景，与现有全景能力联动。
- 运镜时间轴：镜头、关键帧、播放预演。
- 本地白模预演视频导出：逐帧渲染 + ffmpeg 编码。
- 场景独立存储，可复制、可导出、可重新打开。
- Agent 工具：搭景、摆位、机位、运镜、截图、渲染预演。
- 白模视频作为参考视频，接正式视频生成节点。
- 与分镜组、剪辑室联动：机位截图进分镜组，白模镜头可进时间线做预演剪辑。

### 3.2 非目标

- 不做 Blender 级建模、绑定、复杂角色动画。
- 不做 AI 生成 3D 资产作为首期前置条件。
- **不做白模风格的视频生成**；白模预演只走本地 3D 渲染。
- 不替代剪辑室；正式成片仍在剪辑室完成。
- 不做云端 3D 场景服务。

## 4. 核心原则

1. **手动与 Agent 共用命令层**：所有场景写操作走 `StageCommand`，不写两套逻辑。
2. **场景独立存储**：`stages/<stageId>.json`，节点只存引用，复制/导出/版本更干净。
3. **白模预演本地渲染**：不调用视频模型，不产生模型费用。
4. **所有写操作可撤销**：一轮 Agent 操作打包成一条撤销记录。
5. **Agent 不直接写坐标**：用相对指令，由工具换算成坐标，降低模型空间推理负担。
6. **白模视频是参考素材**：不是成片，不覆盖正式生成结果。
7. **先预览后高清**：默认低清快速预览，确认后再导出高清。

## 5. 数据模型

### 5.1 存储

```
stages/<stageId>.json          // 场景文档
节点 data: {
  kind: 'stage'
  stageId: string
  title: string
  activeCameraId?: string
}
```

与剪辑室 `timelines/<id>.json` 的约定一致。复制节点时深拷贝 stage 文件；项目导出时把 `stages/` 打进包；切换画布/项目时先保存。

### 5.2 场景文档

```ts
interface DirectorStageDoc {
  version: 1
  stageId: string
  name: string
  background: StageBackground
  objects: StageObject[]
  cameras: StageCamera[]
  shots: StageShot[]
  activeCameraId?: string
  updatedAt: string
}

interface StageBackground {
  kind: 'color' | 'panorama' | 'model'
  value: string
}

interface StageObject {
  id: string
  type: 'human' | 'box' | 'sphere' | 'plane' | 'gltf' | 'crowd'
  name: string
  transform: {
    position: [number, number, number]
    rotation: [number, number, number]
    scale: [number, number, number]
  }
  pose?: string
  color?: string
  visible?: boolean
  parentId?: string
}

interface StageCamera {
  id: string
  name: string
  position: [number, number, number]
  target: [number, number, number]
  fov: number
}

interface StageShot {
  id: string
  cameraId: string
  durationMs: number
  aspect: '16:9' | '9:16' | '1:1'
  cameraTrack?: CameraKeyframe[]
  actionTracks?: ActionTrack[]
}

interface CameraKeyframe {
  timeMs: number
  position: [number, number, number]
  target: [number, number, number]
  fov: number
  easing?: 'linear' | 'easeIn' | 'easeOut' | 'easeInOut'
}

interface ActionTrack {
  objectId: string
  keys: ActionKeyframe[]
}

interface ActionKeyframe {
  timeMs: number
  position?: [number, number, number]
  rotation?: [number, number, number]
  pose?: string
  easing?: 'linear' | 'easeIn' | 'easeOut' | 'easeInOut'
}
```

### 5.3 与现有节点/项目的关系

- `CanvasNodeKind` 增加 `stage`。
- `NODE_META`、项目 schema、PromptBar 过滤、节点图标、搜索、导出同步更新。
- 导演台节点自身不直接产出媒体，输出的是截图/视频节点；工具栏提供「打开导演台」「截图」「导出预演」。
- 场景文档不进入画布历史快照；撤销靠 `StageCommand` 历史，节点标题等元数据仍走画布历史。

## 6. 命令层 StageCommand

```ts
type StageCommand =
  | { type: 'addObject'; object: StageObject }
  | { type: 'removeObject'; objectId: string }
  | { type: 'transformObject'; objectId: string; transform: Partial<StageObject['transform']> }
  | { type: 'setPose'; objectId: string; pose: string }
  | { type: 'setColor'; objectId: string; color: string }
  | { type: 'setVisible'; objectId: string; visible: boolean }
  | { type: 'addCamera'; camera: StageCamera }
  | { type: 'updateCamera'; cameraId: string; patch: Partial<StageCamera> }
  | { type: 'removeCamera'; cameraId: string }
  | { type: 'addShot'; shot: StageShot }
  | { type: 'updateShot'; shotId: string; patch: Partial<StageShot> }
  | { type: 'removeShot'; shotId: string }
  | { type: 'setCameraTrack'; shotId: string; track: CameraKeyframe[] }
  | { type: 'setActionTrack'; shotId: string; track: ActionTrack }
  | { type: 'captureFrame'; cameraId: string; shotId?: string }
  | { type: 'renderPreview'; shotId: string; options: PreviewOptions }
```

要求：

- 纯函数式 `applyStageCommand(doc, command)`，可单测。
- 支持 `batch`，一轮 Agent 操作打包成一条撤销记录。
- 预览：`applyStageCommand` 计算新文档，不写 store，用于方案预览。
- 手动 UI 与 Agent 共用同一组命令。
- 命令校验：对象/机位/镜头存在性、数值有限、时长上限、引用完整性。

## 7. Agent 工具

新增 `stage.*` 工具，按 profile 和权限过滤：

| 工具 | 说明 | 只读 |
|---|---|---|
| `stage.get` | 读取场景、对象、机位、镜头、当前激活机位 | 是 |
| `stage.capabilities` | 可用素模、姿势、模型库、渲染能力 | 是 |
| `stage.addObject` | 添加人物/几何/群众/glTF | 否 |
| `stage.transformObject` | 移动/旋转/缩放，支持相对指令 | 否 |
| `stage.setPose` | 设置姿势预设 | 否 |
| `stage.setColor` | 设置颜色 | 否 |
| `stage.addCamera` | 新建机位 | 否 |
| `stage.updateCamera` | 位置、注视点、FOV | 否 |
| `stage.removeCamera` | 删除机位 | 否 |
| `stage.addShot` | 新建镜头 | 否 |
| `stage.setCameraTrack` | 设置运镜关键帧 | 否 |
| `stage.setActionTrack` | 设置人物动作路径 | 否 |
| `stage.captureFrame` | 机位截图回画布 | 否 |
| `stage.renderPreview` | 渲染白模预演视频 | 否 |

### 7.1 相对指令

模型不擅长精确 3D 坐标，工具应支持相对语义：

- 「人物 A 在人物 B 左前方 1.5 米」
- 「机位在门口内侧 2 米，朝桌子中心」
- 「镜头从人物后方 1 米开始，向前推进 3 米」
- 「人物 A 面向人物 B」
- 「三个人呈三角形站位，间距 1 米」

工具负责把相对语义换算成坐标，模型只负责意图和关系。工具返回实际结果，模型基于真实结果继续。

### 7.2 权限

- 只读：`stage.get`、`stage.capabilities`。
- 场景编辑：添加/变换/姿势/机位/镜头/运镜。
- 渲染：`stage.captureFrame`、`stage.renderPreview`。
- 高风险：删除对象/机位/镜头、覆盖场景、导出，需二次确认。
- 跨空间：导演台截图/视频回画布属于跨域写入，需显式确认。

## 8. 本地白模预演渲染

### 8.1 管线

```
DirectorStageDoc + StageShot
  → 时间轴求值（相机/对象在 t 时刻的变换）
  → three.js 离屏渲染
  → 逐帧 PNG/JPEG 写入 ffmpeg stdin（image2pipe）
  → H.264 MP4
  → 落盘为视频资产
  → 创建视频节点并连线到导演台节点
```

### 8.2 实现位置

- 渲染不放在可见的 React 组件里，避免卡 UI。
- 复用剪辑室已有方案：主进程创建隐藏窗口加载专用渲染页，逐帧渲染并通过流式 stdin 写 ffmpeg。
- 主进程负责编码、进度、取消、半成品清理。
- 渲染页只负责 three.js 场景和时间轴求值。

### 8.3 参数

| 参数 | 默认 | 可选 |
|---|---|---|
| 分辨率 | 720p | 1080p |
| 帧率 | 24fps | 30fps |
| 时长 | 镜头时长，最长 15 秒 | 按镜头 |
| 画幅 | 16:9 | 9:16 / 1:1 |
| 格式 | MP4 (H.264) | — |

### 8.4 行为

- 低清预览优先，确认后再导出高清。
- 导出前检查镜头和运镜有效。
- 支持取消，取消后清理半成品。
- 导出完成创建视频节点，标题默认「白模预演 · 镜头名」。
- 视频节点可切换版本，重新导出写新版本。
- 白模视频可连接到正式视频生成节点，作为参考视频。

## 9. Agent 工作流

### 9.1 从文字搭景

1. 用户描述场景和镜头。
2. Agent 读取剧本/分镜/参考图/全景/角色卡。
3. Agent 生成场景草案：对象、站位、机位、镜头、运镜。
4. 展示方案摘要，用户确认。
5. Agent 调 `stage.*` 搭建场景。
6. 低清 `renderPreview`，用户查看。
7. 用户提出修改，Agent 调整。
8. 确认后导出高清白模预演视频。
9. 视频回画布，接正式视频生成。
10. 正式生成结果进入剪辑室。

### 9.2 从分镜搭景

1. 用户选中分镜组或分镜表。
2. Agent 读取镜头描述、角色、场景。
3. 为每个镜头生成机位和站位方案。
4. 批量创建镜头、渲染低清预演。
5. 用户挑选、调整、重渲染。
6. 导出选中镜头的白模视频，接正式生成。

### 9.3 手动调整后 Agent 续做

1. 用户手动搭好场景和机位。
2. 用户说「加三个群众，站在背景两侧」。
3. Agent 读取当前场景，添加对象，不覆盖用户改动。
4. 用户说「镜头 A 再往前推一点」。
5. Agent 基于当前运镜修改关键帧。
6. 导出预演。

## 10. 手动 UI

### 10.1 布局

- 全屏 3D 工作空间。
- 左侧：元素列表（对象、机位、镜头），支持删除、重命名、打组、隐藏。
- 中间：3D 视口。
- 右侧：属性面板（场景、对象、机位、镜头、运镜）。
- 底部：运镜时间轴（镜头、关键帧、播放头）。
- 顶部：导演视角/机位视角切换、截图、导出预演、保存状态。

### 10.2 交互

- V 移动、R 旋转、S 缩放，Shift 等比。
- 点击选中、框选、多选、对齐、吸附。
- 双击机位进入机位视角，Esc 返回导演视角。
- 拖拽关键帧调整运镜。
- 播放预演，实时查看运镜。
- 截图后自动创建图片节点并连线。

### 10.3 与画布

- 双击画布空白可新建导演台节点。
- 节点上显示标题、机位数、镜头数、最近截图/视频缩略图。
- 节点工具栏：打开导演台、截图、导出预演、复制场景、删除。
- 截图/视频作为新节点出现在画布，自动连线。

## 11. 阶段计划

| 阶段 | 内容 | 验收 |
|---|---|---|
| P0 | 场景 schema、`StageCommand`、3D 视口、素模/几何、机位、导演/机位视角、截图回画布 | 手动搭景、截图、重开保留 |
| P1 | 运镜时间轴、关键帧、播放、本地白模预演视频导出 | 5 秒 720p 白模视频导出、取消、无残留 |
| P2 | Agent 场景工具、自然语言搭景/摆位/机位、方案确认 | Agent 搭景、用户确认、可撤销 |
| P3 | Agent 运镜编排、多镜头预演、分镜组联动、批量导出 | 从分镜生成多机位预演 |
| P4 | 全景背景、glTF 上传、群众阵列、灯光、姿势库 | 场景真实感与复用 |
| P5 | 白模视频接正式生成、进入剪辑室预演剪辑 | 全流程打通 |

关键：P0 就定义 `StageCommand` 和 `stage.*` 工具协议，即使 Agent UI 还没做。手动 UI 和 Agent 从第一天共用同一套命令。

## 12. 依赖

- `three` 已因全景查看器引入。
- 画布节点 schema 新增 `stage`，同步 NODE_META、项目 schema、PromptBar 过滤、图标、搜索、导出。
- 项目导出支持 `stages/` 目录。
- 截图走 `ingestAsset`，与图片节点/版本栈一致。
- 白模视频导出复用剪辑室隐藏窗口逐帧渲染 + ffmpeg image2pipe + 取消清理。
- Agent 依赖 `docs/agent-full-scope.md` 的工具注册表、权限 scope、回合事务、生成提案。
- 渲染性能需要单独压测：对象数、机位数、镜头时长、分辨率。

## 13. 验收标准

### 13.1 手动导演台

- 新建导演台节点，进入 3D 空间。
- 添加 4 种人体素模、几何体、群众阵列。
- 移动/旋转/缩放/姿势/颜色正常。
- 新建至少 3 个机位，切换机位视角，调整 FOV 和画幅。
- 截图回画布，生成图片节点并连线。
- 保存后重开项目，场景、机位、镜头全部恢复。
- 复制导演台节点，场景独立，不互相影响。

### 13.2 白模预演

- 设置一个 5 秒镜头和运镜关键帧。
- 导出 720p/24fps MP4，画面运动与关键帧一致。
- 导出过程可取消，取消后无残留文件。
- 导出完成创建视频节点，可播放、可切换版本。
- 白模视频可作为参考视频连接到视频生成节点。
- 10 秒 1080p 导出时间在可接受范围，UI 不卡死。

### 13.3 Agent 导演台

- 「搭一个办公室多人对话场景，三机位」能生成合理草案。
- 用户确认后，Agent 建对象、摆位、设机位。
- 用户说「人物 A 再靠近桌子一点」，只改目标对象。
- 用户说「镜头 A 从门口推进」，生成运镜关键帧。
- Agent 渲染低清预演并回画布。
- Agent 操作可整体撤销。
- Agent 不越权修改画布其他节点。

## 14. 风险与应对

| 风险 | 影响 | 应对 |
|---|---|---|
| 场景 schema 定错 | 手动/Agent 都要返工 | 先评审 schema，参考 timeline-schema 的经验 |
| 运镜插值复杂 | 白模视频不自然 | 首期关键帧 + 线性/缓动，不做复杂曲线 |
| 逐帧渲染卡 UI | 导出时无法操作 | 隐藏窗口/离屏渲染，复用剪辑室方案 |
| 人体素模与姿势 | 资产成本高 | 首期参数化胶囊人 + 少量姿势预设，后续 glTF |
| Agent 空间推理弱 | 摆位不准 | 相对指令 + 工具换算，不让模型直接写坐标 |
| 场景资产体积 | 项目变大、导出慢 | 限制 glTF/纹理大小，参考 12MiB 上限 |
| 与剪辑室边界 | 白模被当成成片 | 明确白模是参考素材，成片仍在剪辑室 |
| 渲染资源占用 | 低端机卡顿 | 默认 720p、限制时长、低清预览优先 |

## 15. 待调研问题

1. 人体素模自研参数化，还是引入开源 low-poly mannequin glTF？许可证、体积、姿势能力。
2. 3D 编辑器用原生 three，还是 `@react-three/fiber` + `@react-three/drei`？与 React Flow 画布的层级/性能边界。
3. 隐藏窗口渲染页与主进程 ffmpeg 的具体分工，是否需要 utilityProcess。
4. 运镜关键帧的插值算法与相机控制方式（位置/注视点/FOV 分别插值，还是用四元数）。
5. 白模视频编码参数：CRF、preset、音频（是否需要静音轨）。
6. 场景文档的版本迁移策略。
7. 与剪辑室时间线的关系：白模镜头能否直接作为时间线片段做预演剪辑。
8. 性能上限：多少对象/机位/镜头仍可流畅，低端机降级策略。
9. 全景背景与现有 PanoramaViewer 的复用程度。
10. Agent 相对指令的词汇表和换算规则。

## 16. 状态

- 2026-11-07：立项为待调研大需求，不进入当前实现队列。
- 2026-11-08：明确白模预演为本地 3D 渲染，不是白模风格视频；确定手动与 Agent 共用 `StageCommand`；方案更新为「3D 片场 + 镜头预演」，待排期。
- 2026-11-09：完成 `StageCommand` 骨架。
  - `src/shared/stage-schema.ts`：场景文档、对象、机位、镜头、运镜关键帧、动作轨、预览参数、限制、校验与默认文档。
  - `src/shared/stage-commands.ts`：17 类命令、原子 batch、`StageChange`、`StageEffect`、撤销/重做历史。
  - `src/shared/__tests__/stage-commands.test.ts`：对象/机位/镜头/运镜/动作轨/原子回滚/历史覆盖。
  - 尚未接入画布 `stage` 节点、3D 视口、场景文件存储与 `stage.*` Agent 工具执行层。
- 2026-11-09：完成画布 `stage` 节点与场景存储。
  - `StageNodeData`、`stageNodeSchema`、`NODE_META.stage`、`CanvasCommandNode` 已支持 stage。
  - 场景存 `<project>/stages/<stageId>.json`；主进程提供创建/读取/保存/复制/删除，保存前跑 `validateStageDoc`。
  - 添加节点菜单可创建导演台；复制/粘贴会深拷贝场景文件；项目导出自动包含 `stages/`。
  - 删除节点暂不清理场景文件，避免画布撤销后场景丢失。
  - 3D 视口、机位切换、截图与 `stage.*` Agent 工具仍待接入。
- 2026-11-09：完成 A1 3D 视口（原生 three.js）。
  - 全屏 `StageWindow`、左侧对象/机位/镜头列表、右侧只读属性、顶栏视角切换。
  - 原生 three 渲染内核：背景、网格、灯光、人体素模、box/sphere/plane/crowd、机位标记。
  - 导演视角 OrbitControls；机位视角按 position/target/fov 切换。
  - Raycaster 选中对象/机位；BoxHelper 高亮。
  - 截图经 `stage:capture` 写入资产，并自动创建图片节点连线。
  - 自动保存与关闭补存；重开恢复 activeCameraId。
  - 拖拽变换、属性编辑、添加/删除对象与机位、运镜时间轴、白模预演仍待接入。
- 2026-11-09：完成 A2 手动编辑与 `stage.*` Agent 工具。
  - `stage_get`、`stage_capabilities`、`stage_add_object`、`stage_transform_object`、`stage_add_camera`、`stage_set_active_camera`、`stage_remove_object`。
  - 导演台未打开时，Agent 工具直接读写场景文件并同步画布节点摘要。
  - TransformControls 支持移动/旋转/缩放，拖拽结束写回 StageCommand。
  - 属性面板可编辑对象变换、姿势、颜色、可见性，以及机位名称、位置、注视点、FOV、画幅。
  - 左栏可添加/删除对象与机位；所有操作可撤销/重做。
  - 修复旧快照覆盖新场景的落盘 bug：工具执行后立即保存，场景保存拒绝更旧的 updatedAt。
- 2026-11-09：完成 A3 运镜时间轴与本地白模预演。
  - `src/shared/stage-timeline.ts`：相机关键帧线性插值与四种缓动。
  - 时间轴 UI：镜头切换、添加/删除镜头、时长编辑、关键帧捕获/删除、播放头、播放/暂停。
  - 关键帧在缩短镜头时自动裁剪；删除镜头后自动选中剩余镜头。
  - 新增 `stage-render.html` 隐藏窗口渲染页，复用场景对象构建，不含网格与机位标记。
  - `src/main/stage/export.ts`：逐帧 JPEG → ffmpeg H.264 MP4 → `ingestAsset` → 自动创建视频节点。
  - 导出验证：1280×720、5 秒、24fps、H.264 yuv420p，0s/3s 抽帧不同。
  - 隔离测试实例增加禁用后台节流开关，避免窗口被遮挡时 rAF 暂停。
