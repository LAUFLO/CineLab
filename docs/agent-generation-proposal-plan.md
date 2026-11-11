# Agent 生成提案方案（propose / submit）

状态：已完成（真实 Agnes 验证）
日期：2026-11-08
适用版本：`main` @ `b76a064`
关联：`docs/agent-architecture-plan.md` 4.4 确认、5.x 回合事务

## 1. 目标

Agent 不能在对话中直接发起付费生成。生成必须走两段式：

```text
generation.propose  → 登记提案，不调用模型、不扣费
用户点击「确认生成」 → generation.submit → 进入现有 generationQueue
```

提案在用户确认前只是本地 JSON 记录，不产生任何网络请求。

## 2. 数据模型

### 2.1 提案

```ts
type AgentProposalStatus =
  | 'pending'    // 等待用户确认
  | 'submitting' // 已写入提交意图，尚未拿到 runId
  | 'submitted'  // 已进入生成队列
  | 'completed'  // 生成完成
  | 'failed'     // 提交失败或生成失败
  | 'cancelled'  // 用户取消
  | 'expired'    // 新消息或超时失效

interface AgentProposal {
  id: string
  sessionId: string
  turnId: string
  status: AgentProposalStatus
  request: GenerateRequest
  nodeTitle: string
  modelName: string
  capability: Capability
  count: number
  createdAt: string
  expiresAt: string
  submittedAt?: string
  runId?: string
  error?: string
}
```

> 不展示金额预估：不同供应商的计费方式差异很大，部分模型免费，本地无法可靠推算，错误预估会误导用户。

## 3. 工具

| 工具 | 执行位置 | 权限 | 说明 |
|---|---|---|---|
| `generation_catalog` | 主进程 | 只读 | 列出已配置的生成模型、能力、输入和参数 |
| `library_search` | 主进程 | 只读 | 搜索全局资产库的图片、视频、音频，返回相对路径 |
| `generation_propose` | 渲染进程 | 写 | 校验目标节点与参考素材，登记提案，必要时补建素材节点和连线 |
| `canvas_add_node` | 渲染进程 | 写 | 创建节点；支持 `nearNodeId`，把新节点放在参考素材右侧 |

`generation_submit` 不注册给模型。只有用户点击提案卡才能提交，避免模型绕过确认。

### 3.1 `generation_propose` 参数

```json
{
  "nodeId": "目标节点，必须在选中或本轮新建 scope",
  "modelKey": "provider/model",
  "prompt": "生成提示词",
  "params": { "ratio": "16:9" },
  "count": 1,
  "refNodeIds": ["画布参考节点，可选"],
  "libraryRefs": [
    { "path": "场景/街景.png", "kind": "image", "role": "firstFrame" }
  ],
  "negativePrompt": "负向提示词，可选"
}
```

未传任何参考时，渲染进程自动收集目标节点的直接上游节点最新输出。

### 3.2 素材引用与自动连线

三类素材统一进入 `GenerateRequest.refs` / `video`：

| 来源 | 入口 | 画布行为 |
|---|---|---|
| 画布已有素材 | `refNodeIds` | 不复制节点；如参考节点尚未连到目标节点，自动补一条 `source → target` 连线 |
| 资产库素材 | `library_search` + `libraryRefs` | 在目标节点左侧创建素材节点（`scope: global`），自动连线到目标节点 |
| 本地文件 | Agent 输入框「上传」 | 复用 `library.importAssets` 导入全局库并创建素材节点；作为附件传给 CineBot，模型用 `refNodeIds` 引用 |

规则：

- 参考图片最多 3 张：第 1 张 `firstFrame`、第 2 张 `lastFrame`、其余 `reference`；显式角色重复时降级为 `reference`。
- 参考视频最多 1 个；音频输入暂不进入生成参考。
- 引用素材与目标节点的连线在 `generation_propose` 登记提案时创建，和目标节点提示词回填一起进入本轮画布撤销。
- `generation_propose` 先登记提案，成功后再创建素材节点、连线和提示词；提案校验失败不修改画布。

### 3.3 提示词回填

- `generation_propose` 通过新的 `CanvasCommand.updatePrompt` 把提示词写入目标节点 `data.prompt`。
- `PromptBar` 监听外部 `data.prompt` 变化；当 Agent 设置提示词时，已打开的提示词输入框会立即更新。
- 生成完成后，成片仍由现有 `generation.done` 事件写回目标节点 `outputs`。

### 3.4 本地附件

- Agent 输入框新增「上传」按钮，调用现有 `library.importAssets('场景')`。
- 导入后立即在当前视口中心创建素材节点，并选中这些节点。
- 附件以 `AgentAttachment` 随 `agent:chat` 请求传给主进程，包含 `nodeId / name / path / scope / kind`。
- 运行时把附件列表追加到系统提示，模型直接使用附件 `nodeId` 作为 `refNodeIds`。
- 发送后清空附件 chip，素材节点保留在画布。


## 4. 生命周期

### 4.1 创建

1. 渲染进程校验目标节点存在、类型匹配，解析参考输出。
2. 主进程校验：
   - 调用工具时的 turn 仍活跃，sessionId / turnId 来自运行时，不信任渲染传入。
   - 供应商存在、有 API Key、模型存在。
   - 参数按模型 `params` 规范化，未知参数报错。
   - 参考路径必须相对、最多 4 张图；视频输入仅 http-template 适配器。
   - 计算本次生成数量。
3. 写入 `<project>/.cinelab/agent/proposals/<id>.json`。
4. 广播 `proposal` 事件，Agent 面板显示提案卡。

### 4.2 失效

- 新用户消息开始新一轮：同 session 所有 `pending` → `expired`。
- 提案超过 10 分钟：读取或提交时判定过期。
- 用户点击取消：`pending` → `cancelled`。
- 提交成功：`pending` → `submitting` → `submitted`。

### 4.3 提交与幂等

1. 渲染进程提交前再次确认目标节点仍在画布中。
2. 主进程读取提案：
   - 已过期 → 标记 `expired`，拒绝。
   - `submitting` → 拒绝并发提交。
   - `submitted` / `completed` → 返回已有 runId，不重复入队。
   - `failed` 且已有 runId → 拒绝重复购买，提示新建提案。
   - `failed` 且无 runId → 提交失败未入队，允许重试。
3. 先原子写 `submitting`，再调用 `startGeneration`。
4. 拿到 runId 后写 `submitted` + runId。
5. 生成事件回写：`done → completed`，`error → failed`，`cancelled → cancelled`。

### 4.4 失败查单

提案文件保存 `runId` 和状态。应用重启后：

- `submitting` 状态的提案重置为 `failed`（提交过程被中断，无法确认是否入队），保留 `runId` 时禁止重提。
- 生成队列本身不持久化，重启后不会恢复任务；节点状态由现有生成事件机制处理。

## 5. 界面

Agent 面板底部显示当前提案卡：

```text
生成提案
节点：分镜 01
模型：Agnes 2.5 Flash 图像
参数：size=1K · ratio=16:9
数量：1
[确认生成] [取消]
```

状态变化：

- `pending`：显示确认 / 取消。
- `submitting`：按钮禁用，显示「提交中」。
- `submitted`：显示「已提交，等待生成」，提供取消生成入口（沿用节点上的取消）。
- `completed`：显示「生成完成」。
- `failed`：显示错误，提示「让助手重新生成」。
- `expired`：显示「已失效」，不显示确认按钮。

## 6. 文件与接口

### 6.1 新增文件

| 文件 | 作用 |
|---|---|
| `src/shared/agent-proposal.ts` | 参数规范化、数量、费用估算、过期判定纯函数 |
| `src/main/agent/proposals.ts` | 提案文件存储、状态机、提交、runId 索引 |
| `src/main/engine/start-generation.ts` | 从 `ipc/generate.ts` 抽出的生成入队逻辑 |
| `src/shared/__tests__/agent-proposal.test.ts` | 纯函数测试 |
| `src/main/agent/__tests__/proposals.test.ts` | 提案服务测试 |

### 6.2 IPC

| 通道 | 方向 | 说明 |
|---|---|---|
| `agent:proposal-create` | 渲染 → 主 | 登记提案 |
| `agent:proposal-active` | 渲染 → 主 | 恢复当前会话待确认提案 |
| `agent:proposal-submit` | 渲染 → 主 | 用户确认后提交 |
| `agent:proposal-cancel` | 渲染 → 主 | 取消待确认提案 |
| `agent:event` | 主 → 渲染 | 新增 `proposal` 事件 |

## 7. 安全边界

- 目标节点必须在当前 scope（选中或本轮新建）。
- 参考节点不要求选中，但必须真实存在且有输出；渲染进程校验后才会写入提案。
- 资产库引用路径必须来自 `library_search` 或用户附件，不能是绝对路径，不能包含 `..`。
- 模型必须存在于用户配置，且有 Key。
- 参数必须来自模型声明的参数定义。
- 提交只能由用户操作触发。
- 提案文件不保存 API Key、请求头或任何密钥。

## 8. 验证

1. 单元测试：参数默认值、非法参数、数量、过期、状态机、幂等、`updatePrompt` 命令、素材引用参数。
2. `typecheck` / `test` / `build`。
3. 真实 Agnes：
   - `generation_catalog` 返回图片和视频模型。
   - 对图片节点发起提案，确认前无网络请求。
   - 点击确认后出图并写回节点。
   - 重复点击确认不产生第二个 runId。
   - 发送新消息后旧提案变为 expired。
4. 素材链路：
   - 引用画布节点：缺连线时自动补线，已有连线不重复。
   - 引用资产库图片：自动创建素材节点、连线并写入提示词。
   - 本地附件：上传后创建节点，CineBot 用附件 nodeId 引用，视频节点自动连接到图片节点。
   - `PromptBar` 已打开时，Agent 回填提示词能同步更新输入框。
5. 不推送。
