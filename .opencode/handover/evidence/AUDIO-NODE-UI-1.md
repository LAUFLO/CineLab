# 音频节点波形样式

日期：2026-11-07
状态：代码完成，已本地提交（`c9f9d9f`），未推送打包

## 需求

按参考图改造音频节点：

- 深色点阵内容区
- 真实波形 + 红色播放头
- 底部当前时间 / 播放按钮 / 总时长
- 生成中显示「生成中… 取消」胶囊
- 去掉右上角的循环和时钟按钮

## 实现

新增 `src/renderer/src/canvas/nodes/AudioPlayer.tsx`：

- `fetch(cinelab-asset://...)` + `AudioContext.decodeAudioData` 计算 96 段峰值波形
- 波形缓存（模块级 Map），失败时用正弦占位波形
- SVG 绘制波形，红色播放头随进度移动
- 点击波形跳转；隐藏原生 `<audio>`，使用自定义播放按钮
- `busy` 时显示胶囊与取消按钮，隐藏波形，播放按钮禁用
- 标题行右上角显示格式化时长（`m:ss`）

`CineNodeView.tsx`：

- 音频节点优先渲染 `AudioPlayer`
- 通用「生成中」overlay 对音频节点跳过
- 音频完成态用标题行时长替代「已完成」badge

`global.css`：

- `.audio-node` 系列样式，全部使用主题变量
- 点阵背景用 `radial-gradient(circle, var(--border) 1px, transparent 1px)`
- 播放头使用 `var(--danger)`

## 验证

- `corepack pnpm typecheck` / `corepack pnpm build` 通过
- 独立实例创建音频节点并截图：点阵区、占位波形、底部 00:00 / 播放 / 00:00、无右上角按钮
- 真实音频波形尚未用实际音频文件验证（K21）
