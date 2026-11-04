# M2-5 版本栈与自动重试验证

- 日期：2026-11-04
- 方式：mock OpenAI + CDP 操作 + DOM 核对

## 版本栈

| 项 | 结果 |
|---|---|
| 同一节点第二次生成 | 通过，`outputs` 累积到 2 条 |
| 版本控件出现条件 | 通过，`outputs > 1` 时显示 |
| 默认选中 | 通过，默认最新（`2/2`） |
| 切到更早版本 | 通过，点击 ◀ 后 `1/2` |
| 边界禁用 | 通过，最旧时 ◀ 禁用、最新时 ▶ 禁用 |
| 选中态持久化 | 通过，`selectedOutputId` 写入节点数据 |

## 自动重试

实现在 `src/main/providers/retry.ts`：

- 可重试：HTTP 429、HTTP 5xx、ECONNRESET / ETIMEDOUT / ENOTFOUND / fetch failed
- 不可重试：4xx（除 429）、参数错误、鉴权失败
- 退避：3s、9s，最多 2 次
- 重试时通过 `onProgress(0, "第 N 次重试…")` 回传提示
- 取消时中断等待中的 sleep

## 未验证

- 真实 429 / 5xx 场景（mock 未模拟）
- 重试耗时的 UI 展示（仅有文案，没有独立倒计时）
