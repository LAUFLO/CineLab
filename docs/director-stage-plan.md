# 导演台方案（待调研）

日期：2026-11-07
状态：**待调研，不进入实现**
关联：LibTV 3D 导演台 / 3D-BOX、TapNow CineMap
注意：剪辑台正在其他会话开发中，本方案不涉及剪辑台实现

## 1. 产品定义

导演台是画布中的轻量级 3D 构图节点，不是完整 3D 建模软件。用户在三维空间里摆放人物素模、道具和机位，切换机位截图，把截图作为分镜/首尾帧参考送回画布。

参考产品已验证的交互：

- 双击画布空白新建「导演台」节点
- 全屏 3D 编辑空间
- 人体素模（男女老少/胖瘦）、基础几何体、群众阵列、本地模型
- 模型移动、旋转、缩放、重命名、颜色
- 多机位：位置、注视目标、FOV、景别
- 机位视角预览 + 截图回传画布
- 720° 全景背景，可上传或 AI 生成
- 角色姿势预设，后续可扩展关键帧
- LibTV 3D-BOX 支持 AI 生成 3D 白模预演视频；TapNow CineMap 强调用一张图搭建可交互 3D 片场

## 2. CineLab 目标

### MVP

- 新节点类型「导演台」，作为画布中的空间构图节点
- 全屏 3D 编辑器和三栏布局：元素列表 / 视口 / 属性
- 内置人体素模（至少 4 体型）、立方体/球体/平面等基础道具
- 变换工具：移动、旋转、缩放
- 多机位管理：新增、选中、FOV、宽高比、注视点
- 机位预览与截图，截图作为图片输出回写节点
- 场景数据随项目保存，可重新打开继续编辑
- 与现有 720 全景查看器/全景图资产联动

### 进阶

- 姿势预设（站/坐/走/跑/格斗等）
- 群众阵列、复制/对齐/吸附
- 上传 glTF/GLB 模型
- 全景背景与影棚/暗场预设
- 截图直接创建分镜组或作为图生视频首帧
- AI Agent 用自然语言修改场景（机位、站位、灯光）
- 3D 预演视频/运镜预览
- 场景与深度/视觉组件联动（白模、深度参考）

### 非目标

- 不做 Blender 级建模、绑定、动画时间线
- 不做云端 3D 生成作为 MVP 前置条件
- 不替代剪辑台；剪辑台由其他会话负责

## 3. 技术方案候选

| 层 | 候选 |
|---|---|
| 3D 渲染 | `three`（已引入）+ 自研相机控制；或 `@react-three/fiber` + `@react-three/drei` |
| 模型 | 内置参数化人体素模（胶囊/关节组合）或开源 low-poly mannequin glTF |
| 场景数据 | 节点 data 内嵌 JSON（模型、变换、机位、背景） |
| 截图 | WebGL renderer `toDataURL` / `readRenderTargetPixels`，走 `ingestAsset` 落盘 |
| 全景背景 | 复用 PanoramaViewer 的球体纹理思路 |
| 存储 | 场景 JSON 作为节点 data 或项目 `stage/*.json`，优先节点内嵌以简化复制/导出 |

## 4. 数据模型草案

```ts
interface DirectorStageData {
  background?: { kind: 'color' | 'panorama'; value: string }
  models: Array<{
    id: string
    type: 'human' | 'box' | 'sphere' | 'plane' | 'gltf'
    name: string
    color?: string
    transform: { position: [number, number, number]; rotation: [number, number, number]; scale: [number, number, number] }
    pose?: string
  }>
  cameras: Array<{
    id: string
    name: string
    position: [number, number, number]
    target: [number, number, number]
    fov: number
    aspect: '16:9' | '9:16' | '1:1'
  }>
  activeCameraId?: string
}
```

## 5. 待调研问题

1. 人体素模自研还是引入 glTF？许可证、体积、可摆姿势能力。
2. 3D 编辑器用原生 three 还是 R3F？与现有 React Flow 画布的层级/性能边界。
3. 截图回传：直接生成图片资产，还是同时生成“机位组”节点？
4. 场景数据放节点内还是独立文件？复制节点、项目导出、版本栈如何兼容。
5. 全景背景与现有全景节点如何复用。
6. AI 生成 3D 白模/预演视频是否进入二期，依赖哪个服务。
7. 性能：多少模型/机位仍可流畅；低端机是否降级。
8. 与剪辑台/Agent 的边界：导演台产出的截图和机位如何进入时间线。

## 6. 交付阶段

1. **调研原型**：three 视口、素模、机位、截图回传画布
2. **MVP**：节点类型、场景保存、4 体型、基础道具、多机位、截图
3. **增强**：姿势、群众、glTF、全景背景、分镜组联动
4. **AI 化**：Agent 修改场景、3D 预演视频、白模生成

## 7. 依赖

- `three` 已因全景查看器引入
- 画布节点 schema 需新增 `stage` 类型
- 项目导出需支持场景内嵌数据（无需额外资产）
- 截图走 `ingestAsset`，与现有图片节点/版本栈一致

## 8. 状态

- 2026-11-07：立项为待调研大需求；不进入当前实现队列
- 剪辑台由其他会话开发中，本方案不触碰
