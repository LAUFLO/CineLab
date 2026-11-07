# 批次 2：本地视觉 runtime 验证

日期：2026-11-07
关联：`docs/placeholder-operations-plan.md`

## 技术路线

- 复用 `depth-runtime` 的 Python 3.11 + PyTorch 2.8 CPU 环境，不重复下载约 1GB 运行时。
- `vision-models` 组件包含：
  - RVM `rvm_mobilenetv3.pth` + model 代码（GPL-3.0）
  - LaMa `big-lama.pt`（Apache-2.0）
  - torchvision 0.23.0 CPU + Pillow（site-packages）
  - `worker.py`、NOTICE
- 组件体积：zip 213,355,635 字节，解压 240,714,601 字节，332 文件。
- SHA256：`44934097a19fc6806740aab51965c24fab52926e5a47f86c9dae731253c57803`

## worker 任务

| 任务 | 实现 | 实测 |
|---|---|---|
| `matte-image` | RVM 单图抠图 | 0.84 秒 |
| `layer-split` | RVM 前景 + LaMa 背景修复 | 6.64 秒 |
| `outpaint-image` | LaMa 扩展画布并补全 | 9.87 秒（1728×1728） |
| `matte-video` | RVM 逐帧 + VP9 alpha WebM | 5.53 秒（480P / 2 秒） |
| `repair-video` | LaMa 逐帧修复框选区域 | 73.55 秒（720P / 2 秒） |
| `inpaint-image` | LaMa 蒙版修复 | 管线已实现 |

## 应用集成

- 组件类型：`vision-models`，设置 → 组件可下载/卸载。
- 主进程：`media:vision-start` / `media:vision-cancel`，任务事件 `vision-task:event`。
- 渲染进程：`stores/vision-tasks.ts` 负责进度、失败、取消和结果回写。
- 节点操作：
  - 图层分离：创建 2 个 pending 图片节点并连线。
  - 视频抠像 / 智能去字幕 / 主体消除：创建 pending 视频节点。
  - 本地扩图 / 抠图：写入当前节点新版本。
  - 组件未安装时，抠图/扩图回退到图片模型提示词版。

## UI 实测

- 隔离实例 + 本地 mock 组件源安装 `vision-models` 成功。
- 图层分离：两个节点均显示「已完成」，输出前景 PNG 与背景 PNG。
- 视频抠像：生成 `.webm`，ffprobe 显示 `ALPHA_MODE=1`。
- 本地扩图：节点尺寸变为 1536×1536，版本 2/2。
- 本地抠图：版本 3/3，输出 PNG。
- 智能去字幕 / 主体消除：框选对话框标题正确，取消正常。

## 验证命令

```text
corepack pnpm typecheck  通过
corepack pnpm test       4 files / 15 tests 通过
corepack pnpm build      通过
```

## 未完成 / 风险

- `vision-components-v1` Release 尚未发布；发布前需确认 RVM GPL-3.0 合规。
- 视频修复 CPU 耗时较长，10 秒上限；后续可增加更快的修复模型或 GPU。
- 智能去字幕仍需手动框选，自动字幕检测未接入。
