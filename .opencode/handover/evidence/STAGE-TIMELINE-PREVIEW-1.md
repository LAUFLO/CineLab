# STAGE-TIMELINE-PREVIEW-1 · 运镜时间轴与本地白模预演

日期：2026-11-09
状态：完成
范围：相机关键帧采样、镜头/时长/关键帧编辑、播放预演、隐藏窗口逐帧渲染、ffmpeg MP4、视频节点回画布
关联：`docs/director-stage-viewport-plan.md`、`STAGE-AGENT-EDITING-1`

## 1. 运镜时间轴

### 1.1 采样纯函数

新增 `src/shared/stage-timeline.ts`：

- `sampleCameraTrack(camera, shot, timeMs)`：位置 / 注视点 / FOV 插值。
- 无关键帧时回退到机位静态状态。
- 支持 `linear` / `easeIn` / `easeOut` / `easeInOut`。
- 首帧前、尾帧后自动钳制。
- 自动处理乱序关键帧。

新增 `src/shared/__tests__/stage-timeline.test.ts`：

- 空轨、单帧、双帧插值、边界钳制、缓动、乱序关键帧。

### 1.2 StageStore

新增状态与操作：

- `selectedShotId`、`selectedKeyframeIndex`、`playing`、`playbackMs`。
- `selectShot`、`addShot`、`removeSelectedShot`、`setShotDuration`。
- `captureKeyframe`、`removeKeyframe`、`seek`、`play`、`pause`。
- `registerViewCapture`：由 3D 视口注册当前视角捕获回调。
- 删除镜头后自动选中上一个剩余镜头。

### 1.3 时间轴 UI

新增 `StageTimeline`：

- 镜头下拉、添加/删除镜头。
- 播放/暂停、当前时间 / 总时长。
- 时长编辑（秒）；缩短时自动裁剪超出范围的关键帧。
- 时间刻度、关键帧圆点、播放头。
- 点击轨道 seek；点击关键帧选中并 seek。
- 「捕获关键帧」使用当前导演视角或机位视角。
- 「删除关键帧」。

### 1.4 播放预演

- 播放时 `StageViewport` 使用镜头采样相机，而不是导演/机位相机。
- 播放期间隐藏机位标记、选中框与 TransformControls。
- 暂停/播放结束恢复原视角。
- `StageWindow` 用 `requestAnimationFrame` 推进 `playbackMs`，到镜头时长自动暂停。

### 1.5 真实 UI 验证

```text
场景：镜头「对话全景」5 秒
初始 0 关键帧
→ 在导演视角捕获关键帧 0s
→ 拖拽视口旋转，捕获关键帧 3.75s
→ 场景文件 cameraTrack 两帧，位置不同
→ 点击播放：1 秒后 1.3s，画面 canvas 数据从 320198 变为 292062
→ 5 秒后自动暂停在 5.0s
→ 删除关键帧：2 → 1，Ctrl+Z 恢复 2
→ 时长改为 3.0s：3.75s 关键帧被裁剪，剩 1 帧；撤销恢复 5.0s / 2 帧
→ 添加镜头：镜头 2；删除后自动回到镜头 1
```

截图：`.opencode/handover/evidence/STAGE-TIMELINE-1.png`

## 2. 本地白模预演

### 2.1 渲染页

新增：

- `src/renderer/stage-render.html`
- `src/renderer/src/stage/stage-render.ts`
- `src/renderer/src/stage/stage-scene.ts`：从 StageViewport 抽出的对象构建与释放逻辑。

渲染页：

- 复用 `createStageObject` 构建人物/几何/群众。
- 只渲染场景对象、地面、灯光和背景色，不显示网格、机位标记、编辑辅助。
- `window.__setStage({ doc, shotId, width, height })`。
- `window.__renderFrame(timeMs)`：按运镜采样相机、渲染、返回 JPEG dataURL。

### 2.2 主进程导出

新增 `src/main/stage/export.ts`：

```text
loadStageFile
→ 隐藏 BrowserWindow 加载 stage-render.html
→ __setStage
→ ffmpeg -f image2pipe 逐帧写 JPEG
→ H.264 MP4
→ ingestAsset 写入 assets/vid
→ 返回 GeneratedAsset + exports 路径
```

- 尺寸按镜头画幅与 720p/1080p 计算（1280×720 / 720×1280 / 720×720 等）。
- 帧率 24 / 30。
- 进度通过 `stage:export-progress` 推送到渲染进程。
- `StageWindow` 顶栏新增「导出预演」，导出完成后自动创建视频节点并连线。

### 2.3 真实导出验证

```text
点击「导出预演」
→ exports/白模预演-*.mp4 生成，117181 字节
→ 画布新增「白模预演 1」视频节点，时长 5 秒
→ assets/vid 生成对应 MP4
→ media.probe：
   width=1280, height=720, duration=5, fps=24,
   videoCodec=h264, pixFmt=yuv420p, hasAudio=false
→ 0s 与 3s 抽帧 SHA256 不同，确认运镜生效
```

预演帧：`.opencode/handover/evidence/STAGE-PREVIEW-FRAME.png`

## 3. 测试环境修复

自动化验证时发现：隔离实例窗口被遮挡时 Chromium 会暂停 `requestAnimationFrame`，导致播放不推进。

- 主窗口 `webPreferences.backgroundThrottling: false`。
- 隔离脚本设置 `CINELAB_DISABLE_THROTTLE=1`。
- 主进程在该环境变量下追加：
  - `--disable-renderer-backgrounding`
  - `--disable-background-timer-throttling`

不影响正常生产启动。

## 4. 验证汇总

```text
33 test files, 233 tests passed
typecheck 通过
build 通过
```

## 5. 已知限制

- 导出 UI 固定 720p / 24fps；主进程已支持 1080p / 30fps 参数，后续加设置。
- 导出暂不支持取消与进度条，只在按钮显示百分比。
- 动作轨（角色运动）尚未参与预演采样，只渲染静态对象。
- 关键帧暂不支持拖动改时间，只能重新捕获或删除。
- 导出文件同时保留在 `exports/` 和 `assets/vid/`，后续可改为临时文件。

## 6. 下一步

1. 剪辑助手 `clip` profile。
2. 技能管理 UI。
3. 白模预演参数设置与取消。
4. 动作轨预演、机位关键帧拖动。
5. 推送前同步 `origin/main`。
