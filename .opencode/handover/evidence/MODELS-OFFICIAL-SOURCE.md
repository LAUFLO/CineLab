# MODELS-OFFICIAL-SOURCE · 验证记录

日期：2026-11-07

## 变更

- `depth-model` 不再依赖自建 manifest
- 主源：`https://huggingface.co/depth-anything/Video-Depth-Anything-Small/resolve/main/video_depth_anything_vits.pth`
- 备源：`https://hf-mirror.com/depth-anything/Video-Depth-Anything-Small/resolve/main/video_depth_anything_vits.pth`
- 大小：116,440,756 字节
- SHA-256：`13379300b739e659f076a59d52e9801bd8d38c541a7e71f73bbca4dcfb013609`

## 验证

- 官方 HF HEAD 200，支持 Range
- hf-mirror 支持 Range（206）
- 打包应用实测下载完成，状态 `installed`，SHA-256 校验通过

## 未完成

- runtime 组件仍指向不存在的 `depth-components-v1` Release，下载 404
- runtime 需要 CI 构建并发布，或本地 mock
