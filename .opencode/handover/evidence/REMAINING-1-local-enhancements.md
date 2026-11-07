# 剩余已知限制开发验证（K9 / K11 / K24）

日期：2026-11-07
关联：`docs/remaining-features-plan.md`

## K9：项目导出包含全局资产

- 新增 `src/main/export/project-export.ts`。
- 导出时复制项目到 staging，遍历画布 `outputs`：
  - `scope: 'global'` → 复制到 `assets/global/<sha256前16位>.<ext>`
  - 改写为 `scope: 'project'`
  - 同一全局文件只复制一次
  - 缺失全局素材时中止导出并报错
- `export:project` 改为调用 `exportProjectWithAssets`，返回 `copiedAssets` 数量。
- Vitest：`src/main/export/__tests__/project-export.test.ts` 2 用例通过。

## K11：资产缩略图缓存

- `LibraryAsset` 增加 `thumbnail`。
- 主进程生成缩略图到 `<libraryRoot>/.thumbs/`：
  - 图片：`nativeImage` 缩放到宽 320，JPEG 78
  - 视频：ffmpeg 取 0.1 秒帧，缩放到宽 320
  - 缓存键包含相对路径、mtime、size
- `AssetGrid` 优先使用缩略图，视频有缩略图时显示画面。
- 实测：共享资产库 8 张图片 + 1 段视频均返回 `.thumbs/*.jpg`，第二次直接复用。

## K24：多轨音频混合

- `ConcatOptions` 增加旁白路径与三路音量。
- ffmpeg filter：
  `[0:a]volume=orig[a0];[1:a]volume=bgm[a1];[2:a]volume=voice[a2];[a0][a1][a2]amix=inputs=3:duration=first:dropout_transition=0:normalize=0[a]`
- 合成面板增加旁白选择与三路音量滑块。
- Vitest 真实 ffmpeg 用例：
  - 两段 1 秒视频 + BGM + 旁白
  - 输出约 2 秒、含音轨
  - `src/main/media/__tests__/concat.test.ts` 通过

## K2：已移除

用户确认文本节点不需要流式输出，后续 Agent 阶段再统一实现。已删除：
- 文本对话面板
- `messages` / `stream` / token 事件
- 文本节点 schema 对话字段

## 验证

```text
corepack pnpm typecheck  通过
corepack pnpm test       6 files / 18 tests 通过
```
