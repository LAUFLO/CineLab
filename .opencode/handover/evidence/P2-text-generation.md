# P2 文本生成链路验证

- 日期：2026-11-04
- 方式：mock `/v1/chat/completions` + CDP 自动构造文本节点 + 真实点击发送

## 链路

```
文本节点（选中）
  → PromptBar 匹配 text.chat 模型
  → generate:run
  → generateText POST {baseUrl}/chat/completions
  → 解析 choices[0].message.content
  → 文本写入 assets/txt/<hash>.txt
  → GeneratedAsset.text 回传
  → 节点 data.text 更新并渲染
```

## 验证结果

| 项 | 结果 |
|---|---|
| 文本节点模型过滤 | 通过，只显示 Mock Text |
| 占位符 | 通过，文本节点专用文案 |
| 请求路径 | 通过，命中 `/v1/chat/completions` |
| 节点状态 | 通过，`status=done` |
| 文本落盘 | 通过，`assets/txt/4343a330….txt` |
| outputs | 通过，1 条，`kind=text` |
| 节点文本渲染 | 通过，DOM 显示 mock 返回内容 |

## 实现要点

- `openai-compat.ts` 新增 `generateText`，参数支持 `temperature`、`max_tokens`
- `ProviderOutput` 统一承载二进制与文本输出，`GeneratedAsset` 新增可选 `text`
- `ingestAsset` 把文本写入 `assets/txt/`，`generate.ts` 支持 `text.chat` 能力
- renderer 的 generation store 在 done 时把文本写回节点 `data.text`
- `CineNodeView` 为文本输出增加渲染分支

## 未验证

- 流式输出（当前是一次性返回）
- 多轮对话与上游文本节点作为上下文
- 真实 OpenAI / 中转站接口
