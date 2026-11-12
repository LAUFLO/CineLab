# 节点操作输出目标方案

状态：现行
日期：2026-11-12
适用版本：`main`

## 背景

节点工具栏里混有三类操作：

1. 本地媒体处理：宫格切分、抽帧、分离音视频、深度捕捉等，早已新建节点并连线。
2. 模型生成：九宫格、角色四视图、画面推演、多角度、全景、扩图、抠图、片段重拍、元素替换、智能续写，此前默认写回当前节点的版本栈。
3. 局部修图：光影校正、打光、人像质感、重绘、擦除、元素编辑，此前同样写回版本栈。

问题在于生成型操作的结果被塞进原节点版本栈后，原节点既代表“源素材”又代表“派生素材”，下游连线语义变得模糊，用户也很难同时保留原图和生成结果。

## 规则

`NodeOperation.outputTarget` 是唯一真相源：

- `version`（默认）：结果写回当前节点版本栈，适合对同一画面做修正、希望用版本切换对比的操作。
- `new-node`：先创建占位节点并连线，生成结果写入新节点，源节点和源输出保持不变。

### 当前分类

| 目标 | 操作 |
|---|---|
| `new-node` | 裁剪（比例 / 自由）、九宫格、角色四视图、画面推演、多角度、720 全景、扩图、抠图、片段截取、画面裁切、去字幕、片段重拍、元素替换、智能续写、音频截取、音频变速 |
| `version` | 电影级光影校正、打光、人像质感调节、重绘、擦除、元素编辑 |
| 始终新建（既有实现） | 宫格切分、抽帧、分离音视频、深度动作捕捉、逐帧拉片、图层分离、智能抠像、主体消除、智能去字幕 |

音频节点的截取和变速也按派生素材处理，新建音频节点并连线。

## 实现

- `src/renderer/src/canvas/nodes/node-operations.ts`
  - 新增 `NodeOutputTarget` 类型和 `outputTarget` 字段。
  - 生成型操作标记 `outputTarget: 'new-node'`。
- `src/renderer/src/canvas/nodes/NodeToolbar.tsx`
  - `handleAiConfirm` / `handleSphereConfirm` 按 `outputTarget` 创建占位节点并连线。
  - 自由裁剪、片段截取、框选去字幕同样走 `addPendingNodes`。
- `src/renderer/src/canvas/nodes/node-operation-runner.ts`
  - Agent / UI 共用的执行器：比例裁剪、画面裁切、片段截取、框选去字幕、扩图/抠图的视觉组件路径全部改为 `new-node`。
  - `listNodeOperations` 返回 `outputTarget`，供 Agent 发现。
- `src/renderer/src/canvas/nodes/CineNodeView.tsx`
  - 音频截取和变速改为新建音频节点。
- 生成请求仍用源节点输出作为 `refs`，新节点只作为结果落点；生成失败时占位节点标红，可重试。

## Agent 提案

`generation_propose` 与工具栏共用 `nodeOperationOutputTarget`：

1. 主进程登记提案时按 `request.op` 写入 `outputTarget`。
2. 提案卡展示「新建节点并连线」或「写回当前节点版本」。
3. 确认时渲染端按模型能力创建占位节点并连线，把新节点 ID 传给 `proposalSubmit`。
4. 主进程校验新节点 ID，改写 `request.nodeId` 后再入队；引用素材仍基于源节点，runId 幂等和提案失效逻辑不变。

旧提案文件没有 `outputTarget` 时，主进程和渲染端都用 `nodeOperationOutputTarget(request.op)` 兜底。

## 验收

- `corepack pnpm typecheck`
- `corepack pnpm test`
- `corepack pnpm build`
- 隔离实例验证：
  - 角色四视图生成后出现新节点并连线，源节点版本栈不变。
  - 光影校正仍然写回版本栈。
  - 裁剪、片段截取、去字幕、扩图、抠图均产生新节点。
  - 音频截取 / 变速产生新音频节点。
  - 新节点生成失败时可重试，撤销可回到生成前。
