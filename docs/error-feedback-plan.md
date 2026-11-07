# 统一错误与任务反馈方案（P1-2）

日期：2026-11-07
状态：实施中
关联：`docs/roadmap-plan.md` P1-2

## 现状

- 生成失败只写入节点 `status: 'error'` 与红色错误条，没有全局 toast
- 错误 `message` 直接来自底层异常或 HTTP 文本，缺少统一文案
- 生成历史只聚合画布中成功的 outputs，失败任务不可见、不可重试
- 自动重试已存在（429/5xx/网络，3s/9s 两次），但最终错误未区分是否仍可重试
- 取消后节点回到 idle，无残留 running

## 目标

- 统一错误文案：Key 无效、限流、服务端错误、网络错误、参数错误
- 失败统一进 toast + 节点错误条
- 生成历史记录失败任务，并提供「重试」
- 区分可重试/不可重试，提示用户下一步动作
- 取消状态明确

## 设计

### 1. 错误事件

`GenerationEvent` 的 `error` 增加 `retryable?: boolean`。

主进程新增 `formatGenerationError(error)`：

| 原始错误 | 用户文案 | 可重试 |
|---|---|---|
| HTTP 401/403 | API Key 无效或没有权限，请在设置中检查密钥 | 否 |
| HTTP 429 | 请求过于频繁（限流），请稍后重试 | 是 |
| HTTP 404 | 模型或接口不存在，请检查模型配置 | 否 |
| HTTP 5xx | 模型服务暂时不可用，请稍后重试 | 是 |
| 网络类错误 | 网络连接失败，请检查网络或代理后重试 | 是 |
| 参数/内容错误 | 保留原始信息（截断） | 否 |

`retryable` 沿用 `isRetryable()`。

### 2. 渲染进程反馈

- `generation` store 收到 `error`：
  - 节点仍写 `status: 'error'` 和文案
  - 全局 toast：可重试时「生成失败：xxx（可重试）」，否则「生成失败：xxx」
- 生成历史新增失败记录（渲染进程 store + localStorage，最多 50 条）：
  - 字段：runId、nodeId、标题、modelKey、prompt、params、refs、status、error、retryable、createdAt
  - 成功/失败/取消都更新状态
- 历史面板合并画布输出与失败记录：
  - 失败行显示标题、错误原因、时间、「重试」
  - 重试调用 `generation.run`，使用保存的请求参数
  - 原节点已删除时提示无法重试

### 3. 取消

保持现有行为：节点回到 idle，历史记录标记 cancelled。

## 验收

- 生成失败时同时出现节点错误条与全局 toast
- 错误文案可操作，不再直接显示 `fetch failed`
- 可重试错误在 toast 和历史中标注
- 历史面板能看到失败任务并一键重试
- 取消后无残留 running
