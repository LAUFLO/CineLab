# CLIP-STUDIO P2：Canvas 渲染器与预览播放

日期：2026-11-07
状态：基础版完成
验证：typecheck 通过；CDP 截图确认 2 秒处字幕渲染

## 交付

| 文件 | 内容 |
|---|---|
| `src/renderer/src/studio/renderer.ts` | 时间线 → Canvas 绘制：视频、图片、文字、变换、透明度、混合模式 |
| `src/renderer/src/studio/PreviewStage.tsx` | 预览 canvas、播放时钟、rAF 推进播放头 |
| `src/renderer/src/studio/PreviewPane.tsx` | 播放 / 暂停 / 回到开头，时间显示 |
| `src/renderer/src/stores/timeline.ts` | `playing`、`play`、`pause`、`togglePlay` |

## 渲染器

- 轨道从下到上绘制，音频轨跳过。
- 视频按 `sourceStartMs + (t - startMs) × speed` 设置 `currentTime`，差异超过 40ms 才 seek。
- 图片按 `naturalWidth/Height` 计算 cover 尺寸。
- 变换：缩放、旋转、偏移、拉伸。
- 透明度：`globalAlpha`；混合模式：`globalCompositeOperation`。
- 文字：字体、字号、颜色、粗斜体、描边、阴影、背景、多行。
- 素材通过 `cinelab-asset://` 加载，失败时跳过该片段。

## 播放

- `requestAnimationFrame` 推进 `playheadMs`，到达总时长自动暂停。
- 播放到末尾后再次点击播放会从头开始。
- `PreviewStage` 在 `playheadMs` 变化时重绘当前帧。

## 已验证

- 时间线 2 秒处，预览区正确显示字幕「第一句」。
- 播放头随播放推进，到 00:32 自动暂停。
- 预览 canvas 尺寸为 1920×1080，CSS 等比缩放。
- **真实视频验证**：从 `C:\Users\LAUFLO\Videos\Rendering\output` 复制 3 段视频到测试项目 `assets/vid/demo-01..03.mp4`，预览在 1 秒处正确显示真实画面，字幕叠加正常。

## 真实素材接入方式

当前通过手工复制到项目 `assets/vid/` 并写死在 `demo.ts`。正式接入需要：

- 画布节点输出或资产库条目直接映射到 `media` 字段。
- 素材池从项目 `assets/` 和资产库动态读取，不再使用写死的 demo 列表。
- 视频缩略图与代理文件生成。

## 当前限制

- 视频 / 图片素材是 demo 假路径，加载失败，画面只有文字。
- 音频混音未接，预览无声。
- 播放时时间线不会自动跟随播放头。
- 单帧渲染、完整导出、快速路径、代理缓存未做。

## 下一步

P2 剩余：单帧渲染、完整导出、快速路径、代理缓存、播放头自动跟随。真实视频验证依赖素材接线。
