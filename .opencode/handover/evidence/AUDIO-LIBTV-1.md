# AUDIO-LIBTV-1 · 音频波形、截取变速、下载与复制粘贴

日期：2026-11-09

## 1. 音频波形对齐 LibTV

- 柱数 64 → 96，柱宽 0.62 / 圆角 0.31。
- 波形改为**以中线为中心、上下对称**（`y=(100-height)/2`），不再是底部对齐。
- 波形放进深色圆角内嵌区（`--surface-hover` 82%），内边距 12px。
- 柱色 `--text-3`，播放头红色细线贯穿波形区。
- 峰值曲线 `pow(peak, 0.72)`，小音量段也可见。
- 修复 SVG 高度 bug：`width/height: auto` 会按 viewBox 比例撑高并被裁剪，改为 `calc(100% - 24px)`，波形正确填满容器。
- 总时长显示改为四舍五入（2 秒显示 00:02，不再显示 00:01）。

## 2. 下载失败

- 根因：`exportCurrent` 调用 `window.api.export.asset(path, title)` 没有传 `scope`，全局库素材会去项目目录找文件。
- 修复：传入 `current.scope`。

## 3. 放大按钮

- 音频节点不再渲染「放大」按钮（预览层本来只支持图片/视频）。

## 4. 截取 + 变速

主进程新增 `src/main/media/audio.ts`：

- `trimAudio`：ffmpeg 截取，AAC 192k m4a，支持 project/global scope。
- `changeAudioSpeed`：atempo 链（0.1–4.0x），输出 AAC 192k m4a。
- 新增 IPC：`media:trim-audio`、`media:audio-speed`，同步 preload / contract / shared 类型。

渲染层：

- 音频节点工具栏新增「截取」「变速」。
- 节点下方浮动操作条（`AudioActionBar`）：
  - 截取：`× 截取 | 00:00.0 – 00:02.0 | 生成`，可在波形上拖拽选区，选区高亮 + 两端手柄。
  - 变速：`× 变速 | 0.1x ——●—— 4.0x | 1.00x | 生成`。
- 生成结果写入当前节点为新版本，旧版本保留可前后切换。
- 截取默认整段；变速默认 1.00x。

实测：

- 2 秒 BGM 截取 0–2s → 1.984s m4a。
- 2 秒音频 2.00x → 1.001s m4a，版本列表变为 3 个。

## 5. 复制粘贴保留全部内容

`copySelection` / `pasteNodes` / `duplicateSelection` 改造：

- 复制时记录两类连线：
  - 内部边：两端都在选中集合内。
  - 边界边：一端在集合内、一端在外部。
- 粘贴时：
  - 内部边映射到新节点。
  - 边界边把集合内的一端映射到新节点，外部一端保留原节点；外部节点已删除则丢弃。
- 节点引用映射：
  - 拉片 `sourceNodeId`、`studyOutputNodeIds`
  - 视频操作 `sourceNodeId`、`resultNodeId`
  - 剪辑室 `references` 的 key
- `prompt`、`outputs`、`selectedOutputId`、`studyOutputs`、`text` 等 data 字段随 `structuredClone` 完整保留。

实测：

- 复制单个音频节点：1 节点 + 1 条边界边 → 粘贴后自动重建 `study → 新音频`，outputs 3 个版本全部保留。
- 复制拉片 + 音频两个节点：内部边重建为「新拉片 → 新音频」，上游 `video-a → 新拉片` 与下游 `新拉片 → 原文本/原分组` 全部保留。

## 验证

- `corepack pnpm typecheck` 通过
- `corepack pnpm test`：24 文件 / 145 用例通过
- `corepack pnpm build` 通过
- 截图：`AUDIO-LIBTV-1-waveform.png`、`-trim.png`、`-speed.png`
