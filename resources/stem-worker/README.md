# Stem worker

人声/背景音分离的 Python sidecar，由主进程按任务启动。

## 内容

- `worker.py`：读取 44.1kHz 立体声 WAV，调用 Demucs `htdemucs`，输出人声和背景音 WAV。
- `demucs/`：从 Demucs v4.1.0 裁剪出的推理模块（MIT），只保留 `apply` / `htdemucs` / `states` 等依赖，不包含训练、音频 I/O 和 HuggingFace 代码。
- `julius/`：Demucs 依赖的 PyTorch DSP 库 v0.2.8（MIT）。
- `LICENSE-DEMUCS`、`LICENSE-JULIUS`、`NOTICE.md`：许可与来源说明。

## 模型

`htdemucs.th` 不放在仓库里，由 CineLab 的 `stem-model` 组件下载：

- Meta：`https://dl.fbaipublicfiles.com/demucs/hybrid_transformer/955717e8-8726e21a.th`
- Hugging Face：`anchor-flux/demucs-htdemucs`
- SHA256：`8726e21a993978c7ba086d3872e7608d7d5bfca646ca4aca459ffda844faa8b4`

## 运行时

复用 `depth-runtime` 的 Python 3.11 / PyTorch 2.8 CPU / numpy / einops / tqdm，不单独打包运行时。

## 本地验证

```powershell
$py = "$env:APPDATA\cinelab\components\depth-runtime\python\python.exe"
& $py worker.py --input test.wav --vocals vocals.wav --background background.wav --model htdemucs.th
```

`--max-full-seconds 0` 可强制走分段流式路径，用于验证内存与进度。
