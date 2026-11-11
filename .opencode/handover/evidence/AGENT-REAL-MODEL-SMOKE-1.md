# AGENT-REAL-MODEL-SMOKE-1 · 真实模型端到端烟测

日期：2026-11-11
分支：`main` @ `abb13d8`（PR #5 合并后）
模型：Agnes 3.0 Flash（`5c1f8b2a-3e6d-4a7b-9f21-8b4c6d2e1a30/remote_agnes-3.0-flash`）

## 环境

- 使用真实 userData 的模型配置，启动 `corepack pnpm dev`。
- 新建临时项目 `agent-smoke-real`，测试后删除并把应用恢复到原项目「样式测试」。
- 临时图片：`assets/smoke.png`（2170×1379 PNG）。
- 通过 CDP 调用 `window.api.agent.chat`，监听 `agent.onEvent`，验证真实 function calling 和工具执行。

> 尝试过把真实 `models.json/settings.json` 复制到隔离 userData，但 safeStorage 无法解密，因此改用真实 userData + 临时项目。

## 场景与结果

### 1. 节点操作发现 + 裁剪

用户指令：先 `canvas_node_operations` 查看 `image-smoke`，再 `canvas_node_operation` 执行 `crop`，`itemId=1:1`。

实际工具调用：

- `canvas_node_operations({ nodeId: "image-smoke" })` → ok
- `canvas_node_operation({ nodeId: "image-smoke", operationId: "crop", itemId: "1:1" })` → ok

结果：

- 输出尺寸 1379×1379。
- 新建图片输出成功，模型正确总结结果。
- 回合 `completed`。

### 2. 能力搜索

用户指令：调用 `capability_search` 搜索“镜头”。

实际工具调用：

- `capability_search({ query: "镜头" })` → ok

结果：

- 模型返回 `stage_get`、`stage_add_shot`、`stage_update_shot`。
- 回合 `completed`。

### 3. 导演台机位 + 镜头

用户指令：`stage_get` 后添加默认机位，再用该机位添加 3000ms、16:9、名为 `smoke-shot` 的镜头。

实际工具调用：

- `stage_get({ nodeId: "node-smoke-stage" })` → ok
- `stage_add_camera({ nodeId: "node-smoke-stage" })` → ok，cameraId `camera_3dd87c62`
- `stage_add_shot({ nodeId, cameraId: "camera_3dd87c62", durationMs: 3000, aspect: "16:9", name: "smoke-shot" })` → ok

结果：

- 场景得到 1 个机位、1 个镜头 `shot_75bf87f5`。
- 无确认卡（两个工具均不需要确认）。
- 回合 `completed`。

### 4. 拉片段落编辑 + 回合撤销

用户指令：读取 `node-smoke-study`，把 `seg1` 标题改为 `smoke-title`、备注改为 `smoke-note`。

实际工具调用：

- `film_study_get({ nodeId: "node-smoke-study" })` → ok
- `film_study_update_segment({ nodeId, studyId: "smoke-study", segmentId: "seg1", patch: { title: "smoke-title", notes: "smoke-note" } })` → ok

结果：

- study 文件写入成功。
- 回合 `change.filmUpdated = true`。
- 调用 `useAgentStore.undoLastTurn()` 后，标题恢复为「旧标题」，备注恢复为「旧备注」。

## 结论

- 真实模型能正确调用 Phase 1–3 新增工具。
- `canvas_node_operations → canvas_node_operation` 发现/执行链路正常。
- 导演台镜头/机位工具正常。
- 拉片段落编辑与快照撤销正常。
- `capability_search` 正常。

## 后续

- 继续覆盖 `stage_set_camera_track`、`stage_remove_shot`、`film_study_extract_subtitles`。
- 覆盖需要确认卡的工具（删除片段/对象、切分、导出）在真实模型下的 60 秒确认流程。
- 覆盖 `generation_propose` 的模型/蒙版节点操作（Phase 4）。
