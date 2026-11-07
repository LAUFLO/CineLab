# P1-2 统一错误与任务反馈

日期：2026-11-07
状态：已完成

## 实现

### 错误事件

- `GenerationEvent` 的 error 增加 `retryable?: boolean`
- `src/main/ipc/generate.ts` 新增 `formatGenerationError`：
  - 401/403 → API Key 无效或没有权限
  - 429 → 请求过于频繁（限流），可重试
  - 404 → 模型或接口不存在
  - 5xx → 模型服务暂时不可用，可重试
  - 网络错误 → 网络连接失败，请检查网络或代理
  - 其他错误截断到 160 字符
- error 广播带 `retryable`（沿用 `isRetryable`）

### 渲染进程

- error 事件：节点错误条 + 全局 toast（可重试时追加「（可重试）」）
- 新增 `stores/generation-history.ts`：
  - 记录 nodeId、runId、标题、请求参数、状态、错误、可重试、时间
  - localStorage 持久化，最多 50 条
  - 同一节点只保留最近一次任务
- `HistoryPanel` 合并失败/取消记录：
  - 红色错误缩略图、错误文案、时间、可重试标记
  - 「重试」按钮常驻显示，使用保存的请求参数重新生成
  - 原节点已删除时提示无法重试

## 验证

- mock provider 生成成功：节点「已完成」
- Base URL 改为不可达端口：节点显示「网络连接失败，请检查网络或代理后重试」
- 生成历史显示失败记录与「可重试」
- 恢复 Base URL 后点击「重试」：生成成功，节点版本 4/4
- `corepack pnpm typecheck` 通过

## 相关提交

- `docs/error-feedback-plan.md`
- `src/shared/generation.ts`、`src/main/ipc/generate.ts`
- `src/renderer/src/stores/generation.ts`、`generation-history.ts`
- `src/renderer/src/panels/HistoryPanel.tsx`
