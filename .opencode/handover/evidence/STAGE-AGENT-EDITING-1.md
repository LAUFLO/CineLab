# STAGE-AGENT-EDITING-1 · stage Agent 工具与 A2 手动编辑

日期：2026-11-09
状态：完成
范围：`stage.*` Agent 工具、渲染执行桥、TransformControls、属性编辑、增删对象/机位、落盘保护
关联：`docs/director-stage-plan.md`、`STAGE-VIEWPORT-1`

## 1. 目标

让手动编辑与 Agent 共用 `StageCommand`：

- Agent 可以读取、搭景、变换对象、添加机位。
- 用户可以在 3D 视口和属性面板直接编辑。
- 所有写操作统一进 StageCommand 历史并自动保存。

## 2. Agent 工具

新增 `STAGE_TOOLS`：

| 工具 | 执行位置 | 说明 |
|---|---|---|
| `stage_get` | 渲染进程 | 读取对象、机位、镜头、activeCameraId |
| `stage_capabilities` | 主进程 | 返回对象类型、姿势、缓动、限制、预览参数 |
| `stage_add_object` | 渲染进程 | 添加人物/立方体/球体/平面/群众，支持位置、旋转、缩放、姿势、颜色、数量 |
| `stage_transform_object` | 渲染进程 | 修改位置/旋转/缩放，支持部分更新 |
| `stage_add_camera` | 渲染进程 | 添加机位，默认正面机位 |
| `stage_set_active_camera` | 渲染进程 | 切换当前机位 |
| `stage_remove_object` | 渲染进程 | 删除对象及其动作轨 |

参数校验：

- `nodeId` 必须在当前 scope（选中或本轮新建）。
- 对象类型、坐标三元组、FOV、画幅、群众数量、名称长度。
- 写工具在只读模式不可用。

渲染执行桥 `src/renderer/src/agent/stageBridge.ts`：

- 导演台已打开且 nodeId 匹配：走 `stageStore.applyCommands`，保留 UI 与历史。
- 未打开：读取场景文件 → `applyStageCommands` → 立即 `stage.save` → 同步画布节点摘要。
- Agent 工具不要求导演台窗口打开。

## 3. 落盘 bug 修复

真实验证发现：Agent 工具在导演台已打开时只更新了内存，依赖 500ms 防抖保存；窗口关闭后的延迟保存又把旧快照写回，导致工具结果丢失。

修复：

1. `stageBridge` 在 store 分支执行命令后立即 `stage.save(doc)`，并清 dirty。
2. `saveStageFile` 保留调用方 `updatedAt`，并拒绝 `next < previous` 的旧快照覆盖。
3. 新增单测：
   - 旧快照不能覆盖新场景。
   - `saveStageFile` 保留传入的 `updatedAt`。

## 4. A2 手动编辑

### 4.1 TransformControls

- 原生 three `TransformControls`。
- 选中对象时附加，支持移动 / 旋转 / 缩放。
- 拖拽期间禁用 OrbitControls。
- `dragging-changed` 结束时把对象 transform 写回 `transformObject` 命令。
- 机位视角下自动 detach。

### 4.2 属性面板

对象：

- 位置、旋转（界面角度制）、缩放。
- 姿势下拉、颜色选择、可见开关。
- 删除对象。

机位：

- 名称、位置、注视点、FOV、画幅。
- 切换到此机位、删除机位。

### 4.3 左栏

- 对象标题「+」：人物、立方体、球体、平面、群众。
- 机位标题「+」：添加默认机位并切换。
- 镜头列表保持只读。

### 4.4 撤销 / 重做

- 所有手动编辑走 `stageStore.applyCommands`。
- Ctrl/Cmd+Z 撤销，Shift+Ctrl/Cmd+Z 重做。
- 节点摘要（对象/机位/镜头数量、activeCameraId）随命令同步。

## 5. 验证

### 5.1 自动化

```text
31 test files, 219 tests passed
typecheck 通过
build 通过，主进程约 458KB
```

### 5.2 真实 UI

手动编辑：

```text
打开导演台 → 选中人物 A → 移动/旋转/缩放工具条出现
位置 X 从 -1.20 改为 -2.40 → 场景文件 human_a.position=[-2.4,0,0]，状态「已保存」
添加立方体 → 对象 5，节点摘要「5 对象」
添加机位 → 机位 4，activeCamera=新机位，视角切到机位视角
删除立方体 2 → 对象 4，摘要「4 对象」
Ctrl+Z → 对象恢复为 5，摘要「5 对象」
```

TransformControls 截图：`.opencode/handover/evidence/STAGE-EDITING-1.png`。

Agent 工具：

```text
选中导演台节点 → 发送搭景请求
stage_capabilities 完成
stage_add_object 完成（红色球体，位置 [2,0,-2]，颜色 #ff0000）
stage_add_camera 完成（机位A，[4,2,5] → [0,1,0]，FOV 40，16:9）
stage_get 完成，返回 6 对象 / 4 机位
```

修复后再次验证：

```text
stage_add_object（绿色球体，[-2,0,-2]）
→ 场景文件 objects=6，包含「球体 2」
→ updatedAt 更新，窗口关闭后不被旧快照覆盖
```

测试场景已清理重复对象，保留 6 对象 / 4 机位。

## 6. 已知限制

- Agnes 文本模型测试期间偶发 503，`stage_transform_object` / `stage_remove_object` 未单独跑真实 Agent 轮次；两者复用同一执行桥与命令层，已有参数单测与命令层单测。
- TransformControls 拖拽未做自动化坐标验证；控件显示、属性写回与命令层已验证。
- 对象改名、镜头编辑、场景背景色编辑尚未接入。
- 属性数字输入在失焦或回车时提交，不做逐键实时写入。

## 7. 下一步

1. 运镜时间轴：镜头列表、关键帧、播放预演。
2. 本地白模预演视频导出（逐帧渲染 + ffmpeg）。
3. 剪辑助手 clip profile。
