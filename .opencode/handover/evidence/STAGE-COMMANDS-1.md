# STAGE-COMMANDS-1 · StageCommand 骨架

日期：2026-11-09
状态：完成
范围：导演台场景 schema、命令层、批量原子执行、撤销 / 重做历史
关联：`docs/director-stage-plan.md` 第 5、6 节

## 1. 目标

在接入 3D 视口之前，先定义手动编辑与 Agent 共用的场景数据结构和写操作命令层，避免后续两套逻辑。

本阶段不接入画布 `stage` 节点、3D 渲染、场景文件存储和 Agent 工具执行。

## 2. 数据模型

新增 `src/shared/stage-schema.ts`：

- `DirectorStageDoc`：`version / stageId / name / background / objects / cameras / shots / activeCameraId / updatedAt`。
- `StageObject`：人物、几何、glTF、群众阵列；变换、姿势、颜色、可见性、父子关系。
- `StageCamera`：位置、注视点、FOV、画幅。
- `StageShot`：机位、时长、画幅、运镜关键帧、动作轨。
- `CameraKeyframe` / `ActionKeyframe` / `ActionTrack`。
- `PreviewOptions`：720p / 1080p、24 / 30fps、MP4。
- `STAGE_POSE_PRESETS`、`STAGE_OBJECT_TYPES`、`STAGE_ASPECTS`、`STAGE_EASINGS`、`STAGE_LIMITS`。
- `createStageDoc`、`createStageId`、`cloneStageDoc`、`validateStageDoc`、`isStageDoc`。

限制：

| 项 | 上限 |
|---|---|
| 对象 | 500 |
| 机位 | 24 |
| 镜头 | 100 |
| 运镜关键帧 | 100 / 镜头 |
| 动作关键帧 | 500 / 轨道 |
| 镜头时长 | 15 秒 |

## 3. 命令层

新增 `src/shared/stage-commands.ts`，实现：

| 命令 | 说明 |
|---|---|
| `addObject` / `removeObject` | 添加、删除对象；删除父对象时清空子对象 `parentId` 并移除相关动作轨 |
| `transformObject` | 移动 / 旋转 / 缩放，支持部分更新 |
| `setPose` / `setColor` / `setVisible` | 姿势、颜色、可见性 |
| `addCamera` / `updateCamera` / `removeCamera` | 机位；被镜头引用时拒绝删除 |
| `setActiveCamera` | 切换或清除当前机位 |
| `addShot` / `updateShot` / `removeShot` | 镜头；校验机位、时长、画幅 |
| `setCameraTrack` | 运镜关键帧，自动按时间排序 |
| `setActionTrack` | 对象动作轨，按对象替换或新增 |
| `captureFrame` | 返回截图 effect，不修改文档 |
| `renderPreview` | 返回本地白模预览 effect，不修改文档 |

### 3.1 批量与回滚

`applyStageCommands(doc, commands, now?)`：

- 逐条执行，任意一条失败时整批回滚到原文档。
- 成功时统一更新 `updatedAt`。
- 返回 `StageChange`（创建 / 更新 / 删除的对象、机位、镜头）和 `StageEffect[]`。
- `applied` 表示成功执行的命令数量。

### 3.2 撤销 / 重做

- `pushStageHistory`：应用命令前压入当前文档快照，清空重做栈。
- `undoStageHistory` / `redoStageHistory`：在快照之间切换，默认保留 50 条。
- 快照深拷贝，避免后续命令污染历史。

## 4. 验证

```text
30 test files, 202 tests passed
typecheck 通过
```

新增 `src/shared/__tests__/stage-commands.test.ts` 覆盖：

- 对象添加、变换、姿势、颜色、可见性、删除。
- 重复 ID、未知对象。
- 删除父对象时子对象 `parentId` 清理与动作轨级联。
- 首个机位自动激活、FOV 校验、被引用机位拒绝删除、激活机位切换。
- 镜头添加、关键帧排序、时长与引用校验。
- 动作轨替换、缺失对象拒绝。
- 批量成功、批量失败整体回滚、effect 返回。
- 历史压栈、撤销、重做、长度上限。

## 5. 未完成

- 画布 `stage` 节点类型、`NODE_META`、项目 schema、导出。
- 场景文件 `<project>/stages/<stageId>.json` 的读写与复制。
- three.js 3D 视口、机位视角、截图。
- 本地白模预演渲染管线。
- `stage.*` Agent 工具定义与渲染进程执行层。
- 手动 UI 与 3D 交互。

## 6. 下一步

1. 场景文件存储与 `stage` 节点接入。
2. three.js 视口与机位切换。
3. `stage.*` Agent 工具（先 get / capabilities / addObject / transformObject / addCamera）。
4. 运镜时间轴与本地白模预演。
