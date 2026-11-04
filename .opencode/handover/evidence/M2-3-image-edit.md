# M2-3 图生图链路验证

- 日期：2026-11-04
- 方式：mock `/v1/images/edits` + CDP 自动构造画布 + 真实点击发送

## 链路

```
图片节点（参考图）→ 连线到图片节点（目标）
  → PromptBar 收集 refs（素材 1）
  → generate:run
  → 主进程 loadRefs 读取 assets/img/mock-ref.png 为 data URL
  → generateImage 走 multipart POST {baseUrl}/images/edits
  → mock 返回 b64_json
  → sha256 落盘 + 缩略图
  → IPC done
  → 目标节点 status=done、outputs=1
```

## 验证结果

| 项 | 结果 |
|---|---|
| 下游引用计数 | 通过，PromptBar 显示「素材 1」 |
| 模型选择 | 通过，显示 Mock Image |
| 请求路径 | 通过，命中 `/v1/images/edits` |
| 请求格式 | 通过，`multipart/form-data` |
| 表单字段 | 通过，`model / prompt / n / size / image` |
| 文件名 | 通过，`reference-0.png` |
| 节点状态 | 通过，`status=done`、`outputs=1` |
| 版本选中 | 通过，`selectedOutputId` 写入新资产 |

## 实现要点

- `openai-compat.ts` 新增 `ReferenceImage`、`parseDataUrl`、`parseImageResponse`
- 有 refs 时走 `/images/edits`，无 refs 时保持原 `/images/generations`
- 单图用 `image` 字段，多图用 `image[]`，兼容 OpenAI 官方与部分中转站
- `generate.ts` 图片分支把 `loadRefs` 结果传给 `generateImage`
- `PromptBar` 的 refs 改为优先取上游 `selectedOutputId`，找不到再回退 `outputs[0]`

## 未验证

- 第三方中转站的 `/images/edits` 兼容性
- 多图 `image[]` 的实际注入
- DALL·E 3 等不支持 edits 的模型会返回接口错误，目前没有前置提示
