# 剪辑内核补全：关键帧 / 画中画 / detachAudio / linkage / 预览音高

日期：2026-11-08

## 完成内容

- 新增 `src/shared/timeline-keyframes.ts`
  - `evaluateClipKeys` 支持 `position / scale / rotation / opacity / volume`
  - 线性、ease-in、ease-out、ease-in-out 插值
  - 无关键帧回退到片段静态属性
  - `volumeExpression` 生成 ffmpeg 分段线性音量表达式
- `renderer.ts` 按片段内时间求值，画面位置/缩放/旋转/透明度全部走关键帧
- `PreviewStage.tsx` 预览音频改为 `HTMLAudioElement`
  - `preservesPitch` 跟随片段开关，变速时保持音高
  - 每帧按播放头更新音量关键帧
- `InspectorPane.tsx`
  - 画面区可编辑缩放、X/Y 偏移、旋转、不透明度
  - 「画中画预设」：scale 0.35、offset 0.28
  - 「关键帧」区：属性/值/百分比/缓动可编辑，可添加和删除
  - 「分离音频」按钮，检查视频是否有音轨后执行 `detachAudio`
- `timeline-edit.ts` linkage 接入移动、头部裁剪、删除
  - 主轨片段移动时依附片段同步平移
  - 头部裁剪时依附片段同步平移
  - 删除主轨片段时联动删除区间内依附片段
  - `doc.linkage` 可整体关闭

## 验证

- `corepack pnpm typecheck` 通过
- `corepack pnpm test`：13 个测试文件 74 个用例通过（新增关键帧 6 个、linkage 3 个、字幕解析 4 个）
- `corepack pnpm build` 通过
- 关键帧导出实测：图片片段 1.2 秒，opacity 0→1；导出 36 帧，YAVG 从 16 单调升到 80
- 画中画导出实测：scale 0.35 / offset 0.28；左上角与画面中心 YAVG=16（黑背景），右下画中画区域 YAVG=81（红色图片）
- 整条时间线转写实测：TTS 音频 5 秒生成 0–4960ms 字幕
- 视频原声转写实测：`test-with-audio.mp4` 片段起点 10000ms，生成 10000ms / 1000ms 字幕「请认识一下」，不依赖 TTS
- 静音检测实测：测试视频生成 3 个静音区间 marker，reload 后保留
- 节拍检测实测：生成 4 个节拍 marker，reload 后保留
- 镜头检测实测：构造 2 秒红 + 2 秒蓝视频，`scdet` 在 2000ms 返回 1 个镜头
- SRT 导入 IPC 实测：返回 2 条 cue（1000–2500、3000–4000）
- 转场音频交叉淡化导出实测：2.4 秒时间线，第二段 transitionIn 500ms；输出 2.4 秒 + AAC 音频，交叉区间 mean_volume −32.1dB、max −12.8dB，无静音断层与削波

## 已知限制

- 导出侧音量关键帧使用分段线性表达式，缓动只在预览与逐帧渲染精确
- 画中画依赖 V2 叠加 V1，画布渲染器按轨道从下到上绘制
- 转场时上一片段尾部延伸的源素材不足时会停在最后帧/补静音，行为与素材长度有关
