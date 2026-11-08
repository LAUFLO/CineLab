# AGENT-PROPOSAL-1 · 生成提案 propose / submit

日期：2026-11-08
状态：完成
范围：`generation_catalog`、`generation_propose`、提案卡、用户确认提交、幂等与失效
关联：`docs/agent-generation-proposal-plan.md`、`AGENT-TOOLS-1`

## 1. 目标

Agent 不能在对话中直接发起付费生成。生成必须两段式：

```text
generation_propose  → 只登记本地提案，不请求模型
用户点击「确认生成」 → 提交到现有 generationQueue
```

## 2. 实现

### 2.1 数据与纯函数

- `src/shared/agent.ts`：`AgentProposal`、`AgentProposalDraft`、`AgentProposalStatus`、`AgentCostEstimate`，`AgentEvent` 新增 `proposal`，`AgentTurn` 新增 `proposalIds`。
- `src/shared/agent-proposal.ts`：
  - `normalizeGenerationParams`：按模型参数定义补齐默认值、校验枚举/范围/类型、拒绝未声明参数。
  - `proposalCount`：图片模型读取 `n`，视频/音频固定 1。
  - `estimateProposalCost`：支持 request / image / second / 1k-tokens；视频时长兼容 `duration` 与 `seconds`。
  - 过期判定与状态标签。
- `-provider-schema.ts` / `models-file.ts`：模型新增可选 `pricing`。

### 2.2 主进程

- 新增 `src/main/engine/start-generation.ts`：把原 `generate:run` 执行体抽出，普通生成与提案提交共用。
- 新增 `src/main/agent/proposals.ts`：
  - 提案写入 `<project>/.cinelab/agent/proposals/<id>.json`，原子写。
  - 创建时校验目标节点 scope（IPC 层）、供应商 Key、模型、参数、参考素材路径与数量。
  - 新回合开始时同 session 的 pending 提案全部 `expired`。
  - 提交状态机：`pending → submitting → submitted → completed/failed/cancelled`。
  - 幂等：同一提案重复提交返回原 `runId`，不再入队；已提交且失败的提案禁止重复购买。
  - `runId` 索引回写生成事件。
- `agent/tools.ts`：新增 `generation_catalog`（主进程只读）与 `generation_propose`（渲染进程写）。
- `agent/main-tools.ts`：`generation_catalog` 列出有 Key 的生成模型、能力、输入、参数、单价。
- `agent/runtime.ts`：回合开始使旧提案失效；记录 `proposalIds`；系统提示要求先登记提案并提示用户确认。
- `ipc/generate.ts`：队列事件同步提案状态。
- `ipc/agent.ts`：新增提案 IPC 与 `proposal` 事件广播。

### 2.3 渲染与设置

- `canvasBridge.ts`：执行 `generation_propose`，解析显式参考节点或直接上游输出；图片角色按 firstFrame / lastFrame / reference 分配，视频单独作为 `video` 输入。
- `agentStore.ts`：提案状态、恢复、提交、取消；提交前检查目标节点仍在画布。
- `AgentPanel.tsx` / `agent.css`：提案卡展示节点、模型、参数、数量、预估费用、提示词和状态。
- `ModelPricingDialog.tsx` + `SettingsPanel.tsx`：模型列表新增「配置计费」，支持币种、单位、单价、备注与清除。
- `Icon.tsx`：新增 `wallet` 图标。

### 2.4 安全边界

- `generation_submit` 不注册给模型，只能由用户点击提案卡触发。
- 目标节点必须在当前 turn 的 scope；IPC 层再次校验。
- 参考素材必须是相对路径，拒绝 `..`、绝对路径和盘符。
- 提案不接受蒙版与视频编辑操作，避免复用到未验证的参数。
- 提案文件不保存 API Key 或请求头。

## 3. 验证

### 3.1 单元测试

```text
29 test files, 191 tests passed
```

覆盖：

- 参数默认值、布尔字符串、未知参数、枚举、数值范围。
- 图片/视频/音频数量。
- 按次、按张、按秒（duration / seconds）、按 token 无法预估。
- 过期时间与状态标签。
- 提案创建、缺失 Key、未知参数、过期、会话失效。
- 提交幂等、提交失败可重试、已提交失败禁止重复购买、run 状态回写、取消。

### 3.2 真实 Agnes 端到端

测试配置：Agnes 3.0 Flash 文本、Agnes Image 2.5 Flash 图片；测试模型配置添加了 `pricing`（仓库外）。

流程：

```text
generation_catalog → 返回 agnes/agnes-image-2.5-flash 等模型
canvas_add_node（图片节点「提案测试」）
generation_propose → proposal-55e716c1...
```

提案卡显示：

```text
生成提案 / 待确认
节点：提案测试
模型：Agnes Image 2.5 Flash
参数：size=2K · ratio=1:1
数量：1
预估费用：¥0.2 CNY
[确认生成] [取消]
```

确认后：

```text
状态：已提交 → 已完成
节点「提案测试」状态：已完成
提案文件 status=completed，runId=377b7048...
```

幂等：

```text
连续两次 proposalSubmit
→ 返回同一 runId 377b7048...
→ 状态 completed
```

失效：

```text
写入一个 pending 提案 → 打开面板显示待确认
→ 发送新消息「你好」
→ 卡片立即变为「已失效」，确认按钮消失
```

### 3.3 构建

- `typecheck` 通过
- `test` 通过：29 文件、191 用例
- `build` 通过，主进程约 436KB

## 4. 已知限制

- 提案参数来自 Agent 调用时显式传入的 `params`，不读取 Prompt Bar 的临时编辑状态。
- `generation_propose` 暂不支持蒙版编辑和视频重拍/续写。
- 重启后 `submitting` 提案会转为 `failed`；已记录 `runId` 的提案禁止重复提交，需要新建提案。
- Agnes 文本模型在测试期间偶发 `503 queue full`，不影响提案工具本身。
- 设置计费弹窗只写入 `models.json`，不校验真实价格。

## 5. 下一步

1. `StageCommand` 骨架。
2. 剪辑助手 `clip` profile 重建。
3. 技能管理 UI。
4. 删除 / 批量操作二次确认。
5. Agnes 视频队列恢复后补测视频提案。
