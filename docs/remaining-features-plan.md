# 剩余已知限制开发方案（K9 / K11 / K24）

日期：2026-11-07
状态：已完成（K9 / K11 / K24）
范围：K9、K11、K24
已移出范围：
- K2 文本流式/多轮：文本节点不需要流式；等 Agent 阶段统一实现
- K5 / AGENT-1：后续单独讨论

## 1. K9：导出项目包含全局资产

现状：`export:project` 直接压缩项目目录，`scope: 'global'` 的输出仍指向资产库，换机器断图。

方案：

1. 主进程新增项目导出 staging：
   - 复制项目目录到临时目录（忽略 `.lock`、`.trash`）
   - 读取 `project.json` 与所有画布 JSON
   - 遍历节点 `outputs[]`，收集 `scope === 'global'` 的引用
   - 从资产库复制到 `assets/global/<sha256前16位>.<ext>`
   - 把引用改写为 `scope: 'project'`、`path: 'assets/global/<hash>.<ext>'`
   - 写回 staging 画布 JSON
2. 使用现有 `zipDirectory` 压缩 staging，输出仍由系统保存对话框选择。
3. 缺失全局素材时明确报错，不生成半坏包。
4. 同一全局文件只复制一次。

验收：含全局素材的项目导出 zip 后解压，画布 JSON 中不再有 `scope: 'global'`，图片路径存在。

实现记录：

- `src/main/export/project-export.ts`：staging 复制项目、复制全局素材、改写画布 JSON。
- `stageProjectExport` 可单测；Vitest 覆盖全局素材复制、路径改写、重复素材去重、缺失素材报错。

## 2. K11：资产缩略图缓存

现状：资产网格直接加载原图，视频只显示图标；大库滚动卡顿。

方案：

1. `LibraryAsset` 增加可选 `thumbnail`（相对库根路径）。
2. 主进程生成并缓存缩略图到 `<libraryRoot>/.thumbs/`：
   - 缓存键：`sha256(相对路径 + mtime + size)` 前 24 位
   - 图片：Electron `nativeImage` 缩放到宽 320，JPEG 质量 78；失败时用 ffmpeg 兜底
   - 视频：ffmpeg 取 0.1 秒帧，缩放到宽 320，JPEG
   - 已存在直接复用
3. `.thumbs` 以点开头，已被 `isIgnored` 排除，不会出现在资产列表。
4. `AssetGrid` 优先使用 `asset.thumbnail`，视频有缩略图时也显示图片；加载失败回退到图标。
5. 缩略图生成失败不影响资产列表，只返回 `thumbnail: undefined`。

验收：首次打开图片/视频文件夹生成缩略图；第二次打开直接复用；资产卡片不再加载原图。

实现记录：

- `LibraryAsset.thumbnail`，缓存目录 `.thumbs/`。
- 图片用 `nativeImage` 缩放；视频用 ffmpeg 抽 0.1 秒帧。
- `AssetGrid` 优先加载缩略图，视频有缩略图时也显示画面。
- 已用共享资产库实测：8 张图片 + 1 段视频生成缩略图，第二次返回缓存路径。

## 3. K24：多轨音频混合

现状：视频合成只支持单 BGM 循环混入原声，不能独立调音量或加旁白。

方案：

1. `ConcatOptions` 增加：
   - `narrationPath?: string`
   - `originalVolume?: number`（默认 1）
   - `bgmVolume?: number`（默认 0.25）
   - `narrationVolume?: number`（默认 1）
2. ffmpeg 音轨：
   - 原声：`[0:a]volume=<orig>`
   - BGM：`-stream_loop -1`，`volume=<bgm>`
   - 旁白：`volume=<voice>`
   - `amix=inputs=N:duration=first:dropout_transition=0`
   - 视频流 copy，音频 AAC 192k
3. 字幕仍在混音前烧录；无字幕时直接混音。
4. 合成面板增加：
   - 旁白音频选择/清除
   - 原声、BGM、旁白三个音量滑块（0–100%）
5. IPC / preload / 类型同步扩展。

验收：两段视频 + BGM + 旁白合成，输出时长等于视频，音轨包含三路混合；单独调 BGM 音量能听出变化。

实现记录：

- `concat.ts` 支持 `narrationPath`、`originalVolume`、`bgmVolume`、`narrationVolume`。
- 音轨 filter：三路 `volume` → `amix=inputs=N:duration=first:normalize=0`。
- 合成面板新增旁白选择与三路音量滑块。
- Vitest 真实 ffmpeg 用例：两段 1 秒视频 + BGM + 旁白，输出 2 秒左右且含音轨。

## 4. K2：文本流式输出与多轮（已移出范围）

用户确认：文本节点不需要流式输出；后续画布集成 Agent 时再统一实现流式对话。

本轮保留普通文本生成的一次性返回，不引入 token 事件、对话历史或文本对话面板。

## 5. 验证

```text
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
```

K9 解压检查、K11 缓存复用、K24 ffprobe 音轨各留一条 evidence。
