# CLIP-STUDIO POC-1：隐藏窗口导出验证

日期：2026-11-07
脚本：`scripts/poc-capture/`
结论：**导出渲染器改用 Canvas 2D；DOM 截图路线在 Electron 下无法输出 4K。**

## 环境

- Windows，Electron 45.2.2
- ffmpeg-static 5.3.0
- 测试内容：3 段 1080p 视频（testsrc2 / smptebars / testsrc，各 4 秒）、1 段 10 秒正弦波音频、1 条常驻字幕
- 时间线：10 秒，30fps，300 帧

## 结果汇总

| 方案 | 分辨率 | 帧数 | 平均耗时 | p95 | 实时比 | 内存 | 结论 |
|---|---|---|---|---|---|---|---|
| DOM + `capturePage` | 1920×1080 | 300 | 76.7ms | 124ms | 0.43 | 247MB | 可用 |
| DOM + `capturePage` | 3840×2160 | 10 | 155ms | 165ms | 0.21 | 265MB | **不可用**：实际只截到 2496×1532，靠放大 |
| CDP `Page.captureScreenshot` | 3840×2160 | — | — | — | — | — | **不可用**：4K 视口下卡死 |
| Canvas 2D | 1920×1080 | 3 | 37.4ms | — | 0.84 | 92MB | 可用 |
| Canvas 2D | 3840×2160 | 30 | 104.2ms | 126ms | 0.31 | 105MB | 可用 |

Canvas 4K 分解：seek 4ms + draw 45.1ms + JPEG 编码 55.1ms。

## 关键发现

### 1. Electron 隐藏窗口的渲染表面受屏幕限制

`BrowserWindow` 设为 3840×2160 时，`capturePage()` 实际只返回 2496×1532（或 2520×1596），即屏幕工作区的物理尺寸。以下手段均未突破：

- `force-device-scale-factor=2`：`window.devicePixelRatio` 确实是 2，但截图尺寸不变
- `offscreen: true`：仍然被限制
- CDP `Emulation.setDeviceMetricsOverride` + `Page.captureScreenshot`：4K 视口下卡死

因此 DOM 截图只能用于 1080p 或更小；4K 必须走 Canvas。

### 2. Canvas 2D 可以稳定输出 4K

页面内 `<canvas width=3840 height=2160>`，`drawImage(video)` + `fillText`，`toDataURL('image/jpeg', 0.92)` 取帧，完全不受窗口尺寸限制。

4K 下 `drawImage` 45ms、JPEG 编码 55ms，总计约 104ms/帧，实时比 0.31，达到 POC 判定线（≥0.3）。

### 3. seek 精度验证通过

导出后抽取 1s / 5s / 8s 三帧：

- 1s 帧左上角时间码精确显示 `00:00:01.000`、第 30 帧
- 5s 切到第二段素材（彩条）
- 8s 切到第三段素材（测试图）
- 字幕全程正确

音画时长均为 10.000 秒，300 帧，完全一致。

### 4. 编码链路正常

ffmpeg 编码 1080p 300 帧耗时 1462ms，音频 40ms，mux 66ms。临时文件 + rename 流程未发现问题。

## 架构影响

原方案（`docs/clip-studio-plan.md` 7.2–7.4）写的是「时间线 → DOM → capturePage」。POC 证明该路线只能做到 1080p，4K 不可行。

调整为：

- **预览**：Canvas 2D 渲染器，按 `requestAnimationFrame` 实时绘制
- **导出**：同一个 Canvas 渲染器，逐帧 `frame(t)` + `toDataURL`（或 `toBlob`）
- **DOM 只负责时间线 UI、素材池、检查器**
- 预览与导出共用同一套绘制函数，一致性由「同一个渲染器」保证

代价：

- 文字排版、描边、阴影需要手写 Canvas 代码
- 转场用 `globalAlpha`，混合模式用 `globalCompositeOperation`
- CSS 滤镜需要用 Canvas filter 或近似实现

收益：

- 支持任意分辨率，4K 达标
- 1080p 比 DOM 快一倍，内存低一半
- 预览与导出真正同源
- 不依赖窗口尺寸，不引入额外 Chromium

## 后续

- P2 用 Canvas 渲染器实现正式导出
- 预览播放器同样改为 Canvas，避免两套绘制逻辑
- POC 脚本保留在 `scripts/poc-capture/`，`out/` 已忽略
