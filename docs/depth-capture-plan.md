# 深度动作捕捉 · 方案

> 状态：方案已确认，待排期
> 日期：2026-11-06
> 用途：实现依据与后续接续；方案变更必须先改本文件再改代码
> 关联：`docs/node-toolbar-plan.md`（工具栏入口）、`docs/architecture.md`（主进程分层）

---

## 0. 一句话结论

用 **Video Depth Anything Small（VDA-S）** 做本地视频转灰度深度视频，以 **Python sidecar 组件按需下载** 的方式接入，输出比例跟随输入视频，编码参数对齐控制信号需求。

---

## 1. 需求定义

### 1.1 功能目标

把一段普通视频转换成「近白远黑」的灰度深度参考视频，作为下游视频生成模型（Seedance、可灵、MiniMax H3 等）的动作与运镜控制信号。

保留：人物轮廓、站位、前后距离、动作时序、镜头运动、场景空间层次。

丢弃：人脸、服装、颜色、材质、光影风格。

### 1.2 明确的边界

| 项 | 定义 |
|---|---|
| 输出形态 | 8-bit 灰度 H.264 MP4，无音轨 |
| 比例 | **输出宽高比 = 输入宽高比**，不裁切、不变形、不补黑边 |
| 时长 | 快速/标准档 ≤15 秒；长片档 ≤30 秒 |
| 分辨率 | 快速档长边 854，标准档长边 1280 |
| 帧率 | 跟随源，或按下游预设固定 24fps |
| 本地性 | 全程离线，视频不出本机 |
| 模型 | 仅 VDA Small（Apache-2.0，可商用） |

### 1.3 非目标

- 不做真 3D 白模渲染（clay render）
- 不做姿态骨架（pose）和线稿（canny）
- 不做云端推理
- 不做 Base / Large（CC-BY-NC，不可商用）
- 不做长视频（>30 秒）

---

## 2. 技术选型与依据

### 2.1 为什么是 VDA 而不是 DAv2

| | DAv2 | VDA |
|---|---|---|
| 类型 | 单帧深度 | 视频深度 |
| 尺度 | 每帧独立归一化 | 全片共享 scale/shift |
| 时序 | 会闪烁，需后处理 | 原生一致 |
| 长视频 | 逐帧拼接，越久越抖 | 支持数分钟 |
| 代价 | 轻 | 重 |

结论：既然确定要「接近 LibTV 的时序稳定性」，就必须用 VDA。DAv2 加 EMA 只能到七八成。

### 2.2 为什么是 Small

- VDA 只有 Small 是 Apache-2.0
- Base（113.1M）和 Large（381.8M）是 CC-BY-NC-4.0，不可商用
- Small 28.4M 参数，CPU 可跑

### 2.3 为什么是 Python sidecar

| 路线 | 任意比例 | 体积 | 风险 | 结论 |
|---|---|---|---|---|
| **Python sidecar** | 原生支持 | 运行时 235MB + 模型 111MB | 低 | **主方案** |
| 动态 ONNX | 需改造 | 模型 111MB | 高 | 后续优化 |
| 固定 ONNX | 不支持竖屏 | 111MB | 中 | 排除 |
| ExecuTorch | 理论支持 | 约 150MB | 很高 | 暂不考虑 |

关键依据：VDA 官方 `infer_video_depth` 本身就是动态 H/W，按原比例计算输入尺寸，输出再插值回原分辨率。Python 路线不需要为比例做任何妥协。

---

## 3. 方案对比：三个同类产品

| | LibTV（推断） | BeefTV | ReShot | CineLab（本方案） |
|---|---|---|---|---|
| 模型 | VDA 类 | VDA Small | VDA Small | VDA Small |
| 推理 | 云端 GPU | 官方 PyTorch | 官方 PyTorch | 官方 PyTorch |
| 分发 | SaaS | 内置 Python 运行时 956MB | pip 包 | 组件 235MB + 模型 111MB |
| 限制 | 480P 3 分钟 / 720P 30 秒 | 15.1 秒 | 按内存拒绝 | 15 秒 / 30 秒 |
| 归一化 | 未知 | 2%/98%，gamma 1.25 | 全片一次 | 全片一次 |
| 编码 | 未知 | CRF 18 | CRF 12 | CRF 12 |
| GPU | 云端 | CUDA/MPS | CUDA/MPS/CPU | 首版 CPU，后续 ONNX |

> LibTV 一列为基于公开实测与产品特征的推断，非官方披露。

---

## 4. 组件设计

### 4.1 拆成两个组件

| 组件 | 内容 | 体积（解压后） | 更新节奏 |
|---|---|---|---|
| `depth-runtime` | Python embeddable、PyTorch CPU、numpy、OpenCV、VDA 代码、worker | 解压约 857MB / 压缩约 260MB | 跟代码/依赖 |
| `depth-model-vda-small` | `video_depth_anything_vits.pth` | 116MB | 跟模型版本 |

拆分理由：模型可独立换；代码更新不重下模型；用户可只删模型。

### 4.2 安装位置

```
userData/components/
  ├─ depth-runtime/
  │   ├─ python/python.exe
  │   ├─ site-packages/...
  │   ├─ worker.py
  │   └─ manifest.json
  └─ depth-model-vda-small/
      ├─ video_depth_anything_vits.pth
      └─ manifest.json
```

打包态不进入 asar；组件全部在用户数据目录，不随安装包分发。

### 4.3 manifest 字段

```json
{
  "version": 1,
  "kind": "runtime" | "model",
  "platform": "win32-x64",
  "size": 246000000,
  "expandedSize": 235000000,
  "sha256": "...",
  "urls": ["https://...", "https://..."],
  "files": 1200
}
```

校验：

- 整包 sha256
- 解压后逐文件校验可选（首版只校验整包）
- 清单版本号只增不减；降级需开发者选项

### 4.4 下载规则

| 项 | 规则 |
|---|---|
| 多源 | 主源失败切备源；连续 30 秒无数据切换 |
| 续传 | HTTP Range，保留 `.part` |
| 暂停 | 保留断点，重启后显示「已暂停」 |
| 取消 | 删除临时文件 |
| 磁盘检查 | 可用空间 ≥ 解压体积 × 1.2 |
| 失败提示 | 保留最后 20 行错误，不只显示进度 |
| 代理 | 复用系统代理设置 |

### 4.5 组件状态

```
not-installed → downloading → verifying → installed → (error | paused)
```

主进程维护状态机，渲染进程只读展示。

---

## 5. 推理链路

### 5.1 数据流

```
输入视频
  ↓ 主进程 ffprobe：宽高、fps、时长
  ↓ 主进程计算输出尺寸：保持比例，长边限制 854/1280
  ↓ 主进程启动 Python worker，传参：输入、输出、尺寸、fps、ffmpeg 路径
  ↓ worker 内：OpenCV 按时间戳抽帧并缩放到处理尺寸
  ↓ worker 内：VDA 推理（32 帧窗口 + 22 步进 + 10 重叠）
  ↓ worker 内：全片归一化 → 8-bit 灰度
  ↓ worker 内：调 ffmpeg rawvideo 管道编码（CRF 12 / GOP 2s）
  ↓ 主进程收进度、校验输出、建新节点
```

### 5.2 为什么由 Python 读视频

最初设计是「主进程 ffmpeg 抽帧 → Python 读图片 → 主进程 ffmpeg 编码」，想省掉 Python 的 OpenCV 依赖。但这个理由不成立：

- VDA 的 `video_depth.py` 和 `util/transform.py` 本身就 `import cv2`
- 官方 requirements 已包含 `opencv-python`
- 组件无论如何都要带 OpenCV

所以改为 Python 自包含链路，与 BeefTV、ReShot 一致：

| | ffmpeg 抽帧 | Python 自包含 |
|---|---|---|
| 中间文件 | 大量 PNG/JPG | 无 |
| 编解码次数 | 2 次（有损） | 1 次 |
| 磁盘 IO | 高 | 低 |
| 进程管理 | 简单 | 需要管 ffmpeg 子进程 |
| 速度 | 慢 | 快 |

代价是组件增加约 40MB（OpenCV），换来链路简单和速度提升。

### 5.3 worker 接口

```
python.exe worker.py \
  --input <video> \
  --output <mp4> \
  --long-edge 854 \
  --fps 24 \
  --input-size 364 \
  --checkpoint <components>/depth-model-vda-small/video_depth_anything_vits.pth \
  --vda-dir <components>/depth-runtime/video_depth_anything \
  --ffmpeg <ffmpeg.exe> \
  --progress-json
```

worker 内完成读帧、推理、归一化、编码；主进程只传参与收进度。

### 5.4 进度协议

stdout 每行一个 JSON：

```json
{"stage":"read","percent":10}
{"stage":"infer","percent":15,"message":"分析中"}
{"stage":"normalize","percent":82}
{"stage":"encode","percent":90}
{"stage":"done","frames":360}
```

VDA 的 `infer_video_depth` 内部按窗口循环，首版只按阶段上报，不细分窗口。

stderr 只放错误；主进程保留末尾 20 行。

### 5.5 取消

- 主进程向 worker stdin 写 `cancel`，worker 终止 ffmpeg 子进程并退出
- 5 秒未退出则 `taskkill /PID /T /F`（同时杀 worker 和 ffmpeg）
- 启动时清理孤儿 worker 进程

### 5.6 内存预算

- 主进程启动 worker 前按 `2.0 GiB + 20 B × 帧数 × 处理像素` 估算
- 超过物理内存 50% 直接拒绝，并提示最大可处理帧数
- 15 秒 24fps @ 518×924 约需 690MB 深度缓冲
- worker 内再按实际读到的帧数校验一次，超限退出

---

## 6. 参数与产品约束

### 6.1 档位

| 档位 | 输出长边 | 模型短边 | 时长上限 | 预计耗时（4 核 CPU） |
|---|---|---|---|---|
| 快速 | 854 | 364 | 15 秒 | 4–5 分钟 |
| 标准 | 1280 | 518 | 15 秒 | 8–10 分钟 |
| 长片 | 854 | 364 | 30 秒 | 8–10 分钟 |

### 6.2 默认值

- 档位：快速
- 帧率：跟随源；若下游预设为 Seedance/H3，固定 24fps
- 时长：截取当前视频前 15 秒，可手动改起止点

### 6.3 编码参数

| 参数 | 值 | 依据 |
|---|---|---|
| 编码器 | libx264 | 兼容性 |
| CRF | 12 | 深度是大面积平滑梯度，低 CRF 防 banding |
| preset | slow | 离线任务，不赶时间 |
| pix_fmt | yuv420p | 兼容性 |
| GOP | 2 秒 | 下游可任意切 |
| movflags | +faststart | 预览快 |
| 音轨 | `-an` | 控制信号不需要声音 |

### 6.4 归一化

- 全片一次统计，逐帧映射
- 默认 `clip_percent=0`、`gamma=1.0`、`invert=false`
- 近白远黑
- 不做逐帧归一化

---

## 7. 节点与数据模型

### 7.1 入口

```
视频节点工具栏 → 深度动作捕捉（一级第一个按钮）
```

`node-operations.ts` 的 `motion-capture` 已标记为本地执行器并置顶。

### 7.2 参数面板

- 档位（快速/标准/长片）
- 帧率（跟随源 / 24fps）
- 起止时间
- 预计耗时
- 组件状态与下载入口

### 7.3 结果

- 新建视频节点，标题「深度动作捕捉」
- 自动建立 `源视频 → 新节点` 连线
- `OutputRef` 增加 `op: 'depth-capture'` 和 `parentOutputId`
- 节点 `data` 可加 `depthCapture: true` 供后续识别

### 7.4 任务队列

- 新增 `localTasks` store，不复用模型生成队列
- 但复用同一套 toast / 进度 / 取消 UI 组件
- 任务状态写入项目 `.cinelab/tasks/`，崩溃后可恢复

### 7.5 组件管理 UI

设置 → 组件（通用入口，后续其他本地能力也走这里）：

- 组件使用全称与详细简介，说明用途和影响的功能
- 已安装显示「卸载」，二次确认中说明卸载后哪些功能不可用
- 未安装时，点击节点上的「深度动作捕捉」会提示并引导到设置 → 组件
- 组件卡片显示版本、体积、下载进度和错误

---

## 8. 工作量与分期

| 阶段 | 内容 | 工期 |
|---|---|---|
| P0 | 组件下载器、manifest、校验、续传、删除 | 3 天 |
| P1 | Python worker、ffmpeg 抽帧/编码链路 | 3 天 |
| P2 | IPC、本地任务队列、进度、取消 | 2 天 |
| P3 | 参数面板、节点集成、自动连线 | 2 天 |
| P4 | 打包、下载源、Windows 路径与中文验证 | 2 天 |
| 合计 | | 约 2 周 |

---

## 9. 风险与缓解

| 风险 | 影响 | 缓解 |
|---|---|---|
| PyTorch CPU 200MB 下载慢 | 首次体验差 | 显示进度和剩余时间；支持后台下载 |
| Windows 中文路径 | worker 读不到文件 | 全链路 UTF-8；`sys.stdout.reconfigure` |
| 长视频内存溢出 | 任务崩溃 | 预算检查 + 时长上限 |
| 组件下载失败 | 功能不可用 | 多源 + 续传 + 明确错误 |
| Python 进程残留 | 占内存 | 启动清理 + 取消杀进程树 |
| 模型许可 | 商用风险 | 只用 Small；UI 标注许可 |
| CPU 太慢 | 用户流失 | 默认快速档；显示预计耗时；后续 ONNX/GPU |
| 企业加密软件加密 `site-packages` 文本 | torch 导入失败 | 构建时删除 `*.dist-info`；运行时不需要 pip 元数据 |

---

## 10. 后续优化：动态 ONNX

目标：把 Python 运行时（235MB）换成 onnxruntime-node（40–60MB），首次下载降到 111MB。

需要改造 VDA 代码 5 处：

1. `patch_h/patch_w` 改为动态获取
2. `F.interpolate` 用动态尺寸
3. `micro_batch_size` 设大，避免切片分支
4. 去掉 `autocast`
5. 用 TypeScript 重写窗口对齐（`compute_scale_and_shift`、插值融合、22 帧步进）

风险：官方 issue #22 无解，无公开成功案例；动态 reshape 可能触发低效 kernel。

架构预留：执行器抽象为 `DepthExecutor` 接口，`PythonExecutor` 和 `OnnxExecutor` 可替换，上层不感知。

---

## 11. 验收标准

- [ ] 16:9、9:16、1:1、21:9 四种输入，输出比例与输入一致
- [ ] 15 秒 24fps 视频，快速档 5 分钟内完成
- [ ] 深度视频近白远黑，静态墙面不闪烁
- [ ] 组件下载支持暂停、续传、取消、删除
- [ ] 组件未安装时，点击功能给出明确下载提示
- [ ] 取消任务后无 Python 残留进程
- [ ] 中文路径、空格路径可正常运行
- [ ] 旧项目打开不报错，无组件时功能禁用而非崩溃

---

## 12. 参考与许可

| 项目 | 用途 | 许可 |
|---|---|---|
| [Video Depth Anything](https://github.com/DepthAnything/Video-Depth-Anything) | 推理模型与代码 | Apache-2.0（Small） |
| [ReShot](https://github.com/maosika-ai/reshot) | 工程参数参考：窗口、归一化、编码、预设 | Apache-2.0 |
| [BeefTV](https://github.com/glanderness/BeefTV) | 组件分发参考：拆分、校验、续传、回退 | Source-available（仅参考思路） |
| [Depth Video Studio](https://github.com/BeatAPI/depth-video-studio) | WebGPU 路线的性能参考 | MIT |
| LibTV | 产品形态参考 | 商业 SaaS（仅参考产品行为） |

不复制上述项目的代码；仅参考其公开的工程决策与参数。

---

## 13. 变更记录

| 日期 | 变更 |
|---|---|
| 2026-11-06 | 初版：确定 VDA Small + Python sidecar + 组件按需下载；明确输出比例跟随输入；记录方案对比、组件设计、推理链路、分期与风险 |
| 2026-11-06 | 修正推理链路：改为 Python 自包含读视频 + ffmpeg 编码，去掉 ffmpeg 抽帧；组件增加 OpenCV，体积约 275MB |
| 2026-11-06 | P4 实测：runtime 压缩 260MB / 解压 857MB；修复 `--vda-dir` 与 `dist-info` 加密问题；IPC 端到端通过 |
