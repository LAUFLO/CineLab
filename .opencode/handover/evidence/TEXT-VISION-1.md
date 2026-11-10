# TEXT-VISION-1 · 文本节点引用图片传给多模态模型

日期：2026-11-10

## 问题

文本节点通过连线或 `@图片节点` 引用图片时，模型回复"没有接收到图片"。

## 根因

`generate:run` 已经加载了参考图并传给图片/视频生成器，但文本分支调用 `generateText(model, runtime, prompt, params, context)` 时没有传 `refs`，请求体始终是纯文本 `content: prompt`。

## 修改

`generateText` 增加 `refs` 参数：

- 无参考图：保持原来的字符串 `content`。
- 有参考图：改为 OpenAI 多模态格式：

```json
{
  "role": "user",
  "content": [
    { "type": "text", "text": "..." },
    { "type": "image_url", "image_url": { "url": "data:image/jpeg;base64,..." } }
  ]
}
```

`generate:run` 的文本分支同步传入 `refs`。

顺带修正错误文案：模型没有勾选图片输入时，从「该模型不支持图生图」改为「该模型不支持图片输入，请在设置 → 模型 → 输入能力中勾选「图片」」。

## 验证

用本地 mock chat 服务 + 隔离实例：

- 配置 `text.chat` 模型，`inputs: ["text", "image"]`。
- 调用 `window.api.generate.run`，传一张项目内 JPEG 作为 ref。
- mock 服务收到的请求体包含：
  - `content` 数组
  - `type: "text"`
  - `type: "image_url"`，`url: "data:image/jpeg;base64,..."`

`typecheck`、27 文件 / 162 用例、`build` 通过。
