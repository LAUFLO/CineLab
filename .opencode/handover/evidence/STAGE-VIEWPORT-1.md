# STAGE-VIEWPORT-1 · 导演台 3D 视口（A1）

日期：2026-11-09
状态：完成
范围：全屏导演台、原生 three.js 视口、对象/机位渲染、视角切换、截图回画布、自动保存
关联：`docs/director-stage-viewport-plan.md`、`STAGE-NODE-STORAGE-1`

## 1. 技术路线

按 A 路线：**原生 three.js 渲染内核 + React 外壳**。

```text
StageWindow        全屏工作区、顶栏、左右面板、保存与截图
StageViewport      three Scene / Camera / Renderer / OrbitControls / Raycaster
StageInspector     对象、机位、场景只读属性
stageStore         打开、命令、历史、脏标记、截图 handler
```

## 2. 实现

### 2.1 全屏工作区

- `StageNodeView` 的「打开导演台」和双击卡片启用。
- `StageWindow` 通过 portal 渲染 `.stage-window`，布局：
  - 顶栏：返回、场景名、保存状态、导演/机位视角切换、当前机位、截图到画布、关闭。
  - 左栏：对象、机位、镜头列表。
  - 中间：three.js 视口。
  - 右栏：选中对象/机位/场景只读属性。
- `studio/scope.ts` 的快捷键让位检查扩展为 `.studio-window, .stage-window`。
- Esc 关闭；Ctrl/Cmd+Z 撤销；Ctrl/Cmd+Shift+Z 重做。

### 2.2 three.js 渲染内核

- 透视相机 + `OrbitControls`（拖拽旋转、滚轮缩放、俯角限制）。
- 背景色、地面网格、环境光、平行光。
- 对象：
  - human：胶囊身体 + 球头。
  - box / sphere / plane。
  - crowd：按 count 生成多个素模。
  - gltf：暂时显示线框素模占位。
  - 颜色、可见性、位置/旋转/缩放。
- 机位：
  - 每个机位显示球体标记 + 到注视点的连线。
  - 选中机位标记变绿。
  - 机位视角按 position / target / fov 摆放独立相机。
- 拾取：
  - Raycaster 点击对象或机位标记。
  - 拖拽超过 5px 不触发选中，避免和轨道控制冲突。
- 选中高亮：`BoxHelper`，机位视角下隐藏。
- 截图：`preserveDrawingBuffer` + 渲染一帧后 `toDataURL('image/png')`。

### 2.3 状态与保存

- `stageStore`：
  - `openStage(nodeId)` 读取场景；文件缺失时创建空场景并更新节点 stageId。
  - `applyCommands` 走 `StageCommand`，成功后压入历史、标脏、同步节点摘要。
  - `undo` / `redo` 使用 StageCommand 快照。
  - `setActiveCamera` 走命令层并持久化。
- 自动保存：doc 变化后 500ms 写盘；关闭时补一次保存。
- 保存后画布节点摘要更新：对象/机位/镜头数量、activeCameraId。

### 2.4 截图回画布

新增 `stage:capture` IPC：

- 只接受 `data:image/png;base64,`。
- 大小上限 20MB。
- 必须存在对应场景文件。
- 使用 `ingestAsset` 写入 `assets/img`。

渲染进程截图后调用 `canvas.addAssetNodes('image', 舞台节点右侧, [asset], '导演台截图', stageNodeId)`，自动创建图片节点并连线。

## 3. 验证

### 3.1 自动化

```text
31 test files, 211 tests passed
typecheck 通过
build 通过，主进程约 449KB
```

### 3.2 真实 UI（隔离实例）

测试场景：4 个对象（人物 A/B、桌子、球体）、2 个机位、1 个镜头。

```text
点击「打开导演台」
→ .stage-window 出现
→ 左栏：4 对象 / 2 机位 / 1 镜头
→ 右栏默认显示 activeCameraId 对应机位 2
→ canvas 662×656，WebGL 正常渲染

点击左栏「人物 A」
→ 右栏显示对象属性：位置 -1.20, 0.00, 0.00；旋转 0.00, 0.40, 0.00；姿势 stand

点击机位 2
→ 顶栏「机位 2 · 侧面 · 35°」
→ 视角切到机位视角
→ canvas 截图数据长度由 353038 变为 256634，画面确实变化

点击「截图到画布」
→ 画布节点 7 → 8
→ 生成「导演台截图 1」图片节点
→ assets/img 新增 192457 字节 PNG
→ 画布连线数 +1

关闭导演台
→ 节点摘要更新为「4 对象 · 2 机位 · 1 镜头」
→ 场景文件 activeCameraId=cam_2

再次打开
→ 默认选中机位 2，导演视角恢复
```

截图：`.opencode/handover/evidence/STAGE-VIEWPORT-1.png`。

## 4. 已知限制

- 属性面板只读，拖拽变换、添加/删除对象和机位在 A2。
- glTF 只显示线框占位，未加载真实模型。
- 全景背景只渲染纯色，未接 720° 全景。
- 镜头尚未播放运镜，本地白模预演在 A3。
- 对象/机位全量重建，A1 对象数量有限；A2 再做增量更新。
- 截图使用当前视口分辨率，导出尺寸与窗口大小相关。

## 5. 下一步

1. `stage.*` Agent 工具：get / capabilities / addObject / transformObject / addCamera。
2. A2 手动编辑：拖拽变换、属性面板、添加/删除对象与机位。
3. A3 运镜时间轴与本地白模预演。
