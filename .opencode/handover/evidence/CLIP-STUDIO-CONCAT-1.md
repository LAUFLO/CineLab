# 剪辑室：Concat 借鉴第一批

日期：2026-11-08
状态：完成

## 调研对象

- 项目：`jub0t/Concat`，版本 0.2.9
- 定位：本地优先、无水印、跨平台视频编辑器，Rust 引擎 + GPU 合成器
- 许可证：AGPL-3.0-or-later
- 结论：只借鉴功能与交互，不复制代码；CineLab 保持 MIT

## 本批实现

### 1. 冻结帧

- 时间线按 `F`：在播放头位置抽取当前帧，插入 2 秒图片片段
- 支持视频和图片片段；视频通过现有 `media:extract-frame` 抽帧
- 插入走 `addClipsInSequence` 的插入模式，后续片段自动后移
- 修复 `insertClips` 的浮点时间问题：切分和 ripple 统一使用 `Math.round(atMs)`，避免尾部片段取整后漏移导致重叠
- 限制：冻结帧暂只支持项目内素材

### 2. 字幕样式预设

- 新增 `src/shared/subtitle-presets.ts`，内置 5 套：
  - 简洁白字
  - 黑底黄字
  - 大字标题
  - 底部新闻条
  - 黄色强调
- `SubtitleSection` 顶部新增「预设」下拉，套用后保留原字幕内容
- 复用现有文本渲染，不需要新增导出逻辑

### 3. 剪辑快捷键

- `Ctrl/Cmd + B`：在播放头切分选中片段；未选中时切播放头下所有片段
- `Q`：删除播放头左侧（裁剪片段头部）
- `W`：删除播放头右侧（裁剪片段尾部）
- `Shift + Delete/Backspace`：涟漪删除选中片段
- `F`：冻结帧
- `M`：切换选中片段静音
- `N`：切换吸附
- 保留原有 `V` / `C` / `Delete` / `Ctrl+Z` / `Ctrl+K`
- 在输入框、文本域、下拉框中不触发

### 4. 音频清理

- `timelineClipSchema` 新增 `audioFx`：
  - `denoise`
  - `enhanceVoice`
  - `loudness`
  - `voiceEffect: none | chipmunk | robot | telephone`
- 新增 `src/shared/audio-fx.ts`，生成 ffmpeg 滤镜链：
  - 降噪：`afftdn`
  - 人声增强：`equalizer` + `acompressor`
  - 变声：`asetrate`/`aresample`/`atempo`、`vibrato`/`aecho`、`highpass`/`lowpass`
  - 响度：`loudnorm` + `aresample=48000`
- `audio-mix.ts` 在变速后、音量/淡入淡出前应用滤镜；响度开启时用 `atrim` 控制输出时长
- 检查器「声音」区新增降噪、增强人声、响度均衡、变声控件
- 限制：音频清理在导出时生效，预览暂不处理

## 验证

- `typecheck` 通过
- `test`：20 个测试文件、125 个用例通过
  - 新增 `audio-fx` 5 个用例
  - 新增 `insertClips` 浮点时间 1 个用例
  - 新增 `addClipsInSequence` 切分插入 1 个用例
- `build` 通过
- `check:encryption` 通过
- 端到端（隔离实例 9224，项目 P3P4）：
  - 字幕预设「大字标题」：字体 Arial Black、字号 96，写入时间线文件
  - 冻结帧：播放头约 11.8 秒插入 2 秒冻结帧，测试视频 8914–11827 / 冻结帧 11827–13827 / 测试视频 13827–15914，无重叠
  - `Ctrl+B`：测试视频 1 段 → 2 段
  - `Q`：片段左边界右移、宽度缩短；撤销恢复
  - `W`：片段尾部缩短；撤销恢复
  - `Shift+Delete`：测试视频移除；撤销恢复
  - 音频清理：降噪/增强人声/响度/机器人写入 `audioFx` 并保存
  - 音频清理导出：2 秒测试时间线导出成功，H.264 + AAC，时长 2.000 秒，音频 mean −20.0dB、max −1.5dB（loudnorm 生效）

## 后续可借鉴

按优先级：

1. 滤镜库（先 15–20 个基础滤镜）
2. 关键帧曲线编辑器
3. 转场库（wipe/slide/zoom）
4. 音效/音乐库（CC0 manifest + 按需下载）
5. HEVC / AV1 / 10-bit 导出
6. 逐词字幕样式
7. MCP / JSON-RPC 对外接口
8. 声音克隆（单独立项）
