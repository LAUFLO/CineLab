# CLIP-STUDIO P0：时间线内核

日期：2026-11-07
状态：完成
验证：`corepack pnpm typecheck`、`corepack pnpm test`（54 个用例全过）

## 交付

| 文件 | 职责 |
|---|---|
| `src/shared/timeline-schema.ts` | 时间线类型、zod 校验、常量、工厂函数 |
| `src/shared/timeline-edit.ts` | 插入/覆盖、移动、裁剪、切割、删除、闭合空隙、linkage |
| `src/shared/timeline-commands.ts` | `TimelineCommand`、`applyCommand`、`applyCommands`、摘要、片段工厂 |
| `src/shared/timeline-layout.ts` | 像素↔毫秒、缩放锚点、可视区、标尺刻度、时间码 |
| `src/shared/timeline-history.ts` | 快照撤销栈、dispatch、undo/redo |
| `src/shared/__tests__/timeline-*.test.ts` | 5 个测试文件，39 个用例 |

## 数据模型

- 所有时间字段为毫秒整数：`startMs / durationMs / sourceStartMs / atMs`。
- 轨道顺序：字幕在上，V2 在 V1 上，音频在最下。
- 主轨 = 视频轨中最靠下的一条（V1）。
- `TimelineCommand` 17 种，`batch` 一次只产生一个历史步。
- 快照历史上限 50，与画布一致。

## 已实现的编辑语义

| 能力 | 行为 |
|---|---|
| 插入 | 在指针处切开片段，后续整体后移 |
| 覆盖 | 挖掉目标区间，保留两侧边缘 |
| 移动 | 默认插入；`overwrite` 时覆盖目标区间 |
| 裁剪 | 头尾分别处理，头部同步 `sourceStartMs` |
| 切割 | 前半保留原 id，后半新 id，关键帧按比例拆分 |
| 删除 | 默认留空隙；主轨片段删除自动 ripple |
| 闭合空隙 | 按顺序紧贴排列 |
| 磁性 | 主轨删除/移动时闭合，其他轨靠 linkage |
| linkage | 落在主轨片段区间内的字幕/音频/叠加层跟随平移 |

## 测试覆盖

- 插入、覆盖、移动、裁剪、切割、删除、闭合空隙、linkage。
- 命令层：不修改入参、批量顺序、变速、分离音频、主轨保护、摘要。
- 布局：缩放锚点、可视区过滤、标尺分级、时间码。
- 撤销：单步、batch 单步、redo 清空、历史上限。

## 已知限制

- P0 只有纯逻辑，没有 UI 和持久化接线。
- linkage 目前只处理「平移跟随」，删除主轨片段时不会自动删除依附片段。
- 关键帧在切割时按比例拆分，但曲线插值尚未实现。
- 变速只调整时间线时长，音高保持留给渲染层。
- `detachAudio` 生成的音频 clip 指向原视频文件，渲染时只取音轨。

## 下一步

P1 编辑器：时间线 UI、拖拽/裁剪/切割手感、吸附、缩放、播放头、快捷键作用域、节点工具栏瘦身。
