# 剪辑室：Concat 借鉴第二批

日期：2026-11-08
状态：完成

调研对象：`jub0t/Concat` 0.2.9（AGPL-3.0）。只借鉴功能与交互，不复制代码。

## 本批实现

### 1. 滤镜库

- `timelineClipSchema` 新增 `filter`：亮度、对比度、饱和度、模糊、黑白、复古、色相旋转、反相、暗角
- 新增 `src/shared/filters.ts`
  - `DEFAULT_FILTER`
  - 8 套预设：原片、明亮、鲜艳、黑白、复古、冷色调、高对比、暗角
  - `canvasFilterString` 生成 Canvas 2D `ctx.filter`
- 渲染器 `drawMedia` 应用滤镜；暗角用径向渐变叠加
- 快速路径判定遇到 `clip.filter` 时回退逐帧渲染
- 检查器「滤镜」区：预设下拉 + 亮度/对比度/饱和度/模糊/暗角滑块 + 黑白/复古开关

### 2. 转场库

- `transitionInSchema.type` 扩展为 7 种：
  - `fade`
  - `dip-black`
  - `wipe-left` / `wipe-right`
  - `slide-left` / `slide-right`
  - `zoom-in`
- `transitionState` 返回 `type + progress`；wipe/slide 保持前后片段不透明，zoom 使用透明度与缩放
- 渲染器按类型执行裁剪、位移或缩放
- 检查器下拉增加新类型；时间线片段标签显示「擦 / 滑 / 缩」

### 3. 关键帧曲线编辑器

- `clipKeySchema` 增加 `ease: 'bezier'` 和 `bezier: [x1,y1,x2,y2]`
- 求值器新增 cubic-bezier 求解（二分法），线性/缓入/缓出/缓入缓出保持不变
- 新增 `BezierEditor` SVG 曲线编辑器：两个控制点可拖动，实时更新关键帧
- 关键帧行选择「曲线」后展开编辑器；切换时自动补默认控制点 `[0.42,0,0.58,1]`

### 4. 音效库

- 新增 `resources/sounds/`：6 个自生成 CC0 WAV 音效 + manifest
  - 空气掠过 / 低频撞击 / 上升音效 / 点击 / 完成提示 / 警告低鸣
- 新增 `scripts/generate-sounds.mjs`，可重复生成并写入 SHA-256
- 主进程 `sound-library.ts`：读取 manifest、校验 SHA-256、复制到项目 `assets/aud`
- 新增 `media:list-sounds` / `media:import-sound` IPC 与 preload
- 素材池新增「音效」页签，双击音效卡片添加到音频轨
- `electron-builder.yml` 增加 `extraResources: resources/sounds -> sounds`

### 5. HEVC / AV1 导出

- 导出设置新增 `codec: 'h264' | 'hevc' | 'av1'`
- 编码参数：
  - H.264：libx264 / CRF 18
  - HEVC：libx265 / CRF 22 / `-tag:v hvc1`
  - AV1：libaom-av1 / CRF 30 / cpu-used 6
- 非 H.264 跳过 stream-copy / 快速路径，走逐帧渲染
- 成片节点工具栏增加编码下拉（H.264 / HEVC / AV1）

## 验证

- `typecheck` 通过
- `test`：21 个测试文件、133 个用例通过
  - 新增 filters 4 个
  - 新增 bezier 2 个
  - 新增转场 wipe/slide/zoom 2 个
- `build` 通过
- `check:encryption` 通过
- 端到端（隔离实例 9224，项目 P3P4）：
  - 滤镜：640×360 红图 + 亮度 0.4，导出抽帧 YAVG=42（滤镜生效）
  - 擦除转场：1.25 秒帧左侧 UAVG=240/VAVG=110（蓝），右侧 UAVG=91/VAVG=239（红）
  - HEVC：ffprobe `codec_name=hevc`
  - AV1：ffprobe `codec_name=av1`
  - 音效库：`listSounds` 返回 6 个；导入「空气掠过」返回 `assets/aud/sfx-whoosh-air-*.wav` 且文件存在；素材池显示 6 张卡片，双击后时间线新增「空气掠过」片段
  - 曲线编辑器：拖动控制点后时间线保存 `bezier: [0.266, 0.773, 0.58, 1]`

## 已知限制

- 音效是程序生成的 6 个基础音效；Concat 官方音频 manifest 目前 404，未接入外部素材
- 滤镜是 Canvas CSS filter + 暗角，不是 Concat 的 100 种 GPU 特效
- HEVC/AV1 为 8-bit 软件编码，未做 10-bit、硬件编码和码率预设
- 转场为 7 种固定类型，暂无方向/角度/自定义曲线参数
- 曲线编辑器 UI 将 y 限制在 0–1；求值器本身支持 -0.5–1.5 的过冲
- 音频清理仍只在导出时生效
