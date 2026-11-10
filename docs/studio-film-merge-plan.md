# 剪辑室与成片节点合并方案

状态：已完成（2026-11-09）

## 背景

旧版画布里每个剪辑室都自动派生一个独立的「成片」节点：

```
素材 → 剪辑室（timelineId）→ 成片（film 节点）
```

成片与剪辑室严格 1:1，左侧接口不可连线，用户无法手动创建。它本质上是剪辑室节点的输出视图，独立成节点只带来额外节点、额外连线和一整套状态同步逻辑。

## 目标

把成片并回剪辑室节点，画布语义变为：

```
素材 → 剪辑室（内部时间线 + 成片输出）→ 下游
```

## 数据结构

`StudioNodeData` 新增：

- `filmStatus`：`pending | rendering | ready | stale | empty | missing`
- `outputs`：成片版本列表 `OutputRef[]`
- `selectedOutputId`：当前查看的版本
- `upstreamAck`：上次导出时的上游输出签名

保留 `filmNodeId`、`FilmNodeData` 作为旧项目读取兼容，不再创建新的 film 节点。

## 节点 UI

剪辑室节点固定 480×368（内容 340 + 标题 28）：

1. 标题栏：状态徽标
2. 16:9 成片预览：静帧 + 播放按钮（全屏 `VideoPlayer`）；无成片时为空状态
3. 摘要行：片段数 / 时长 / 分辨率 + 多版本切换
4. 操作条：剪辑室、VTT、编码（H.264 / HEVC / AV1）、生成成片 / 重新生成 / 取消
5. 双击卡片进入剪辑室；右侧 source handle 输出成片给下游

## 迁移

`loadCanvas` 加载项目时执行一次、幂等：

1. 找到每个 film 节点的 `studioNodeId` 对应剪辑室
2. 把 `outputs / selectedOutputId / filmStatus / upstreamAck` 并入剪辑室
3. film 的下游边改写成「剪辑室 → 下游」
4. 删除「剪辑室 → 成片」边与 film 节点
5. 找不到剪辑室的孤儿 film 降级为普通视频素材节点，保留全部 outputs
6. 旧剪辑室尺寸（360 宽）统一迁移到 480×368

迁移会写回项目文件，不可逆；成片文件本身不受影响。

## 状态同步

- `syncStudioAfterSave`：直接更新剪辑室的 `clipCount / durationMs / filmStatus`，不再创建节点
- 时间线清空但已有成片：标记 `stale`，保留成片可预览 / 下载
- `UpstreamWatcher` 与 `StudioWindow` 的 stale 检测读剪辑室自身的 `filmStatus / upstreamAck`
- 删除剪辑室：有成片时提供「保留成片为视频节点 / 一起删除」
- 右键菜单：进入剪辑室、下载成片
- 资产移动：同步剪辑室成片路径

## 验证

- 构造含 film 节点的旧项目：迁移后 film 节点消失、剪辑室显示成片、下游边改写到剪辑室
- 生产构建（electron-vite preview）实测 32 节点 / 19 条边正常渲染
- `typecheck`、145 个测试、`build` 通过
