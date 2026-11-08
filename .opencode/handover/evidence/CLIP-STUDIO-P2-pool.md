# CLIP-STUDIO P2：素材池动态化

日期：2026-11-07
状态：完成
验证：CDP 实测资产库条目拖入时间线

## 交付

| 文件 | 内容 |
|---|---|
| `src/renderer/src/studio/assets.ts` | `PoolAsset`、画布节点转素材、资产库转素材、`assetToClip`、时长格式化 |
| `src/renderer/src/studio/MaterialPool.tsx` | 两个动态来源：画布素材、全局资产库；空态；拖拽传完整 JSON |
| `src/renderer/src/studio/TimelinePane.tsx` | drop 解析完整素材 JSON，不再依赖 demo 列表 |

## 数据来源

| 页签 | 来源 | 说明 |
|---|---|---|
| 画布素材 | `useCanvasStore.nodes` | 取每个节点 `selectedOutputId` 或最后一个输出；过滤组节点和非媒体输出 |
| 资产库 | `window.api.library.listAllAssets()` | 全局库全部资产，过滤模板 |
| 上传 | — | 空态，P3 接入 |

## 已验证

- 资产库页签列出全局库全部素材，包括手工放入的「真实素材-01」「真实素材-02」。
- 拖拽「真实素材-01」到 V1，片段数 7 → 9，时间线出现对应片段。
- 全局素材使用 `scope: 'global'`，渲染时走 `cinelab-asset://global/...`。

## 说明

- 画布素材页签在当前测试项目画布为空时显示空态，逻辑已接 `useCanvasStore`。
- 上传页签仍为空态，等画布上传链路接线。
- 缩略图仍是渐变占位，真实首帧缩略图依赖代理与缩略图缓存。

## 下一步

素材池已不再写死 demo。剩余：真实缩略图、上传页签、画布素材页签的端到端验证（画布有节点时）。
