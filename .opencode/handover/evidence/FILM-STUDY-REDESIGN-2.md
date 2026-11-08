# FILM-STUDY-REDESIGN-2 · 拉片后续 + 节点右键菜单

日期：2026-11-08

## 本次完成

### 1. 拉片动态切片与 BGM

- `src/main/film-study/auto.ts`：
  - `outputs.motion`：按分镜逐个用 ffmpeg 截取视频片段，`libx264 / ultrafast / crf26`，有音轨时带 AAC，输出到 `assets/study/<id>/clips/clip_XXX.mp4`。
  - `outputs.music`：有音轨时提取整条音轨到 `assets/study/<id>/audio/bgm.m4a`（AAC 192k）。
  - 进度阶段改为：检测镜头 → 抽代表帧 → 动态切片 → BGM → AI 描述。
  - 返回 `motionClips` 与 `music` 资产信息。
- 拉片节点配置增加「动态切片」「BGM」两个开关。
- 渲染进程自动创建：
  - 「动态切片」视频分组，每段切片一个视频节点。
  - BGM 音频节点。
  - 与拉片节点自动连线。

### 2. 重新拉片替换旧输出

- `CineNodeData` 增加 `studyOutputNodeIds`，记录自动生成的输出节点：分镜表、分镜组、组内图片、切片组、切片、BGM。
- 重新拉片成功后先倒序删除旧输出（先子节点后分组），再创建新输出，避免画布堆积重复结果。
- `AddAssetLayout` 增加 `onGroupCreated` 回调，用于捕获分镜组/切片组的节点 id。
- 修复 `project-schema` 的 cine data 白名单缺少 `studyModelKey / studyOutputs / studyAnalyzed / studyAnalysisError / studyOutputNodeIds` 导致保存时被 zod 剥离的问题。

### 3. 标准分镜表 Markdown

- 主进程 `buildFilmStudyMarkdown`：自动分镜数据输出标准表格（镜号、时间、时长、景别、机位、运镜、光线、画面、提示词、人声/音乐）；旧拉片数据保持原笔记格式。
- 分镜表查看器「复制整表」输出同样的标准表格 Markdown。
- 修正表格前缺少空行的问题。

### 4. 节点右键菜单

新增 `NodeContextMenu.tsx` + UI store 节点菜单/命令状态：

- `Canvas.onNodeContextMenu`：右键先选中节点，再打开菜单。
- 菜单按节点类型分组：
  - 通用：查看大图/播放、下载、保存到资产库、创建副本、复制、粘贴、删除。
  - 视频：剪辑室、逐帧拉片、抽首帧/尾帧/当前帧、深度动作捕捉、片段截取、分离音视频。
  - 图片：九宫格、角色三视图、抠图、扩图、打光、多角度。
  - 文本：复制文本内容、作为提示词使用。
  - 拉片：查看分镜表、重新拉片。
  - 剪辑室：进入剪辑室。
  - 视频操作：展开/收起参数。
  - 分组：重命名、横排、竖排、网格、转普通组/分镜组、解组。
- 菜单命令通过 `nodeCommand` 发给现有 `NodeToolbar` 执行，复用它已有的全部媒体/AI 操作逻辑，不重复实现。
- 特殊命令：查看大图、下载、保存到资产库直接映射到工具栏回调。
- 样式：紧凑列表、分组标题、快捷键提示、危险项红色、最大高度滚动。

## 验证

- `corepack pnpm typecheck` 通过。
- `corepack pnpm test`：20 个文件、107 个用例全部通过。
- `corepack pnpm build` 通过。
- 隔离实例 CDP 实测：
  - 右键视频节点弹出 15 个菜单项，分组正确。
  - 右键「逐帧拉片」通过命令桥创建拉片节点并自动开始拉片。
  - 勾选「动态切片 + BGM」后重新拉片：
    - 生成 `clip_001.mp4`（548KB）、`clip_002.mp4`（508KB）、`bgm.m4a`（48KB）。
    - 画布生成动态切片组、视频切片节点、BGM 音频节点。
  - `studyOutputNodeIds` 持久化 8 个输出节点；再次重新拉片后节点总数保持 32，旧 id 被新 id 替换，说明旧输出已清理。
  - 分镜表「复制整表」输出标准 Markdown 表格（含分析模型和两行分镜数据）。
- 截图：
  - `FILM-STUDY-REDESIGN-2-node-menu.png`：视频节点右键菜单。
  - `FILM-STUDY-REDESIGN-2-sheet.png`：AI 分镜表查看器。

## 备注

- 动态切片使用 `ultrafast` 编码保证速度，画质适合参考；需要高质量切片时可后续改为可选编码档位。
- 右键菜单的复杂 AI 操作依赖节点工具栏存在（右键会先选中节点），已通过命令桥验证。
- `React Flow: Couldn't create edge for ... handle id null` 警告来自多次测试累积的旧项目残留边，新项目不会产生；后续可加边清理。
