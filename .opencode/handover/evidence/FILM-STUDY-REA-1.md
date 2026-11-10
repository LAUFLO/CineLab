# FILM-STUDY-REA-1 · 删除连线、拉片逐帧检测、剪辑室下拉统一

日期：2026-11-09

## 1. 删除连线

- 单击选中连线（选中加粗 + 光晕）。
- `Delete` / `Backspace` 删除选中的连线；没有选中连线时才删除节点。
- 双击连线直接删除。
- 右键连线弹出「删除连线 Delete」菜单。
- 新增 store `removeEdges(ids)`，React Flow 的 `onEdgesChange` remove 也走同一套清理。
- `FlowEdge` 绑定 `onClick` / `onDoubleClick`，并设置 pointer 光标。

引用清理（`stores/edge-references.ts`）：

- 下游是拉片节点：清空 `sourceNodeId / sourcePath / sourceScope / sourceName`。
- 下游是剪辑室：从 `references` 删除对应上游节点 key。
- 下游是视频操作：清空 `sourceNodeId`。
- 同一上游仍有其它连线时保留引用。
- 视频操作的 `project-schema` 允许空 `sourceNodeId`，避免删除后保存校验失败。

实测（生产构建）：

- 单击边 → 选中 1 条。
- Delete → 19 条边变 18。
- 双击边 → 19 变 18，且不会误开添加节点菜单。
- 右键 → 菜单显示「删除连线 Delete」，点击后 18 变 17。

## 2. 拉片重做（参考 rea-video）

调研结论：rea-video 用 96px 逐帧缩略图 + 颜色直方图 + 像素差 + 局部自适应阈值做镜头检测，能识别硬切、跳切、淡入淡出、叠化、划像。它检测的是镜头边界，连续舞蹈仍是一个镜头，所以额外加了动作峰值候选。

新增 `src/main/film-study/shot-detect.ts`：

- ffmpeg 抽 8fps、96px 宽 RGB 帧（长视频降到 4fps）。
- 每帧计算 4×4×4 RGB 直方图、平均像素差、变化像素比例、亮度。
- 硬切：`0.6×直方图距离 + 0.4×像素差` 与局部中位数比较，阈值 0.30，变化面积 > 25%。
- 跳切：变化面积 > 17%、局部峰值 2.5 倍、前后安静。
- 动作峰值：帧差平滑后取局部峰，间隔 ≥ 0.9 秒，最多 10 个。
- 候选切点：硬切 ≥ 2 时用硬切；否则用动作峰值，仍不足时按 2 秒补点；最多 12 段。

拉片流程改为：

1. 抽取候选区间代表帧（每段中点）。
2. Prompt 给出候选切点编号 + 每段代表帧。
3. 模型输出 `from` / `to` 切点编号，可以合并也可以重新拆分，必须连续覆盖全部切点。
4. 本地按切点重建时间区间；模型结果无效时回退候选区间。

实测：

- 12 秒三色硬切测试视频：识别 4 段 `[0,3][3,6][6,9][9,12]`，`usedShotDetection = true`。
- 12 秒移动方块「舞蹈」测试视频：无硬切，输出 6 段 `[0,2][2,4][4,6][6,8][8,10][10,12]`，不再是 1 个分镜。
- 修复：灰度帧会把红/绿判为同亮度导致漏检，改用 RGB 直方图后正常。

## 3. 剪辑室下拉菜单

- 原生 `<select>`（H.264 / HEVC / AV1）换成项目统一的 `Select` 组件。
- 下拉面板使用 `app-select__menu`，与分镜表、模型选择一致。

## 测试

- 新增 `shot-detect.test.ts`：动作峰值、兜底间隔、硬切优先、近邻切点合并。
- 新增 `edge-references.test.ts`：清空拉片来源、保留其它连线、清理剪辑室 references、忽略无关边。
- `typecheck`、26 文件 / 155 用例、`build` 通过。

截图：`FILM-STUDY-REA-1-edge-menu.png`、`FILM-STUDY-REA-1-codec.png`。

## 已知问题

- dev 模式下边偶发不渲染（store 与生产构建正常），属于 Vite 依赖预打包缓存问题，清理 `node_modules/.vite` 后恢复；不影响发布包。
- AI 切点分组仅用逻辑校验，尚未接真实多模态模型回归；无模型时直接使用候选区间。
