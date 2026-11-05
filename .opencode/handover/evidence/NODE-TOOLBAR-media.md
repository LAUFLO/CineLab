# NODE-TOOLBAR 本地媒体链路验证记录

- 日期：2026-11-05
- 范围：ffmpeg / ffprobe 接入、资产元数据、宫格切分、抽帧拉片
- 状态：本地链路已打通，UI 端到端可用

## 改动

新增：

- `src/shared/media.ts`
- `src/main/types/ffprobe-static.d.ts`
- `src/main/media/ffmpeg.ts`
- `src/main/media/paths.ts`
- `src/main/media/grid.ts`
- `src/main/media/frames.ts`
- `src/main/ipc/media.ts`

修改：

- `src/main/ipc/index.ts`（注册 media IPC）
- `src/main/assets/ingest.ts`（视频 probe 写入 duration / fps / hasAudio）
- `src/shared/generation.ts`（GeneratedAsset 扩展）
- `src/shared/canvas-schema.ts`（OutputRef 扩展）
- `src/shared/ipc-contract.ts`（MediaApi）
- `src/preload/index.ts`（media API）
- `src/renderer/src/stores/canvas.ts`（addAssetNodes + 布局避让 + dev 调试暴露）
- `src/renderer/src/canvas/nodes/node-operations.ts`（宫格切分 / 抽帧拉片 implemented）
- `src/renderer/src/canvas/nodes/NodeToolbar.tsx`（执行入口）
- `package.json` / `pnpm-lock.yaml`（ffmpeg-static 5.3.0、ffprobe-static 3.1.0）
- `pnpm-workspace.yaml`（allowBuilds 加 ffmpeg-static）
- `electron-builder.yml`（asarUnpack）

## 验证

1. `corepack pnpm typecheck`：通过（EXIT=0）。
2. `corepack pnpm build`：通过（主进程 / preload / renderer 均成功）。
3. `media.probe('assets/vid/test.mp4')`：640×360、5 秒、30fps、hasAudio=true。
4. `media.splitGrid` 3×3：返回 9 张，单张 341×341，落盘成功。
5. `media.extractFrames` mode=12：返回 1 页、2424×1100，模型标注「本地抽帧拉片（12）」。
6. 图片节点 UI：宫格切分 9 宫格 → 新增 9 个节点，标题「图片节点 1 · 切分 1..9」。
7. 视频节点 UI：抽帧拉片 → 固定 12 帧 → 新增「视频节点 1 · 拉片 1」，2424×1100。
8. 布局避让：新节点自动避开已有节点，未覆盖视频节点或用户手动拆的 4 宫格。
9. 测试数据已清理：删除测试 9 宫格与拉片节点，视频节点恢复无输出，删除临时测试视频与拉片图；用户手动拆的 4 宫格保留。

## 追加验证（2026-11-05）

1. `media.cropImage` 16:9：原图 1024×1024 → 1024×576。
2. `media.trimVideo` 1s–3s：输出 640×360、duration 2.1s、hasAudio=true。
3. 图片节点 UI 裁剪 16:9：版本栈新增「本地裁剪（16:9）」，selectedOutputId 指向新版本，节点高度按比例更新。
4. 视频节点 UI 片段截取：对话框默认 0–时长；输入 0–2s → 新版本 duration 2.167s，toast「截取完成：2.2 秒」。
5. 测试数据已清理：图片节点恢复 1 个版本，视频节点恢复无输出，删除测试视频 / 裁剪 / 截取资产。

## 追加验证（2026-11-05 晚）

1. 抽帧改为单帧：首帧 time=0、尾帧 time=4.95、当前帧 time=1.5，均输出 640×360。
2. 分离音视频：无声视频 640×360、duration 5、hasAudio=false；音轨 m4a、duration 5.016。
3. 画面裁切 9:16：202×360、duration 5、hasAudio=true。
4. UI 抽帧首帧 / 尾帧 / 当前帧：新增图片节点；当前帧在播放头 1.5s 与首帧哈希不同。
5. UI 分离音视频：新增无声视频节点 + 音频节点；无音轨版本点击「分离音视频」显示禁用态「当前视频无音轨」。
6. UI 画面裁切 9:16：新版本 202×360，节点高度按竖屏比例更新。
7. 自动连线：抽帧 1 条、分离音视频 2 条、宫格切分 9 条，全部 source → 派生节点。
8. 测试数据已清理，用户手动 4 宫格保留。

## 未覆盖

- 打包验证：`electron-builder --win --dir` 在本机报 `EXDEV: cross-device link not permitted`（Electron 解压后重命名 LICENSE 失败），与 asarUnpack 配置无关，属于当前文件系统/安全软件限制。`asarUnpack` 已配置，待正常环境验证。
- 视频生成后的 ingest probe：当前项目没有可用的视频模型，未端到端验证；probe 函数已单独验证。
- 宫格切分「自定义」行列：当前提示暂未开放。
- 图片自由裁剪：当前只支持比例裁剪。

## 下一步

1. P1 AI 图像操作（九宫格、多角度、打光、人像、抠图）。
2. 图片自由裁剪与宫格自定义行列。
3. 在正常环境跑一次 `dist:win`，确认 `app.asar.unpacked` 内 ffmpeg / ffprobe 路径可执行。
