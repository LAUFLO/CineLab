# CLIP-STUDIO P3/P4：转场、变速、whisper 自动字幕

日期：2026-11-08
状态：完成
验证：typecheck / 60 测试 / build 通过；CDP 端到端实测

## 1. P3 转场

- 新增 `src/shared/timeline-transition.ts`：
  - `fade`：上一片段与当前片段交叉淡化
  - `dip-black`：先淡到黑，再从黑淡入
- 渲染器：
  - 片段头部有 `transitionIn` 时，按进度同时绘制上一片段尾部与当前片段
  - 上一片段不连续时从黑场淡入
  - `waitForMedia` 同时等待转场前一视频片段的 seek
- 属性面板新增「转场」：无 / 交叉淡化 / 黑场 + 时长 200–3000ms。
- 时间线片段显示「淡 / 黑」标记。
- 转场进度单测 3 条。

实测：

| 场景 | 结果 |
|---|---|
| 红图 5s → 蓝图 5s，蓝图 1000ms fade | 5.5s 预览为紫色，红蓝各 50% |
| 改为 dip-black | 5.5s 预览为纯黑 |
| 导出 | 1920×1080 / 10 秒 / 300 帧 |
| 导出 5.5s 抽帧 | 紫色，与预览一致 |
| 检查器 | 选中片段出现「转场」区，切换 dip-black 后文档立即更新 |

## 2. P3 变速

- 属性面板「速度」改为 0.25 / 0.5 / 1 / 1.5 / 2 / 4。
- 使用 `setClipSpeed`，片段时长按比例变化。
- 时间线显示 `2×` 等速度标记。
- 导出音频：
  - 源音频裁剪长度 = 片段时长 × speed
  - `preservePitch=true`：`atempo` 链保持音高
  - `preservePitch=false`：`asetrate` + `aresample` 改变音高
- 快速路径 / stream-copy 已拒绝变速，自动回退逐帧。

实测：

| 项 | 结果 |
|---|---|
| 5 秒视频片段设为 2× | 时长变为 2.5 秒 |
| 导出视频 | 2.500 秒 / 75 帧 |
| 导出音频 | AAC / 2.500 秒 |
| 文件 | 113KB |

## 3. P4 whisper 自动字幕

### 组件

- `ComponentKind` 新增：
  - `whisper-runtime`：官方 whisper.cpp v1.7.6 `whisper-bin-x64.zip`
  - `whisper-model`：`ggml-base.bin`
- 组件安装器通用化 model 类型（`MODEL_FILES`），不再只特判 `depth-model`。
- 设置 → 组件新增两张卡片。
- 下载地址与 sha256 固定：
  - runtime 3.67MB，sha256 `0d2eca29...`
  - model 147.95MB，sha256 `60ed5bc3...`，HF + hf-mirror

实测：两个组件均下载并安装成功；runtime 解压到 `whisper-runtime/Release/whisper-cli.exe`，模型落到 `whisper-model-base/ggml-base.bin`。

### 转写链路

- 主进程 `timeline/transcribe.ts`：
  1. 按 scope 解析素材绝对路径
  2. probe 检查音轨
  3. ffmpeg 抽取 16k 单声道 WAV
  4. 调用 `whisper-cli.exe -m ggml-base.bin -f wav -l auto -oj --print-progress`
  5. 解析 JSON `transcription`，offsets 转毫秒
- 新增 IPC：`timeline:transcribe`、`timeline:transcribe-cancel`、进度事件。
- 时间线工具栏「自动字幕」：
  - 需要选中视频/音频片段
  - 组件未安装时引导到设置
  - 转写中显示进度，点击可取消
  - 结果按片段 speed 映射时间，批量写入字幕轨，只占一条撤销记录

实测：

- Windows TTS 生成英文语音：「Hello, this is a subtitle test...」
- 自动字幕生成 1 条字幕：
  - 文本：`Hello! This is a subtitle test. The quick brown fox.`
  - 时间：0–4.96 秒
- reload 后字幕仍存在。

## 4. 已有能力影响

- 字幕轨与手动字幕编辑仍正常。
- 转场/变速片段导出自动回退逐帧，不影响快速路径判定。
- 预览音频变速使用 `playbackRate`，音高会变化；导出使用 `atempo` 保持音高。

## 5. 已知限制

- 自动字幕一次只转写当前选中的视频/音频片段，不支持整条时间线一键转写。
- 转场只作用于视频/图片画面，不交叉淡化音频。
- 转场上一片段源素材尾部不足时会停在最后一帧。
- 预览变速音高不保持；导出保持。
- whisper 默认 base 模型、CPU 推理，长音频转写较慢。
- 组件下载依赖 GitHub / HuggingFace 网络。
- 无说话人分离、无 SRT/VTT 导入。
