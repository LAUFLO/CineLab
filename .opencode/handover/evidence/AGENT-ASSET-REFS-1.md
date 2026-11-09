# AGENT-ASSET-REFS-1 · CineBot 素材引用、自动连线与提示词回填

日期：2026-11-09
状态：完成
范围：画布素材、资产库素材、本地附件三类引用；生成节点自动连线；提示词回填
关联：`AGENT-PROPOSAL-1`、`AGENT-UI-2`、`CLIP-ADVANCED-TOOLS-1`

## 1. 结论

CineBot 现在支持三类生成素材引用：

| 来源 | 入口 | 画布行为 |
|---|---|---|
| 画布已有素材 | `generation_propose.refNodeIds` | 参考节点未连接目标时自动补线，不复制节点 |
| 资产库素材 | `library_search` + `generation_propose.libraryRefs` | 自动在目标节点左侧创建素材节点，并连线到目标节点 |
| 本地文件 | CineBot 输入框「上传」 | 复用 `library.importAssets` 导入全局库，创建素材节点并作为附件传给 CineBot |

生成提案登记成功后：

- 目标视频节点由 CineBot 通过 `canvas_add_node` 创建；可传 `nearNodeId` 放在参考素材右侧。
- 参考素材自动连接到目标节点。
- 提示词通过 `CanvasCommand.updatePrompt` 写回目标节点 `data.prompt`。
- `PromptBar` 监听外部提示词变化，已打开时也会立即更新。
- 生成完成后，现有 `generation.done` 事件把视频写回目标节点，素材节点与连线保留。

## 2. 工具与参数

### 2.1 `library_search`

- 主进程执行，只读。
- 参数：`query?`、`kind?`（image/video/audio）、`limit?`（1-30）。
- 返回资产库相对路径、名称、类型、大小、修改时间。
- 搜索结果里的图片/视频 `path` 可直接放进 `generation_propose.libraryRefs`。

### 2.2 `generation_propose` 新参数

```json
{
  "refNodeIds": ["画布节点或附件 nodeId"],
  "libraryRefs": [
    { "path": "场景/街景.png", "kind": "image", "role": "firstFrame" }
  ]
}
```

- `refNodeIds` 不再要求节点在当前选中 scope，但渲染进程必须能找到节点且有图片/视频输出。
- 图片最多 3 张，角色依次为 `firstFrame`、`lastFrame`、`reference`；重复角色降级为 `reference`。
- 视频最多 1 个。
- 路径必须相对，不能包含 `..`；主进程登记提案时还会检查文件真实存在。
- 先登记提案，成功后才修改画布；模型参数或素材校验失败时不会留下多余节点和连线。

### 2.3 `canvas_add_node`

- `x/y` 改为可选。
- 新增 `nearNodeId`：把新节点放在该节点右侧，适合「参考图 → 视频节点」。
- 新增节点会取消其他节点的选中状态，避免多选。

### 2.4 `canvas_get`

- 除选中节点外，返回最多 200 个节点的 `id / title / kind / x / y / outputKind`。
- CineBot 可以按标题查找画布素材，不需要用户先手动选中。

## 3. 本地附件

- CineBot 输入区新增「上传」chip，调用现有 `library.importAssets('场景')`。
- 导入后立即在当前视口中心创建素材节点，选中这些节点，并在输入框上方显示附件 chip。
- 附件以 `AgentAttachment` 随 `agent:chat` 传给主进程：

```ts
interface AgentAttachment {
  nodeId: string
  name: string
  path: string
  scope: 'project' | 'global'
  kind: 'image' | 'video' | 'audio'
}
```

- 运行时把附件列表写入系统提示，模型直接使用 `nodeId` 作为 `refNodeIds`。
- 发送成功后清空附件 chip；素材节点保留在画布。
- 切换会话会清空未发送附件。

## 4. 自动连线与提示词回填

### 4.1 连线

- `generation_propose` 检查所有参考节点到目标节点的边。
- 缺少时创建 `source → target` 的 `flow` 边，`data.role = 'auto'`。
- 资产库素材会先创建素材节点，再在同一批命令里创建连线。
- 已有连线不会重复创建。
- 节点、连线、提示词一起进入本轮画布撤销。

### 4.2 提示词

- 新增 `CanvasCommand.updatePrompt`。
- `generation_propose` 在提案登记成功后写入目标节点提示词。
- `PromptBar` 新增外部提示词监听：
  - 节点切换时加载 `data.prompt`。
  - 同一节点被 Agent 改写 `data.prompt` 时，输入框同步更新。
  - 用户输入仍按 350ms 防抖写回节点，不会被反向覆盖。
- 提案登记后自动选中目标节点，提示词输入框直接显示回填内容。

## 5. 验证

### 5.1 自动化

```text
36 test files, 256 tests passed
typecheck 通过
build 通过，主进程约 518KB
```

新增测试：

- `CanvasCommand.updatePrompt` 更新与非法节点警告。
- `canvas_add_node` 支持 `nearNodeId`，缺少位置时拒绝。
- `generation_propose` 支持 `libraryRefs`，拒绝绝对路径和非法类型。
- `library_search` 参数校验。
- 新增选中节点时自动取消旧节点选中。

### 5.2 真实画布链路（本地 mock 文本模型）

**资产库素材**

```text
用户：用资产库图片生成一段视频
library_search → 找到 场景/深色背景上的紫白无限循环标志.png
canvas_add_node（视频，x=1200,y=400）
generation_propose（libraryRefs: 该图片）
```

结果：

- 新图片素材节点 `node-image-7b6cdc90`，位置 760,400，`scope=global`。
- 新视频节点 `node-video-dea07ebf`，位置 1200,400。
- 自动连线 `edge-446302eb`：图片节点 → 视频节点。
- 视频节点提示词：`用资产库参考图生成一段电影感视频，镜头缓慢推进`。
- 提案卡显示「引用 1 个 · 深色背景上的紫白无限循环标志.png」。

**本地附件**

```text
模拟上传：创建 image_mw9fpf7b_1，附件 chip 显示「本地测试图」
用户：用附件图片生成视频
canvas_add_node（视频，nearNodeId=附件节点）
generation_propose（refNodeIds=[附件节点]）
```

结果：

- 视频节点 `node-video-ef1a8f35`，位置 840,800（附件节点右侧）。
- 自动连线 `edge-3af7d3d8`：附件图片 → 视频节点。
- 视频节点提示词已写入。
- 附件 chip 发送后清空，节点保留。

**画布已有素材**

```text
用户：用画布素材生成视频
canvas_get → 找到图片节点
canvas_add_node（视频，nearNodeId=图片节点）
generation_propose（refNodeIds=[图片节点]）
```

结果：

- 新视频节点 `node-video-1eaae727`。
- 自动连线：已有图片节点 → 新视频节点。
- 仅目标视频节点被选中。
- `PromptBar` 立即显示：`用画布参考图生成一段电影感视频，镜头缓慢推进`。
- 手工修改节点 `data.prompt` 后，已打开的输入框同步变为新提示词。

截图：

- `.opencode/handover/evidence/AGENT-ASSET-REFS-1.png`

## 6. 已知限制

- 本地文件选择使用系统原生对话框，自动化测试只验证了附件节点与发送链路；文件选择本身需人工点击。
- 提案取消后，已创建的素材节点、连线和提示词会保留在画布，用户可继续调整或撤销本轮。
- 附件不随会话持久化；切换会话后需重新上传，但素材节点仍在画布。
- 生成参考仍只支持图片和单个视频；音频输入暂不进入 `GenerateRequest`。
- 资产库搜索会扫描全局库，素材很多时可能略慢。
- 自动连线只建立「参考 → 目标」边，不自动删除或重排已有连线。

## 7. 关键文件

- `src/shared/agent.ts`：`AgentAttachment`、附件请求字段
- `src/shared/canvas-commands.ts`：`updatePrompt`、addNode 选中规则
- `src/shared/agent-tools.ts`：`library` 工具域
- `src/main/agent/tools.ts`：`library_search`、`libraryRefs`、`nearNodeId` 校验
- `src/main/agent/main-tools.ts`：资产库搜索
- `src/main/agent/proposals.ts`：参考素材存在性校验
- `src/main/agent/runtime.ts`：附件上下文、scope
- `src/main/ipc/agent.ts`：附件参数校验
- `src/renderer/src/agent/canvasBridge.ts`：素材节点创建、自动连线、提示词回填
- `src/renderer/src/agent/agentStore.ts`：上传、附件状态、发送
- `src/renderer/src/agent/AgentPanel.tsx`：上传 chip、附件 chip、提案引用行
- `src/renderer/src/canvas/PromptBar.tsx`：外部提示词同步
- `src/renderer/src/styles/agent.css`：附件样式
- `docs/agent-generation-proposal-plan.md`
- `docs/agent-architecture-plan.md`
