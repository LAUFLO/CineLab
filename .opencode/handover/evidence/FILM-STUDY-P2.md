# 逐帧拉片 P2 验证

日期：2026-11-08
分支：`film-study`
关联：`docs/film-study-plan.md`、`FILM-STUDY-P2`

## 范围

P2 AI 分析包：

- 导出 ZIP：README、prompt、schema、project、frames
- 导入 AI JSON，生成段落
- 可选导入宏观分析、剧情线、情绪点
- 导入前确认，导入后刷新拉片室

## 实现

### 导出

`exportFilmStudyAnalysisPackage`：

- 临时目录写入 README/prompt/schema/project
- 帧文件复制到 `frames/`
- 帧名包含序号和时间码
- 使用现有 `zipDirectory` 打包
- 保存对话框默认文件名 `影片名-AI分析包.zip`

### 导入

`normalizeFilmStudyAnalysis`（纯函数）：

- 接受 `{ segments: [...] }` 或直接数组
- 时间段排序、裁剪到片长、过滤无效区间
- 归一化可选字段
- macroAnalysis / storyLines / audienceCurvePoints 可选
- 空段落抛错

IPC 导入支持剥离 Markdown code fence 和 BOM。

## 实测

### 单元测试

新增：

- `src/main/film-study/__tests__/analysis.test.ts`
  - 数组与对象两种输入
  - 时间排序与裁剪
  - 可选结构/情绪数据
  - 非法段落拒绝
  - 包内帧文件名映射
- `src/main/film-study/__tests__/package.test.ts`
  - 实际生成 ZIP
  - 解压检查 README/prompt/schema/project/frames

### UI 冒烟

隔离实例：

- 拉片室头部出现「导出 Markdown」「导出 AI 包」「导入 AI 结果」
- `window.api.filmStudy.exportAnalysisPackage` 存在
- 点击「导入 AI 结果」出现确认框「导入 AI 拉片结果」
- 取消后不修改数据

## 验证

```text
corepack pnpm typecheck  通过
corepack pnpm test       9 files / 26 tests 通过
corepack pnpm build      通过
```

## 限制

- 暂未做字幕提取，分析包不含 subtitles.srt
- 导出/导入的保存/打开对话框未自动化；包生成和 JSON 归一化由单元测试覆盖
