# FILM-STUDY-REDESIGN-1 · 逐帧拉片重做：节点配置 + 结果直接进画布

日期：2026-11-08

## 调研结论

对比 LibTV、TapNow、蝉妈妈 AI、创一 AI、瞬镜：

- **LibTV**：视频节点勾选「分镜 / 动态 / 音乐」→ 一键拉片（不耗积分）→ 分镜组、运镜切片、BGM 直接进画布并接线。
- **TapNow**：视频节点「创建分镜」→ 分镜表（首帧图、画面/内容提示词、时间、景别、机位、运镜、焦距/景深、光线、音乐、人声）→ 可复制 prompt 逐镜生成。
- **蝉妈妈 / 创一 / 瞬镜**：视频转分镜，输出结构化分镜报告或分镜组，没有独立“拉片室”。

行业共识：拉片是视频节点上的一个动作，结果直接回到画布并接入生成链路；不需要独立工作台。

## 本次改动

### 1. 拉片节点成为配置入口

`src/renderer/src/canvas/nodes/StudyNodeCard.tsx` 重写：

- 显示源视频名称、摘要（N 个分镜 / N 帧 / 时长）。
- 分镜精度：自动分镜（推荐）、0.5 / 1 / 2 / 5 秒每镜。
- AI 描述：自动选择（推荐）、不分析、已配置的视觉文本模型。
- 输出内容：分镜组、分镜表。
- 开始拉片 / 取消 / 重新拉片 / 查看分镜表。
- 卡片根节点移除 `nodrag nopan`，恢复节点拖动。
- 开始/重新拉片后，结果直接写回画布。

### 2. 主进程自动拉片

新增 `src/main/film-study/auto.ts`：

- 自动镜头检测：ffmpeg `scdet=threshold=10` 提取镜头边界；失败时回退 2 秒间隔。
- 过短镜头合并，最多 24 个分镜。
- 每个镜头按中点抽取 640px 代表帧，保存到 `assets/study/<id>/frames/`。
- 组装 `FilmStudy`：frames + segments（含 coverFile）。
- AI 描述：自动选择第一个支持图片的 `text.chat` 模型；把代表帧和镜头边界发给模型，补齐 `shotSize / cameraAngle / cameraMove / lighting / visualDescription / imagePrompt / voiceOver / musicCue`。
- AI 失败不阻塞：保留基础分镜，返回 `analysisError`。
- 新增 `runFfmpegCapture`（`src/main/media/ffmpeg.ts`）收集 scdet stderr。
- IPC：`film-study:auto`；取消同时覆盖自动拉片与旧抽帧。

### 3. 结果输出与连线

`src/renderer/src/stores/film-study.ts`：

- 新增 `runAuto`：调用自动拉片，更新节点摘要、分析状态与错误。
- 成功后创建：
  - 分镜组：`addAssetNodes` + 分组，每格为该镜代表帧，标题为镜头标题。
  - 分镜表文本节点：Markdown 分镜表。
  - 自动连线：`源视频 → 拉片节点`、`拉片节点 → 分镜组`、`拉片节点 → 分镜表`。
- `addAssetNodes` 新增 `connectGroup`，分组输出只连一条线到组。
- 修复 `applyProgress` 的 done 事件覆盖完整 summary 的问题。

### 4. 分镜表查看器

新增 `FilmStudySheet.tsx`：

- 只读表格：镜号、时间、时长、景别、机位、运镜、光线、画面、提示词、人声/音乐。
- 复制单镜提示词、复制整表、导出 Markdown、高级编辑入口。
- 没有 AI 描述时显示提示条。
- 原拉片室保留为「高级编辑」，不再是主入口。

### 5. 其他修复

- `NodeToolbar`：「更多」菜单补齐超出主区上限的操作（逐帧拉片之前被静默隐藏）。
- 工具栏左侧分隔线改为有操作时才渲染，修复文本等节点左侧的灰线。
- `CineNodeView` / `FilmNodeView` 全屏预览改用统一 `VideoPlayer`。
- 高级编辑拉片室播放器限制为最大 760px 宽并居中。
- `NODE_META.study` 调整为 400×340。

## 验证

- `corepack pnpm typecheck` 通过。
- `corepack pnpm test`：20 个文件、107 个用例全部通过（新增 5 个自动分镜切分用例）。
- `corepack pnpm build` 通过。
- 隔离实例 CDP 实测：
  - 工具栏可进入「更多 → 逐帧拉片 → 自动分镜」。
  - 2 秒视频自动拆出 2 个分镜、2 张代表帧；画布生成分镜组 + 分镜表，连线关系为 `video-a → study → text/group`。
  - 拉片节点可拖动（x +140 / y +70）。
  - 全屏视频预览使用 `.image-preview__player .video-node`，原生 `video[controls]` 为 0。
  - 用本地 mock 视觉模型验证 AI 描述：分镜表出现景别、机位、运镜、光线、画面描述、提示词、音乐字段，study 文件写入 `analysisModel` 与 `autoAnalyzedAt`。
- 截图：
  - `FILM-STUDY-REDESIGN-1-node-outputs.png`：拉片节点配置面板、分镜组、分镜表。
  - `FILM-STUDY-REDESIGN-1-sheet-basic.png`：未配置 AI 时的基础分镜表。
  - `FILM-STUDY-REDESIGN-1-sheet-ai.png`：AI 描述后的分镜表。
  - `FILM-STUDY-REDESIGN-1-video-preview.png`：统一后的全屏视频预览。

## 已知限制 / P1

- 重新拉片目前会新建一套分镜组与分镜表，旧结果保留；后续可增加“替换旧输出”。
- 拆解维度暂只实现分镜，动态切片与 BGM 提取留到 P1。
- 分镜表导出 Markdown 复用原拉片室导出，内容为段落格式；后续可改为标准分镜表格。
- 高级编辑拉片室的数据结构与旧版兼容。
