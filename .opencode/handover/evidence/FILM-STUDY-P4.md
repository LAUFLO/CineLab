# 逐帧拉片 P4 验证

日期：2026-11-08
分支：`film-study`
关联：`docs/film-study-plan.md`、`FILM-STUDY-4`

## 范围

P4 收尾能力：

- 字幕：SRT 解析/生成、内嵌字幕提取、SRT 导入、拉片室字幕列表与跳转
- 直连多模态分析：`text.chat` 模型 + 最多 12 张代表帧，结果直接写回 `study.json`
- 拉片包导出：`study.json` + `拉片笔记.md` + `README.md` + `frames/` + 可选 `subtitles.srt`

## 实测

### 直连多模态分析

本地 mock OpenAI 兼容接口（`http://127.0.0.1:8897/v1`，`mock-text`）：

- 通过设置保存 provider，经 `film-study:analyze` 调用
- 返回 2 个段落（「AI 建立目标」「AI 压力升级」）
- 返回剧情线「主线」
- 返回情绪点「好奇 30」「紧张 80」
- 归一化后段落、storyLines、audienceCurvePoints 全部写回 study

### 字幕提取

用 ffmpeg 生成带 mov_text 内嵌字幕的 2 秒测试视频：

- `-map 0:s:0 -c:s srt` 提取成功
- 解析结果：
  - `0.5–1.5s 测试字幕一`
  - `1.5–2.0s 测试字幕二`
- 拉片室侧栏显示条数，展开后点击字幕可跳转对应时间

### 单元测试

`src/main/film-study/__tests__/analysis.test.ts`：

- SRT 解析支持逗号/点毫秒、多行对白、BOM、时间倒置过滤
- `parseSrt(buildSrt(...))` 往返一致

`src/main/film-study/__tests__/package.test.ts`：

- AI 包包含 `subtitles.srt`
- 拉片包解压后包含 `study.json`、`拉片笔记.md`、`subtitles.srt`
- 拉片包目录名为「测试影片-拉片包」

### 界面实测

隔离实例 `study-p4ui`，画布放置一个 study 节点，study 内含 2 帧、1 个段落、2 条字幕：

- 拉片室工具栏显示「导出拉片包」「直连分析」
- 字幕区块显示「字幕 2 条」，展开后列出 `00:00.5 测试字幕一`、`00:01.5 测试字幕二`
- 点击第二条字幕，播放器跳到 1.5 秒，当前帧变为 2/2
- 直连分析弹窗显示模型「Mock Text / Mock Text」、12 帧上限说明和「取消 / 开始分析」
- 截图（临时目录）：
  - `p4-room.png`
  - `p4-subtitles.png`
  - `p4-analysis.png`

## 验证

```text
corepack pnpm typecheck  通过
corepack pnpm test       9 files / 28 tests 通过
corepack pnpm build      通过
```

## 限制

- 系统文件对话框（Markdown / AI 包 / 拉片包 / SRT / JSON）未自动化；包生成与归一化由单元测试覆盖
- 直连分析最多发送 12 张代表帧，需模型实际支持图片输入；长片后续可按段落分段多次请求
- 拉片包可导出，重新导入仍走项目/资产导入链路
- 字幕支持提取/导入/查看/跳转，尚不支持逐条编辑
