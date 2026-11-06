# BeefTV 深度捕捉组件调研

日期：2026-11-07
来源：https://github.com/glanderness/BeefTV

## 结论

BeefTV 使用 Go 后端 + Python runtime。runtime 自建 GitHub Release 分发，模型指向官方权重，不依赖上游现成 runtime 包。

## 组件拆分

- `depth-runtime`：Python 3.11 + PyTorch + OpenCV + FFmpeg/FFprobe + VDA 源码 + worker
- `depth-model`：VDA Small 权重，固定官方 URL + SHA256（116,440,756 字节，sha256 133793...）

runtime 按平台/设备分变体：

- Windows x64：CPU、CUDA（社区预览）
- macOS Apple Silicon：MPS

CUDA 失败自动回退 CPU 一次。

## 构建与发布

- `.github/workflows/depth-runtime-windows-check.yml`：Windows 2022，矩阵 cpu/cuda
- `uv` 固定 Python 3.11
- 固定版本：torch 2.8.0、torchvision 0.23.0、numpy 2.1.3、opencv 4.10 等
- VDA 源码固定 commit `4f5ae23`
- 打包 FFmpeg/FFprobe，构建后做路径迁移测试
- CUDA 包超过 2GB 时切分为 <2GB parts，每片独立 SHA256
- `release-depth-runtime.yml` 手动触发，发布到 GitHub Release `depth-runtime-v2`（draft → prerelease）
- manifest v2 使用 Ed25519 签名；镜像清单 `depth-runtime-mirrors-v1`，COS 主源 + R2/GitHub 备源

## 下载与安装

- 首次使用显示下载计划：下载大小、所需空间、剩余空间
- 用户确认后才下载；任务不会静默触发组件下载
- 支持暂停、续传、多源切换、镜像
- 校验 SHA256、manifest 签名、ZIP 文件数/解压大小/路径穿越
- Windows 安装使用备份 + 原子替换
- 支持离线模式和存储目录迁移
- 安装串行化，模型与 runtime 分开校验

## 推理行为

- 视频限制 15 秒
- 输出保持原比例/帧率；低于 30fps 补到 30fps
- CPU 明确提示耗时和内存占用

## 对 CineLab 的借鉴

1. 用 GitHub Actions 构建 CPU runtime，固定 Python/PyTorch/VDA commit，上传 Release
2. manifest 改为 runtime + model、parts、files、expandedSize、签名
3. 模型继续官方 HF，runtime 自建发布
4. 下载前显示空间计划，支持多源和暂停续传
5. CUDA、镜像、存储迁移后置

## CineLab 当前状态

- 模型组件已改为官方 HF + hf-mirror 备源，下载和 SHA256 校验通过
- runtime 组件默认源仍指向不存在的 `depth-components-v1` Release，点击下载 404
- 本地可通过 `CINELAB_COMPONENT_BASE_URL=http://127.0.0.1:8899` + `scripts/mock-component-server.mjs` 测试
- 下一步：新增 runtime 构建 workflow，生成 CPU runtime zip + manifest，发布 Release
