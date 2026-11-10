# WORKSPACE-ENHANCE-1 · 文本编辑、工具栏、整理画布、音频波形、智能去字幕、AI 分镜

日期：2026-11-08

## 1. 文本节点放大编辑 + Markdown

调研结论：文本节点主要承载剧本、提示词、分镜表、拉片笔记，Markdown 比富文本更适合复制、AI 读取和导出；不引入 Tiptap/ProseMirror 等重型富文本编辑器。

改动：

- 新增 `TextEditorDialog.tsx`：约 1100×720 大编辑弹窗，左侧 Markdown 编辑、右侧实时预览，提供 H2/粗体/列表/引用/代码/表格快捷插入，字数统计，Ctrl+Enter 保存。
- 新增 `text-markdown.ts`：基于 `marked` 的统一 Markdown 渲染。
- `CineNodeView`：文本内容按 Markdown 渲染，双击或右上角「编辑」按钮打开编辑器；保存写回 `data.text`。
- 节点内 Markdown 支持标题、列表、引用、代码、表格、链接，超长内容滚动。
- 依赖：新增 `marked 18.1.3`。

## 2. 工具栏始终相对节点居中

- `CineNodeView` 删除按视口 38%–62% 切换 left/center/right 的逻辑，固定 center。
- 实测工具栏中心与节点中心差值 0。

## 3. 整理画布改为拓扑布局

原逻辑：所有顶层节点按固定 1400px 宽度顺序平铺。

新逻辑：

- 顶层节点作为布局块，分组把组内节点视为整体，保持组内布局。
- 按连线计算入边/出边，无入边节点为第 0 列，下游依次右移；同一列按当前 y 排序。
- 孤立节点放到最后一列。
- 列间距 80px、行间距 60px；循环依赖时退化为同层排列，避免死循环。

## 4. 音频波形

- 柱状波形从上下对称改为底部对齐（`y=100-height`），所有柱共用底部基线。
- 播放头 inset 从 8px 改为与波形一致的 10px，红线和波形底部对齐。
- 柱宽/圆角微调，播放头加轻微光晕。

## 5. 智能去字幕自动检测

- 新增 `src/main/media/subtitle-detect.ts`：
  - 均匀抽取底部 45% 区域最多 6 帧，缩放 480 宽灰度 rawvideo。
  - 按行统计相邻像素边缘强度，找跨帧稳定的底部文字带。
  - 在文字带内按列边缘找左右边界，加 padding，限制在画面内。
  - 大面积高纹理自动收窄到最底部，避免误伤主体；失败返回 null。
- 新增 `media:detect-subtitle-rect` IPC / preload / contract。
- 「智能去字幕」点击后先检测，检测到区域直接开始 LaMa 修复，不再要求画框；失败时回退框选对话框。
- 保留「框选去字幕」作为手动入口。
- 实测 640×360 带字幕测试视频返回 `{ x: 197, y: 296, width: 245, height: 31 }`，与字幕位置吻合。

## 6. 逐帧拉片：AI 自己决定分镜粒度

调研：LibTV、TapNow、蝉妈妈、创一、瞬镜都没有让用户选精度，镜头粒度由算法/模型判断。

改动：

- 拉片节点删除「分镜精度」下拉，只保留「AI 分析」模型选择和输出内容。
- 节点高度 280 → 250，旧节点 308/368 自动迁移到 278。
- 主进程 prompt 改为：候选镜头由 scdet 产出，多模态模型用 `from/to` 合并连续镜头为叙事分镜，必须连续覆盖全部候选。
- 本地按模型返回的 `from/to` 重建分镜时间与代表帧；返回无效时回退每个候选镜头。
- 无多模态模型时仍回退纯 scdet 自动分镜。
- 实测 mock 模型返回 `from 1 to 2`，拉片结果从 2 个分镜合并为 1 个分镜。

## 验证

- `corepack pnpm typecheck` 通过。
- `corepack pnpm test`：24 个文件、145 个用例全部通过。
- `corepack pnpm build` 通过。
- 隔离实例 CDP：
  - 文本编辑弹窗、Markdown 预览正常。
  - 工具栏中心与节点中心 diff = 0。
  - 音频波形底部对齐。
  - 整理画布按列拓扑排列并 fitView。
  - 字幕检测返回合理区域。
  - 拉片节点仅保留「AI 分析」，AI 合并后 2→1 个分镜。

## 截图

- `WORKSPACE-ENHANCE-1-text-editor.png`
- `WORKSPACE-ENHANCE-1-audio-wave.png`
- `WORKSPACE-ENHANCE-1-arrange.png`
