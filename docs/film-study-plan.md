# 逐帧拉片方案（调研）

日期：2026-11-08
状态：P0 + P1 已在 `film-study` 分支实现，P2（AI 分析包）待开发
参考项目：[bkingfilm/lapian-notes](https://github.com/bkingfilm/lapian-notes)（MIT）

## 1. 先说结论

采用你建议的入口形态：

1. 视频节点上方工具栏增加「逐帧拉片」
2. 点击后创建一个**拉片节点**
3. 拉片节点卡片显示源视频、抽帧进度、帧数/段落数，并提供「进入拉片室」
4. 点击后打开**拉片室浮窗**：播放器 + 帧时间轴 + 笔记

拉片室内部结构：

- 上方/左侧：视频播放器（逐帧步进、时间码、入点/出点）
- 下方：可虚拟滚动的帧时间轴（缩略图 + 时间码）
- 右侧：笔记/段落、结构、情绪曲线、AI 分析
- 帧数据和笔记存在项目目录，不塞进节点 JSON
- 拉片节点只保存 `studyId` 和摘要

把「拉片」做成节点而不是纯菜单入口，符合 CineLab 的画布心智：一个视频节点可以对应一个长期存在的拉片项目，节点本身就是入口和状态展示。节点播放器里的「上一帧/下一帧」已经随视频控件升级实现；完整拉片室按本文分阶段落地。

## 2. 参考项目是怎么做的

lapian-notes 的核心链路：

1. **浏览器本地抽帧**
   - 用 3 个隐藏 `<video>` 解码器并行 seek
   - 每个时间点 seek 后 `drawImage` 到 canvas
   - 缩放到 320px 宽，JPEG 质量 0.62
   - 按 1 秒间隔生成全片帧
   - 开头连续黑帧探测，判断浏览器是否解不出该编码
2. **帧缓存**
   - 帧截图存 IndexedDB
   - 笔记文本存 localStorage
   - 项目 ZIP 包含 notes + frames + markdown
3. **时间轴与播放器联动**
   - 底部帧时间轴，点击任意帧跳转视频
   - 段落「播放本段」到结束自动暂停
   - 笔记时间点一键 seek
4. **AI 分析包**
   - 导出 ZIP：`prompt.md` + `schema.json` + `project.json` + `frames/` + `subtitles.srt`
   - 用户把 ZIP 交给任意 AI，AI 返回 JSON
   - 导入 JSON 后生成剧情泳道、结构树、情绪曲线和段落
5. **数据模型**
   - `Frame { index, time, src }`
   - `Segment { startTime, endTime, title, type, function, keyBeats, screenplayDraft, techniques, notes, primaryLine... }`
   - `StoryLine { id, title, description }`
   - `AudienceCurvePoint { time, intensity, valence, emotionType, rhythmRole... }`

它的优点：全本地、模型无关、分析包可迁移。
它的限制：浏览器解码受编码限制；帧和笔记在 IndexedDB/localStorage；不是为「画布 + 节点生成」设计。

## 3. CineLab 应该怎么改

### 3.1 入口：视频工具栏 + 拉片节点 + 拉片室

推荐流程：

```
视频节点工具栏「逐帧拉片」
      ↓
选择帧间隔（0.5 / 1 / 2 / 5 秒，默认按片长）
      ↓
在视频节点右侧创建「拉片节点」
      ↓
后台开始 ffmpeg 抽帧，节点显示进度
      ↓
抽帧完成 → 节点显示「N 帧 · M 段」+「进入拉片室」
      ↓
点击打开拉片室浮窗
```

拉片节点卡片：

```
┌──────────────────────────────┐
│ ▣ 拉片：影片名 / 视频节点 5   │
│ 间隔 1 秒 · 24 帧 · 3 段      │
│ [进入拉片室]  [重新抽帧]      │
└──────────────────────────────┘
```

状态：

- 准备中 / 抽帧中：显示进度和取消
- 已就绪：显示帧数、段落数，进入按钮可用
- 失败：显示错误和「重试抽帧」

节点类型建议：

- **新增 `study` 节点类型**，而不是复用图片/文本节点
- 它不参与生成、不出现在 Prompt Bar、不作为连线素材
- 工具栏：进入拉片室、重新抽帧、删除拉片
- 双击节点卡片等同「进入拉片室」
- 删除视频源节点后拉片节点保留，标记「源视频已删除」，已有帧和笔记仍可查看

为什么不复用现有节点：

- 图片节点会被当作生成素材和引用
- 文本节点会进入 Prompt Bar 和文本生成流程
- 拉片节点需要独立的状态、工具栏和数据生命周期

拉片室形态：

- P0：应用内大尺寸浮窗（遮罩 + 中央面板），关闭后回到画布
- P1：可拖拽/缩放，或做成可独立的 BrowserWindow，方便双屏
- 不把几千帧铺到画布；需要时再把「当前帧」「12 帧拼图」「段落摘要」生成到画布

### 3.2 页面结构

```
┌─────────────────────────────────────────────────────────────┐
│ 拉片台：影片名 / 视频节点     帧间隔 1s  重新抽帧  导出/导入 │
├───────────────────────────────┬─────────────────────────────┤
│                               │  笔记 / 结构 / 情绪 / AI     │
│         视频播放器             │                             │
│  逐帧步进 / 时间码 / 入出点    │  段落列表                   │
│                               │  段落编辑面板               │
├───────────────────────────────┴─────────────────────────────┤
│ 可横向滚动的帧时间轴（虚拟列表） 00:00 00:01 00:02 ...      │
└─────────────────────────────────────────────────────────────┘
```

- 顶部：帧间隔、抽帧/取消、分析包、Markdown 导出
- 播放器：复用新版 `VideoPlayer`，增加时间码 `HH:MM:SS:FF`、入点/出点、循环播放本段
- 时间轴：固定宽度缩略图，虚拟滚动；点击 seek；Shift 点选范围
- 右侧：先做「笔记」，后做「结构」「情绪」「AI」

### 3.3 数据模型

项目目录：

```
<project>/
  study/
    <studyId>.json
  assets/study/<studyId>/frames/frame_000001.jpg
```

`study.json`：

```ts
interface FilmStudy {
  schemaVersion: 1
  id: string
  sourceNodeId: string
  sourcePath: string
  sourceScope?: 'project' | 'global'
  sourceName: string
  duration: number
  fps: number
  frameInterval: number
  frames: Array<{
    index: number
    time: number
    file: string        // 相对项目根
    note?: string
  }>
  segments: FilmStudySegment[]
  subtitles?: Subtitle[]
  storyLines?: StoryLine[]
  macroAnalysis?: MacroAnalysis
  audienceCurvePoints?: AudienceCurvePoint[]
  createdAt: string
  updatedAt: string
}

interface FilmStudySegment {
  id: string
  startTime: number
  endTime: number
  title: string
  type: string
  segmentFunction?: string
  keyBeats?: string
  screenplayDraft?: string
  techniques?: string
  audienceExperience?: string
  creativeIntent?: string
  notes?: string
  color?: string
}
```

节点数据：

```ts
// NodeKind 增加 'study'
interface StudyNodeData {
  kind: 'study'
  title: string
  status: 'idle' | 'queued' | 'running' | 'done' | 'error'
  studyId: string
  sourceNodeId: string
  sourcePath: string
  sourceScope?: 'project' | 'global'
  sourceName: string
  progress?: number
  error?: string
  studySummary?: {
    frameCount: number
    segmentCount: number
    interval: number
    updatedAt: string
  }
}
```

拉片节点不参与生成、引用和 Prompt Bar；它只负责展示状态和打开拉片室。

### 3.4 抽帧实现

CineLab 有 ffmpeg，主进程做，不依赖浏览器解码能力。

主进程新增 `film-study` 模块：

```ts
filmStudy.extract({
  nodeId,
  path,
  scope?,
  interval?: number,
  maxFrames?: number
}): Promise<{ studyId: string; frameCount: number; duration: number; fps: number }>
filmStudy.cancel(taskId)
filmStudy.onProgress(cb)
filmStudy.load(studyId)
filmStudy.save(study)
filmStudy.remove(studyId)
filmStudy.exportPackage(studyId)
filmStudy.importResult(studyId)
```

ffmpeg 命令：

```bash
ffmpeg -y -i <source> \
  -vf "fps=1/<interval>,scale=320:-2" \
  -q:v 6 \
  -progress pipe:1 \
  assets/study/<studyId>/frames/frame_%06d.jpg
```

- `-progress pipe:1` 读取 `out_time_ms` 计算进度
- 取消时 kill ffmpeg
- 抽出后写 `study.json`，`time = index * interval`
- 320px 宽、JPEG q6，兼顾清晰度和磁盘
- HEVC/AV1/10bit 等浏览器解不了的源，ffmpeg 仍可处理
- 如果首帧全黑，可给出「源可能无画面」警告（参考 lapian-notes 的黑帧探测）

帧间隔策略：

| 片长 | 默认间隔 | 说明 |
|---|---|---|
| ≤ 15 秒 | 0.5 秒 | AI 短片，帧密一些方便看节奏 |
| 15–120 秒 | 1 秒 | 默认 |
| 2–10 分钟 | 1 秒 | 用户可改 2 秒 |
| > 10 分钟 | 2 秒 | 控制帧数 |

保护：

- 默认 `maxFrames = 3000`
- 自动间隔 = `max(userInterval, duration / maxFrames)`
- 抽帧前显示预计帧数和磁盘占用
- 建议 1 秒 320px JPEG 约 20–60KB/帧，3000 帧约 60–180MB

### 3.5 播放器与逐帧交互

节点播放器（已实现部分）：

- 播放/暂停
- 上一帧 / 下一帧
- 当前时间 / 总时长
- 当前帧号 `F 24`
- 静音、全屏

拉片台播放器：

- 时间码 `00:00:04:12`（时:分:秒:帧）
- `←` / `→` 逐帧，`Shift + ←/→` 1 秒
- 空格播放/暂停
- `I` / `O` 设置入点/出点
- 点击时间轴任意帧 seek 并暂停

### 3.6 笔记与段落

第一版先做：

- 帧备注
- 段落：起止时间、标题、类型、段落功能、关键节拍、创作意图、视听手法、备注
- 选中时间轴范围 → 新建段落
- 点击段落 → 播放本段，到出点自动暂停

Markdown 导出：

- 按段落顺序
- 每段带时间码、功能、节拍、创作意图、视听手法、备注
- 可选带 1 张代表帧

### 3.7 AI 分析包

第二版再做，避免第一版范围过大。

导出 ZIP（参考 lapian-notes，但用 CineLab 的模型开放思路）：

```
README.md
prompt.md
schema.json
project.json
subtitles.srt（有字幕时）
frames/frame_000001_00-00-00-000.jpg
```

- `prompt.md`：要求 AI 按 schema 输出剧情段落、结构、情绪曲线
- `schema.json`：CineLab 自己的 JSON Schema
- 用户可以把 ZIP 交给任意多模态 AI
- 导入 AI 返回的 JSON → 段落/泳道/情绪曲线
- 可选兼容导入 lapian-notes 的 `project.json`

第三版再考虑 CineLab 直连：

- 把帧拼成带时间码的 contact sheet（每张 3×3 或 4×3）
- 走现有 `text.chat` / 多模态模型
- 分段发送，避免一次塞几百张图
- 结果直接写入 `study.json`

### 3.8 结构树 / 情绪曲线

第三版：

- 剧情泳道：`StoryLine` + 段落的 `primaryLine` / `sharedLines`
- 结构树：按主线/支线/情感线/信息线分组
- 情绪曲线：`AudienceCurvePoint { time, intensity, valence, emotionType }`
- 时间轴上方叠加曲线，点击曲线点跳到对应时间

对 4–12 秒 AI 短片，这一层可以先不做；对完整电影拉片再做。

### 3.9 拉片结果与出口

拉片结果不是新的视频，而是「结构化分析数据 + 帧图 + 可读笔记」。必须提供三类出口，否则拉片会变成只读报告。

#### 给人看

- Markdown 拉片笔记
- 剧本正文
- 时间轴表格
- 带帧图的分享长图
- 项目 ZIP（笔记 + 帧 + JSON）

#### 放回画布

- 当前帧 → 图片节点
- 选中 12 帧 → 拼图图片节点，可继续宫格切分
- 选中片段 → 片段截取视频节点
- 单个段落 → 文本节点（摘要 / 剧本还原）
- 整份拉片 → 分镜组或文本节点
- 段落分析 → 作为提示词或参考继续生成

#### 喂给 AI / 复用

- 导出 AI 分析包 ZIP
- 导入 AI JSON，生成泳道、结构树、情绪曲线
- 关键节拍 → 提示词模板
- 视听手法 → 风格参考
- 优秀片段 → 镜头库 / 参考素材

P0/P1 至少保证「Markdown 导出 + 当前帧放回画布」可用，避免拉片结果只停留在面板里。

## 4. 分阶段落地

### P0：拉片台骨架（建议先做）

- 视频节点工具栏「逐帧拉片」
- 新增 `study` 拉片节点类型 + 节点卡片
- 工具栏点击 → 选择帧间隔 → 创建拉片节点并后台抽帧
- 节点卡片显示抽帧进度、帧数、段落数、「进入拉片室」
- 拉片室浮窗：播放器 + 帧时间轴
- 主进程 ffmpeg 抽帧 + 进度 + 取消
- study.json 读写
- 点击帧 seek、逐帧步进、时间码
- 项目保存/导出包含 study 文件

预计：4–6 天（新增节点类型比纯面板多 1 天）。

### P1：笔记与段落

- 帧备注
- 段落创建/编辑/删除
- 播放本段、自动暂停
- Markdown 导出
- 当前帧放回画布
- 选中 12 帧生成拼图节点
- 段落摘要生成文本节点
- 节点摘要「已拉片 · N 帧 · M 段」

预计：2–3 天。

### P2：AI 分析包

- 导出 ZIP（frames + prompt + schema）
- 导入 AI JSON
- 段落自动生成
- 可选导入 lapian-notes 项目

预计：2–3 天。

### P3：结构与情绪

- 剧情泳道
- 结构树
- 情绪曲线
- CineLab 直连多模态分析

预计：5–8 天。

## 5. 关键技术点

### 5.1 虚拟滚动

3000 帧不能一次渲染 3000 个 `<img>`。

- 固定缩略图宽度（例如 96px）
- 只渲染可视区 + overscan
- 滚动时用 `scrollLeft` 计算起止索引
- 图片 `loading="lazy"`
- 不引入额外依赖，手写简单虚拟列表

### 5.2 帧率与时间码

- `fps` 优先取 `OutputRef.fps`
- 没有时用 `media.probe` 读取
- 时间码 `HH:MM:SS:FF`
- 帧步进 `1 / fps`
- 变帧率视频按 ffmpeg 输出帧率近似，文档里标注

### 5.3 磁盘与清理

- 抽帧前显示预计帧数和大小
- 删除拉片时同时删除 `assets/study/<studyId>`
- 项目导出包含 study 目录
- 可在通用设置里增加「清理拉片缓存」，后续做

### 5.4 与现有「抽帧」操作的关系

当前工具栏已有「抽帧」：首帧/尾帧/当前帧 → 单张图片节点。

本方案不替代它：

- 单帧抽帧：继续用于快速取参考图
- 逐帧拉片：进入拉片台，生成完整帧序列和笔记
- 拉片台里的「当前帧放入画布」复用现有 `extractFrame`

## 6. 风险

- **长片耗时**：90 分钟电影 1 秒 1 帧，ffmpeg 解码 + JPEG 写入需要时间；必须异步任务 + 进度 + 取消。
- **磁盘占用**：3000 帧约 60–180MB；需要显示预计大小和清理入口。
- **虚拟列表**：几千个缩略图的滚动性能是主要 UI 风险。
- **时间码精度**：VFR 视频和关键帧对齐可能偏差 1 帧内；文档标注。
- **AI 包体积**：几百张图会很大；优先 contact sheet + 分段分析。
- **项目 schema**：study 文件独立于 canvas JSON，避免破坏现有项目结构。
- **新增节点类型**：`NodeKind`、`NODE_META`、项目 schema、节点搜索/菜单、导出、Prompt Bar 过滤都要同步；这是 P0 的主要跨模块成本。

## 7. 建议的第一版范围

先做 P0 + P1，不做 AI 和结构/情绪：

- 视频节点工具栏创建拉片节点
- 拉片节点卡片 + 进入拉片室浮窗
- 0.5/1/2 秒间隔抽帧
- 可滚动帧时间轴
- 逐帧步进、时间码、入点/出点
- 帧备注和段落笔记
- Markdown 导出
- 当前帧、12 帧拼图、段落摘要放回画布
- 节点摘要「已拉片 · N 帧 · M 段」

这样能先验证「拉片台」这个形态是否适合 CineLab，再决定是否投入 AI 分析和完整电影工作流。

## 8. P0 实施记录（2026-11-08）

已在独立分支 `film-study` 实现：

- 新增 `study` 节点类型和节点卡片
- 视频节点工具栏「逐帧拉片」+ 0.5/1/2/5 秒间隔菜单
- 点击后自动创建拉片节点并后台 ffmpeg 抽帧
- 拉片节点显示进度、帧数、间隔和「进入拉片室」
- 拉片室浮窗：视频播放器 + 虚拟滚动帧时间轴
- 点击帧 seek，播放时帧选择跟随当前时间
- `study/<id>.json` + `assets/study/<id>/frames/*.jpg`
- 项目保存/重新加载后拉片节点和 study 数据保留

P0 未包含：

- 帧备注和段落笔记（P1）
- Markdown 导出和放回画布（P1）
- AI 分析包（P2）
- 结构树/情绪曲线（P3）

实现细节：

- 抽帧主进程使用 `fps=1/interval,scale=320:-2`，默认上限 3000 帧
- 抽帧进度通过 `film-study:progress` 推送到渲染进程
- `study.json` 的 `sourceNodeId` 保存原视频节点，不是拉片节点
- 拉片节点不参与生成、Prompt Bar 和连线引用

## 9. P1 实施记录（2026-11-08）

已实现：

- 帧备注，编辑后 600ms 防抖写入 `study.json`
- 入点/出点设置，按范围新建段落
- 段落列表、播放本段到出点自动暂停
- 段落详情编辑：
  - 标题、类型
  - 段落功能、关键节拍、创作意图
  - 视听手法、观众体验、备注
- 段落删除
- 拉片节点摘要实时更新段落数
- 导出 Markdown 拉片笔记
- 当前帧放入画布
- 拉片拼图（最多 12 帧）放入画布
- 段落摘要生成文本节点
- 关闭拉片室时保存未写入的修改

未测试：

- Markdown 导出的保存对话框没有自动化，代码路径已编译通过
- 12 帧拼图在 8 帧素材上验证为 4×2，1280×360

## 10. 后续

P2：AI 分析包（prompt/schema/frames/subtitles ZIP）与导入 AI JSON。
P3：剧情泳道、结构树、情绪曲线、模型直连。
