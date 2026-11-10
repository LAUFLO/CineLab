# AUDIO-TEXT-FOCUS-1 · 音频控制条、操作条层级、双击聚焦、文本上下文

日期：2026-11-10

## 1. 音频控制条回到底部

问题：音频节点的开始/暂停按钮跑到了波形上方。

修改：`AudioPlayer.tsx` 把 `.audio-node__controls` 移回 `.audio-node__wave-wrap` 之后；CSS 分隔线从 `border-bottom` 改回 `border-top`。

验证：隔离实例中 `wave.compareDocumentPosition(controls)` 为 `DOCUMENT_POSITION_FOLLOWING`，即波形在前、控制条在后；计算样式 `border-top-width: 0.571429px`、`border-bottom-width: 0px`。

## 2. 截取/变速操作条优先于提示词输入框

问题：操作条被 PromptBar 遮挡。

修改：

- `AudioActionBar` 改为 `createPortal(..., document.body)`，使用 `position: fixed`，`z-index: 60`。
- `CineNodeView` 通过 `absolutePosition` + `useViewport` 计算节点屏幕位置，作为 `anchor` 传入。
- 默认显示在节点下方；下方空间不足时翻转到节点上方，并限制在窗口内。
- PromptBar 的 `z-index` 为 50，操作条始终在其之上。

验证：音频操作条与 PromptBar 重叠时，`elementFromPoint` 命中 `audio-bar__time-input`，而不是 PromptBar；操作条 `z-index: 60`、PromptBar `z-index: 50`。

## 3. 双击任意节点放大聚焦

问题：文本节点双击不聚焦。

修改：`CineNodeView` 根元素新增 `onDoubleClick`，调用 `fitView({ nodes: [currentNode], padding: 0.6, duration: 300, maxZoom: 2 })`；移除文本内容上的 `stopPropagation`。标题双击仍然进入标题编辑，按钮/输入框/链接不触发聚焦。

验证：隔离实例中双击文本节点，viewport 从 `translate(-576.304px, -183.031px) scale(1.2732)` 变为 `translate(129.128px, -193.596px) scale(1.31383)`；双击图片节点后切换回图片节点的聚焦位置。

注意：测试时如果 Electron 窗口不可见，`fitView` 的动画不会推进，viewport 不变；窗口恢复可见后正常。这不是业务逻辑问题。

## 4. 文本节点内容作为提示词上下文

问题：文本节点连线到图片节点后，图片节点生成时没有使用文本内容；视频/音频节点同理。

修改：

- `PromptBar` 收集两类文本上下文：
  - 通过连线进入当前节点的文本节点（含组节点内部）。
  - 开启自动关联时，提示词里 `@标题` 命中的文本节点。
- 生成时把文本内容拼接到 prompt 前：

```
【参考文本：猫咪描述】
一只橘猫在雪地里奔跑，电影感，逆光，慢动作

---

<用户输入的提示词>
```

- 单个文本最多截取 4000 字符。
- 只有文本上下文、没有手写提示词时也允许发送。
- 图片、视频、音频节点共用 `handleSend`，因此同一套注入逻辑对所有生成类型生效。

验证：用本地 mock 图片服务 + 隔离实例，构造「文本节点 → 图片节点」连线，图片节点提示词留空。点击生成后，mock 服务收到的请求体为：

```json
{
  "model": "mock-image",
  "prompt": "【参考文本：猫咪描述】\n一只橘猫在雪地里奔跑，电影感，逆光，慢动作",
  "n": 1
}
```

图片节点正常生成并显示「已完成」。

## 本地检查

- `corepack pnpm typecheck` 通过
- `corepack pnpm test`：27 文件 / 162 用例通过
- `corepack pnpm build` 通过
