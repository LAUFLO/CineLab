# 剪辑室 M3：内置剪辑助手（单轮计划）

日期：2026-11-08
状态：完成（真实模型待用户 Key 验收）

## 完成内容

- 新增 `src/shared/agent.ts`
  - `AgentProfileId` / `AgentIntent` / `AgentContext` / `AgentChatRequest` / `AgentChatResult`
  - `parseAgentPlan`：兼容纯 JSON、```json 围栏、JSON 前后带解释文字；非法 JSON 按普通回答处理
- `openai-compat.ts` 新增 `chatCompletion`
  - 支持 system + 多轮消息
  - 不改变现有单轮 `generateText`
- 新增 `src/main/agent/chat.ts`
  - 自动选择 models.json 中第一个可用的 `text.chat` 模型
  - 按 `profileId` 使用剪辑助手系统提示
  - 把时间线摘要、选中片段、轨道/标记数量注入上下文
  - 未配置模型时返回明确错误
- 新增 `agent:chat` / `agent:cancel` IPC 和 preload `window.api.agent`
- 新增 `AssistantPane`
  - 消息列表、输入框、Enter 发送、Shift+Enter 换行
  - 解析模型返回的计划
  - 依赖现有分析 IPC 生成 `TimelinePlan`
  - 方案卡片显示摘要、警告、应用/取消
  - 应用走一条 `batch`，可一次撤销
- 检查器顶部增加「属性 / 助手」页签

## 验证

- `typecheck` 通过
- `test`：19 个测试文件、117 个用例通过（新增 agent 解析 5 个）
- `build` 通过
- 未配置模型路径：发送「删掉所有静音」显示「没有可用的文本模型，请先在设置中配置 text.chat 模型」
- 本地 mock 完整链路：
  - 通过设置 API 保存一个 OpenAI 兼容 mock provider（127.0.0.1:18080）
  - 发送「删掉所有静音」→ 模型返回 JSON 计划 → 面板显示「准备删除时间线上的静音」
  - 方案卡片显示「将删除 3 段静音，共 3.1 秒，00:13 → 00:10」
  - 点击应用后 4 个片段 → 7 个片段，撤销恢复
  - 验证后删除 mock provider 并停止 mock server

## 已知限制

- 真实模型（用户实际 provider/Key）尚未端到端验证，目前只用本地 mock 和未配置路径验证
- 单轮计划，无工具循环；多轮修改和方案 diff 属于 M4
- 模型自动取第一个 `text.chat` 模型，尚无设置项选择助手模型
- 镜头/节拍意图依赖用户先选中合适的视频/音频片段
- 模型返回非 JSON 时按普通回答展示，不自动重试
