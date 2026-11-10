# AGENT-NODE-OPERATIONS-PHASE2 · 节点操作桥与能力注册表

日期：2026-11-10
分支：`feat/node-operation-bridge`
基线：`main` @ `d6acf52`（PR #3 合并后）

## 范围

- 抽出 UI/Agent 共用的节点操作执行器。
- 新增 `canvas_node_operations` / `canvas_node_operation`。
- 新增 `capability_catalog`。
- 新增能力注册表投影 `capabilities/registry.ts`。
- `canvas_get` 的选中节点增加 `availableOperations`。

## 实现要点

- `src/shared/node-operation-specs.ts`：声明 28 个操作的 Agent 可执行性、itemId、参数、确认规则和参数校验。
- `src/renderer/src/canvas/nodes/node-operation-runner.ts`：统一执行器。
  - UI 传入 dialog host，保留裁剪/截取/去字幕/深度/AI/蒙版等交互。
  - Agent 不传 host，只执行无需对话框的操作，需要模型时返回 `needsGeneration`。
- `NodeToolbar.tsx` 的 `activate` 改为调用 runner；删除重复的裁剪、抽帧、宫格切分、分离音视频等执行代码。
- 17 个操作 Agent 可直接执行：宫格切分、裁剪、深度动作捕捉、片段截取、分离音视频、抽帧、逐帧拉片、画面裁切、去字幕、图层分离、视频抠像、主体消除、扩图、抠图、片段重拍、元素替换、智能续写。
- 11 个需要模型/蒙版的操作标记 `agentExecutable: false`，提示词仍可被读取，Agent 走 `generation_propose`。
- 同一轮 Agent 节点操作用 `turnId` + `beginToolTurn` 合并为一条画布撤销记录。
- `capability_catalog` 返回当前空间、可用工具、选中节点操作、时间线摘要、导演台镜头和拉片摘要。

## 验证

- `corepack pnpm typecheck` 通过。
- `corepack pnpm test`：42 个文件、303 个用例全部通过。
- `corepack pnpm build` 通过。
- 隔离实例 CDP：
  - `listNodeOperations` 对图片节点返回 16 个操作，其中 7 个 Agent 可执行；对视频节点返回参数定义。
  - `grid-generate` 和 `inpaint` 在无 UI host 时返回 `needsGeneration`。
  - `crop` 的 free 模式缺少 rect 时返回明确错误。
  - 能力注册表测试确认所有工具与投影一一对应。
- 新增测试：
  - `src/shared/__tests__/node-operation-specs.test.ts`
  - `src/main/agent/__tests__/capabilities.test.ts`
  - `src/main/agent/__tests__/tools.test.ts` 新增节点操作与能力目录用例

## 已知限制

- 11 个模型/蒙版操作不能由 Agent 直接执行。
- 节点操作定义仍保留在 `tools.ts`，完整拆分到 `capabilities/*` 留到 Phase 3。
- 长时间任务（深度动作捕捉、图层分离等）启动后异步完成，工具立即返回任务 ID。
