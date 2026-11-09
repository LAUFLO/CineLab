# 导演台 3D 视口实施文档（A 路线）

日期：2026-11-09
状态：A1 已完成（全屏视口、对象/机位渲染、视角切换、截图、自动保存）
关联：`docs/director-stage-plan.md`、`STAGE-COMMANDS-1`、`STAGE-NODE-STORAGE-1`

## 1. 技术路线

采用**原生 three.js 渲染内核 + React 外壳**：

```text
StageWindow（React）
  ├─ StageTopBar       场景名、视角切换、截图、保存状态
  ├─ StageObjectList   对象/机位列表
  ├─ StageViewport     three.js 渲染内核
  └─ StageInspector    选中对象/机位属性
```

- 不引入 `@react-three/fiber` / `drei`。
- 渲染循环、拾取、相机控制、截图都由自研渲染内核负责。
- 后续本地白模预演可直接复用同一套 three 场景与相机求值逻辑。

## 2. 分层

### 2.1 渲染内核 `StageViewport`

- `THREE.Scene`、`THREE.PerspectiveCamera`、`THREE.WebGLRenderer`。
- 导演视角：透视相机 + `OrbitControls`。
- 机位视角：按 `StageCamera.position/target/fov` 摆放相机，禁用轨道控制。
- 场景内容：
  - 背景色、地面网格、环境光 + 平行光。
  - 人体素模：胶囊身体 + 球头。
  - box / sphere / plane。
  - crowd：按 `count` 生成多个素模。
  - glTF：第一批显示线框占位，不加载外部模型。
  - 机位：每个机位一个锥体标记 + `CameraHelper`。
- 拾取：`Raycaster` 点击选中对象；机位标记可点击。
- 选中高亮：`BoxHelper`。
- 截图：`preserveDrawingBuffer` + 渲染一帧后 `toDataURL('image/png')`。

### 2.2 状态 `stageStore`

```ts
{
  open, nodeId, doc, history,
  selectedObjectId, selectedCameraId, viewMode,
  loading, saving, error, dirty
}
```

- `openStage(nodeId)`：读取阶段文件；缺失时创建空场景并重建 stageId。
- `applyCommands(commands)`：`pushStageHistory` + `applyStageCommands`，失败不落盘。
- `undo` / `redo`：使用 StageCommand 历史快照。
- `setActiveCamera`：走命令层，持久化到 `activeCameraId`。
- 自动保存：doc 变化后 500ms 防抖调用 `window.api.stage.save`。
- 保存成功后同步画布节点摘要（对象/机位/镜头数量、activeCameraId）。

### 2.3 画布联动

- `StageNodeView` 的「打开导演台」启用，调用 `openStage(nodeId)`。
- 截图流程：

```text
StageViewport.capture()
  → data:image/png;base64,...
  → window.api.stage.capture({ stageId, dataUrl })
  → ingestAsset 写入 assets/img
  → canvas.addAssetNodes('image', 舞台节点右侧, [asset], '导演台截图', stageNodeId)
  → 自动生成图片节点并连线
```

## 3. 第一批范围（A1）

| 能力 | 状态 |
|---|---|
| 打开全屏导演台 | 本批 |
| 背景色、地面网格、灯光 | 本批 |
| 人体素模、box、sphere、plane、crowd | 本批 |
| 导演视角轨道控制 | 本批 |
| 机位标记、机位视角切换 | 本批 |
| 点击对象/机位选中 | 本批 |
| 右侧只读属性面板 | 本批 |
| 截图回画布 | 本批 |
| 自动保存与重开恢复 | 本批 |
| 拖拽移动/旋转/缩放 | A2 |
| 属性面板编辑 | A2 |
| 添加/删除对象与机位 UI | A2 |
| 运镜时间轴 | A3 |
| 本地白模预演 | A3 |
| glTF 加载、全景背景 | A4 |

## 4. 新增文件

| 文件 | 作用 |
|---|---|
| `src/renderer/src/stage/stageStore.ts` | 导演台打开、加载、命令、历史、保存状态 |
| `src/renderer/src/stage/StageWindow.tsx` | 全屏工作区 |
| `src/renderer/src/stage/StageViewport.tsx` | three.js 渲染内核 |
| `src/renderer/src/stage/StageInspector.tsx` | 只读属性面板 |
| `src/renderer/src/styles/stage.css` | 导演台样式 |
| `src/main/ipc/stage.ts` | 增加 `stage:capture` |
| `src/shared/__tests__/...` | 现有 stage 测试覆盖命令层 |

## 5. 安全与性能

- 截图 data URL 只接受 PNG，大小上限 20MB。
- 场景对象上限沿用 `STAGE_LIMITS`。
- 渲染像素比上限 2。
- 视口不可见时停止动画循环。
- 机位/对象重建使用简单全量重建，A1 对象数量有限；A2 再做增量更新。
- 关闭导演台前补一次保存，避免防抖窗口内丢失。

## 6. 验收

1. 打开导演台节点，看到背景、网格和场景对象。
2. 拖拽旋转、滚轮缩放正常，不影响画布快捷键。
3. 点击对象出现选中框，右侧显示属性。
4. 切换到机位视角，画面按机位位置/FOV 显示。
5. 截图后画布出现图片节点并自动连线。
6. 修改 activeCameraId 后关闭重开仍保留。
7. `typecheck` / `test` / `build` 通过。
