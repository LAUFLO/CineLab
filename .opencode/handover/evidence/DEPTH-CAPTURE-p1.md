# DEPTH-CAPTURE P1 · Python worker 与本地执行链路

日期：2026-11-06
方案：`docs/depth-capture-plan.md`

## 已完成

### 新增文件

| 文件 | 职责 |
|---|---|
| `resources/depth-worker/worker.py` | 读视频、VDA 推理、全片归一化、ffmpeg 编码 |
| `src/main/media/depth.ts` | 组件检查、启动 worker、进度解析、取消杀进程树、资产落盘 |

### 修改文件

| 文件 | 变更 |
|---|---|
| `src/shared/media.ts` | 新增 `DepthCaptureRequest` / `DepthCaptureResult` |
| `src/shared/ipc-contract.ts` | `MediaApi` 新增 `captureDepth` |
| `src/main/ipc/media.ts` | 新增 `media:capture-depth` |
| `src/preload/index.ts` | 暴露 `media.captureDepth` |

### worker 链路

```
worker.py
  ├─ OpenCV 按时间戳读帧并缩放到处理尺寸
  ├─ VDA Small 推理（32 帧窗口 + 22 步进）
  ├─ 全片一次归一化 → 8-bit 灰度
  └─ ffmpeg rawvideo 管道编码（CRF 12 / GOP 2s）
```

- 输入：视频路径、输出路径、长边、fps、模型短边、权重、VDA 目录、ffmpeg 路径
- 进度：stdout JSON 行
- 取消：主进程 `taskkill /PID /T /F` 杀进程树
- 限制：≤30 秒；组件未安装时直接报错

### 参数档位

| 档位 | 输出长边 | 模型短边 |
|---|---|---|
| fast | 854 | 364 |
| standard | 1280 | 518 |
| long | 854 | 364 |

## 验证

- `corepack pnpm typecheck` 通过
- IPC 已注册，preload 已暴露

## 未验证

- 真实 Python worker 端到端（需要组件包、PyTorch、VDA 权重）
- Windows 中文路径下的 OpenCV 读取
- ffmpeg 子进程取消是否彻底

## 下一步

- P2：本地任务队列、进度事件、取消
- P3：参数面板、节点集成
- P4：组件构建与端到端验证
