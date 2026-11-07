# 批次 1：图片编辑与全景验证

日期：2026-11-07
关联：`docs/placeholder-operations-plan.md`

## 蒙版编辑器

- 图片节点 → 更多 → 重绘，打开蒙版编辑器。
- 画笔、矩形、橡皮、笔刷大小、撤销、清空均可用。
- 涂抹后「下一步」由禁用变为可用，进入生成设置对话框。
- 截图：`shot-batch1-mask-drawn.png`、`shot-batch1-mask-next.png`（会话临时目录）。

## mask 端到端

使用本地 mock `/images/edits` 服务验证 multipart 请求：

```json
{
  "contentType": "multipart/form-data; boundary=...",
  "bytes": 283434,
  "fields": ["model", "prompt", "n", "image", "reference-0.png", "mask", "mask.png"],
  "hasMask": true,
  "maskSize": 51518
}
```

- 生成结果写入节点版本栈，版本号 3/3，无错误。
- 修复全局资产参考图未带 `scope` 导致参考图丢失的问题。
- 新增参考素材缺失时的明确错误。

## 720 全景

- 生成 2:1 测试图并加入资产库，节点预览层出现「全景查看」。
- 查看器可加载球面纹理，拖拽旋转、滚轮缩放、ESC 退出。
- 自定义资产协议补充 `corsEnabled` 与 `Access-Control-Allow-Origin`，修复纹理加载失败。

## 状态改造

- `node-operations.ts` 新增 `requires` 字段。
- 未完成入口改为具体依赖（视频编辑模型 / 视觉组件 / 视频模型），点击打开对应设置面板。
- 全仓库已无「正在接入」文案。

## 验证命令

```text
corepack pnpm typecheck  通过
corepack pnpm test       4 files / 15 tests 通过
corepack pnpm build      通过
```
