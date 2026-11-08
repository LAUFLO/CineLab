# STAGE-NODE-STORAGE-1 · 导演台节点与场景存储

日期：2026-11-09
状态：完成
范围：画布 `stage` 节点、场景文件读写、节点创建、复制/粘贴深拷贝
关联：`docs/director-stage-plan.md`、`STAGE-COMMANDS-1`

## 1. 目标

把 StageCommand 骨架接到画布：新增导演台节点类型，场景独立存为 `<project>/stages/<stageId>.json`，手动创建、复制与重开项目可用。

## 2. 实现

### 2.1 画布与项目 schema

- `src/shared/canvas-schema.ts`：
  - `CanvasNodeKind` 增加 `stage`。
  - 新增 `StageNodeData`：`stageId`、`activeCameraId`、对象/机位/镜头数量、标题、状态。
  - `NODE_META.stage`：420×280。
- `src/shared/project-schema.ts`：
  - 新增 `stageNodeSchema`，加入 `canvasNodeSchema` 联合。
  - 新增 `PersistedStageNode`。
- `src/shared/canvas-commands.ts`：`CanvasCommandNode` 增加 stage 节点，Agent 画布命令可操作。

### 2.2 主进程场景存储

新增 `src/main/stage/storage.ts`：

```text
stages/<stageId>.json
```

| 函数 | 作用 |
|---|---|
| `createStageFile` | 生成 `stage_<uuid>`、默认文档并写盘 |
| `loadStageFile` | 读取并校验；不存在返回 null |
| `saveStageFile` | 校验后原子写，更新时间戳 |
| `duplicateStageFile` | 深拷贝为新 stageId，名称加「副本」 |
| `deleteStageFile` | 删除场景文件 |

安全与校验：

- stageId 只允许 `A-Za-z0-9_-`，拒绝 `..` 与路径穿越。
- 保存前跑 `validateStageDoc`，非法对象/机位/镜头/关键帧直接拒绝。
- 写文件使用临时文件 + rename。

新增 `src/main/ipc/stage.ts`：

| IPC | 说明 |
|---|---|
| `stage:create` | 创建场景文件 |
| `stage:load` | 读取场景 |
| `stage:save` | 保存场景 |
| `stage:delete` | 删除场景文件 |
| `stage:duplicate` | 深拷贝场景 |

`ipc-contract` 与 `preload` 增加 `window.api.stage`。

### 2.3 项目目录

- 创建项目时增加 `stages/` 目录。
- 打开项目时确保 `stages/` 存在。
- 项目导出使用 `fs.cp(projectRoot, ...)`，`stages/` 自动随项目打包。

### 2.4 渲染层

- `canvas store`：
  - 新增 `StageNode` 类型、`isStageNode`。
  - `addStageNode(doc, position)`、`patchStageNode(nodeId, patch)`。
  - `duplicateSelection` / `pasteNodes` 接受 `stageDocs` 映射，复制时替换 `stageId`，避免共享场景。
- 新增 `StageNodeView`：
  - 标题可双击重命名。
  - 展示对象/机位/镜头数量。
  - 「打开导演台」暂时禁用，提示 3D 视口下一阶段接入。
- `AddNodeMenu` 新增「场景 → 导演台」，先创建场景文件，再添加节点。
- 复制粘贴深拷贝：
  - `context-actions` 新增 `copyStageDocs`。
  - 节点右键菜单「粘贴」改走 `pasteAt()`，确保导演台场景一起复制。

## 3. 验证

### 3.1 单元测试

```text
31 test files, 211 tests passed
typecheck 通过
build 通过，主进程约 448KB
```

新增 `src/main/stage/__tests__/storage.test.ts`：

- 创建场景、默认名称、自动建目录。
- 保存/读取对象、机位与激活机位。
- 非法场景拒绝。
- 不存在的场景返回 null。
- 非法 stageId 拒绝。
- 深拷贝生成新 ID 与「副本」名称。
- 删除文件。

### 3.2 真实 UI（隔离实例）

```text
双击画布 → 添加节点菜单出现「场景 / 导演台」
点击导演台 → 画布出现 StageNodeView
→ stages/stage_159b9919....json 写入，262 字节
→ 节点显示「导演台 1 / 场景 / 0 对象 · 0 机位 · 0 镜头」

选中节点 Ctrl+C / Ctrl+V
→ 出现「导演台 1 副本」
→ stages 目录出现第二个场景文件 stage_e15b88fd....json

location.reload()
→ 两个导演台节点均恢复，标题与数量正确
```

## 4. 已知限制

- 删除导演台节点时不自动删除场景文件，避免画布撤销后场景丢失；后续做项目级孤儿清理。
- 「打开导演台」按钮暂时禁用，3D 视口与机位切换尚未接入。
- `canvas_add_node` 尚未支持 `stage`，Agent 创建导演台留到 `stage.*` 工具阶段。
- 场景文件目前只能通过复制/粘贴深拷贝；项目导出自动包含，但暂无独立导入场景功能。

## 5. 下一步

1. three.js 3D 视口：素模、几何、机位视角、截图。
2. `stage.*` Agent 工具：get / capabilities / addObject / transformObject / addCamera。
3. 运镜时间轴与本地白模预演。
4. 场景孤儿清理与独立导入。
