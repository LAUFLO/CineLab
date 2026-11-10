# AGENT-UI-REFINE-1 · CineBot UI 精修、上下文与多能力模型

日期：2026-11-10
状态：完成
范围：面板布局、会话删除、权限/技能浮窗、多能力模型、@ 引用、/ 技能、上下文圆环与手动压缩、会话历史
关联：`AGENT-UI-2`、`AGENT-CINEBOT-1`、`AGENT-ASSET-REFS-1`

## 1. 布局与交互

- CineBot 面板底边与底部工具栏底边对齐，实测均为 `bottom = 772px`。
- 发送/停止按钮 34px → 30px，图标 14px。
- 权限浮窗改为以权限 chip 为锚点、按钮上方居中；实测菜单中心与 chip 中心一致。
- 技能浮窗从顶部大浮层改为技能按钮上方展开；实测在按钮上方且居中。
- 删除头部重复的模型设置按钮，模型选择统一从底部模型 chip 进入。
- 会话列表增加删除按钮：
  - 删除会话 JSONL 和该会话的生成提案。
  - 删除当前会话后自动切到下一个，或新建空对话。
  - 删除前走通用确认对话框。

## 2. 多能力模型选择

模型选择拆成四组：

| 能力 | 用途 |
|---|---|
| 文本对话 | CineBot 对话和工具调用 |
| 生图 | CineBot 登记图片生成 |
| 生视频 | CineBot 登记视频生成 |
| 音频 | CineBot 登记音频生成 |

- 四类选择独立持久化。
- `generation_catalog` 会返回并标记当前选中的模型。
- `generation_propose` 按目标节点类型读取 `scope.generationModels` 覆盖模型。
- 验证：mock 故意传入文本模型，图片目标提案最终模型为 `Agnes Image 2.5 Flash`；视频目标提案最终模型为 `Agnes Video 2.5 Flash`。

## 3. @ 引用与 / 技能

- 输入 `@` 弹出素材引用浮窗：
  - 画布素材：有图片/视频/音频输出的节点。
  - 资产库素材：全局库图片/视频/音频。
  - 选择后生成 `@素材名` 引用 chip。
  - 引用随 `agent:chat.references` 传给主进程，写入系统提示。
  - 支持 ArrowUp / ArrowDown / Enter / Escape。
- 输入 `/` 打开技能选择浮窗：
  - 使用按钮上方的同一个技能浮窗。
  - 选择后移除 `/` token，并插入「使用技能：名称」。
  - 技能搜索框支持 ArrowUp / ArrowDown / Enter / Escape。

## 4. 上下文圆环与手动压缩

### 4.1 圆环

- 位于发送按钮左侧，30×30。
- 显示估算上下文百分比。
- 悬停提示：`对话上下文约 X / 32K tokens；点击手动压缩`。
- 80% 以上变为警告色。

### 4.2 压缩

- 点击圆环弹出确认：
  - 显示当前估算 token 和将压缩的消息数。
  - 确认后调用 `agent:session-compact`。
- 主进程：
  - 保留最近 6 条 user/assistant 消息。
  - 更早消息交给当前文本模型生成摘要。
  - 摘要写入 session JSONL 的 `summary` 条目：`content + coveredMessages`。
  - 摘要为空、请求失败或超时（90 秒）不落盘。
- 运行时：
  - 构建历史时跳过 `coveredMessages` 之前的对话。
  - 把摘要作为系统消息注入。
  - 工具消息不进入历史。
- UI：
  - 压缩后保留原始消息展示，但圆环按摘要 + 最近消息重新计算。
  - 切换会话会重新读取该会话的 summary。

### 4.3 验证

- 108 条消息的会话：圆环 3%，压缩覆盖 44 条，圆环降到 0%。
- 30 条消息的会话：确认框显示「压缩 24 条对话」，确认后 summary 覆盖 24 条。
- 会话历史确实进入模型请求：mock 最初误用第一条历史用户消息触发旧工具，修正为最后一条用户消息后恢复正常，证明历史已被发送。

## 5. 自动化

```text
37 test files, 258 tests passed
typecheck 通过
build 通过，主进程约 527KB
```

新增 `compact.test.ts`：

- 10 条对话压缩后覆盖 4 条，保留最近 6 条。
- 再次压缩覆盖到 8 条。
- 只有最近消息时不调用模型、不写 summary。
- 摘要请求包含 system 提示和旧对话，不含最近消息。

## 6. 截图

- `.opencode/handover/evidence/AGENT-UI-REFINE-PERM-1.png`
- `.opencode/handover/evidence/AGENT-UI-REFINE-SKILL-1.png`
- `.opencode/handover/evidence/AGENT-UI-REFINE-MODELS-1.png`
- `.opencode/handover/evidence/AGENT-UI-REFINE-MENTION-1.png`
- `.opencode/handover/evidence/AGENT-UI-REFINE-SLASH-1.png`
- `.opencode/handover/evidence/AGENT-CONTEXT-RING-1.png`
- `.opencode/handover/evidence/AGENT-CONTEXT-COMPACT-1.png`
- `.opencode/handover/evidence/AGENT-CONTEXT-COMPACT-2.png`
- `.opencode/handover/evidence/AGENT-CONTEXT-MODEL-1.png`

## 7. 已知限制

- 上下文预算固定 32K tokens，按 3 字符 ≈ 1 token 估算；不是模型真实 tokenizer，也不是模型真实 contextWindow。
- 圆环只统计 user/assistant 对话和摘要，不包含系统提示、技能正文、工具 schema、工具结果。
- 压缩固定保留最近 6 条消息，没有按 token 切点；未实现 `firstKeptEntryId`。
- 摘要请求可能受文本模型 503 影响，失败不会破坏原会话。
- 模型 chip 仍显示文本模型名；生图/生视频/音频模型需打开选择器查看。
- 音频组当前测试环境没有配置音频模型，只显示「自动选择」。
- `@` 弹窗最多加载 80 条素材，不显示缩略图；未按类型筛选。
- 删除会话不可撤销，只做二次确认。

## 8. 关键文件

- `src/main/agent/compact.ts`
- `src/main/agent/session.ts`
- `src/main/agent/runtime.ts`
- `src/main/agent/model.ts`
- `src/main/agent/main-tools.ts`
- `src/main/ipc/agent.ts`
- `src/renderer/src/agent/AgentPanel.tsx`
- `src/renderer/src/agent/agentStore.ts`
- `src/renderer/src/agent/canvasBridge.ts`
- `src/renderer/src/styles/agent.css`
- `src/shared/agent.ts`
- `src/shared/ipc-contract.ts`
- `docs/agent-architecture-plan.md`
