# DEPTH-CAPTURE 端到端验证

日期：2026-11-06
方案：`docs/depth-capture-plan.md`
环境：i3-12100F（4 核 8 线程）、Windows、CPU 推理

## 测试环境

| 项 | 版本 |
|---|---|
| Python | 3.11.15（uv 自带） |
| PyTorch | 2.15.0+cpu |
| numpy | 2.4.6 |
| opencv-python-headless | 5.0.0.93 |
| tqdm / easydict / einops | 4.70.1 / 1.13 / 0.8.2 |
| VDA | 官方仓库 main |
| 权重 | Video-Depth-Anything-Small |

torchvision 未安装，worker 内用 `Compose` shim 替代，省约 25MB。

## 结果

### 横屏

| 项 | 值 |
|---|---|
| 输入 | 640×360，24fps，72 帧 |
| 输出 | 640×360，24fps，72 帧 |
| 编码 | H.264 / yuv420p |
| 文件 | 151,817 字节 |
| 耗时 | 102.41 秒 |
| 推理窗口 | 4 个（32 帧窗口，22 帧步进） |
| 单帧速度 | 约 1.4 秒/帧 |

### 竖屏

| 项 | 值 |
|---|---|
| 输入 | 360×640，24fps，48 帧 |
| 输出 | **360×640**，24fps，48 帧 |
| 耗时 | 77.33 秒 |
| 推理窗口 | 3 个 |

### 灰度与比例

- 抽帧像素 `R=G=B`，确认是单通道灰度编码
- 像素范围 0–255，近白远黑
- 输出宽高比与输入一致，未裁切、未补边

## 过程中发现的问题

1. **`ffmpeg-static` 二进制损坏**：原文件 55,560,458 字节，PE 头正常但无法执行；删除后 `pnpm rebuild ffmpeg-static` 重新下载为 82,797,568 字节，恢复正常。
2. **VDA 隐式依赖**：官方 `video_depth.py` 依赖 `torchvision.transforms.Compose`；worker 用轻量 shim 替代，避免组件多带 25MB。
3. **VDA 其他依赖**：`tqdm`、`easydict`、`einops` 必须随组件安装。

## 结论

P1 的 worker 链路、比例保持、归一化、编码参数均已验证通过。CPU 性能符合方案预期：15 秒 24fps（360 帧）约需 8–9 分钟。

## 未验证

- Electron IPC 到 worker 的完整链路（需要组件安装到 userData）
- 取消是否彻底杀死 Python + ffmpeg 进程树
- Windows 中文路径
- 720P 档位的耗时与内存
