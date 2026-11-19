# 08 能力清单

日期：2026-11-19
状态：现行
适用版本：v0.3.0
最后核对：2026-11-19

> 只写用户能感知的能力，三档状态：**已实现 / 部分实现 / 仅文档**。
> 「部分实现」表示功能入口存在但行为不完整，方案里不能当已完成。
> 证据只列关键文件或测试；完整清单见 [_generated.md](_generated.md)。

## 已实现（可以当真）

| 模块 | 能力 | 证据 |
|---|---|---|
| 01 | 无限画布、节点、连线、分组、节点工具栏 | `src/shared/canvas-commands.ts`、`canvas-commands.test.ts` |
| 01 | 项目画布打开/保存/多画布 | `src/main/project/`、`src/shared/project-schema.ts` |
| 02 | 多供应商模型配置、生成任务、参数预设 | `src/main/providers/`、`src/main/engine/` |
| 02 | 参考图/视频/音频输入、素材导入 | `src/shared/reference-inputs.ts`、`src/main/assets/` |
| 03 | 时间线、剪辑、转场、关键帧、字幕、音频 | `src/main/timeline/`、`src/shared/timeline-*` |
| 04 | StageDoc、机位、镜头、关键帧、Hermite 插值 | `src/shared/stage-schema.ts`、`stage-timeline.ts` |
| 04 | 语义镜头求解（单/双/群、过肩、不越轴） | `src/shared/stage-shot-intent.ts` |
| 04 | 程序化 Previs 世界（街道/十字/丁字/广场，室内） | `src/shared/previs/` |
| 04 | 整片时间线与镜头重叠/优先级 | `src/shared/stage-program.ts`、`stage-program.test.ts` |
| 04 | 整片播放与整片导出 | `stageStore`、`src/main/stage/export.ts` |
| 04 | 每镜白模片段 | `StageExportItems.clips`、`export.ts` |
| 04 | 每镜关键帧、鸟瞰、镜头表、分镜脚本 | `src/shared/stage-shot-list.ts`、`export.ts` |
| 04 | 10 个光照预设 | `src/shared/stage-lighting.ts`、`StageWindow` |
| 04 | 13 关节骨架 + 17 个动作 | `src/shared/stage-motions.ts`、`stage-figure.ts` |
| 04 | 自动分镜与按对白分镜 | `stage-auto-coverage.ts`、`stage-dialogue.ts` |
| 04 | 单镜预演导出与截图回画布 | `src/main/stage/export.ts`、`StageWindow.tsx` |
| 05 | 拉片、自动镜头检测、分镜表、切片、BGM | `src/main/film-study/`、`stores/film-study.ts` |
| 06 | CineBot 工具、生成提案、会话、技能 | `src/main/agent/` |
| 07 | IPC、preload、设置、素材库、安全、更新 | `src/main/ipc/`、`src/preload/` |
| 10 | 通用 UI 组件库、设置/素材库面板、主题 | `src/renderer/src/components/ui/`、`panels/` |

## 部分实现（别当已完成）

| 模块 | 能力 | 现状 | 证据 |
|---|---|---|---|
| 04 | `gltf` 对象类型 | 未接 GLTFLoader，`assetPath` 未读取，wireframe 人形占位 | `src/renderer/src/stage/stage-scene.ts` |
| 04 | 场景图 → 白膜 | VLM 解析与程序化世界已接；深度校准未接，`depth` 默认为空 | `src/main/scene/analyze.ts`、`src/shared/scene-calibrate.ts` |
| 04 | 舞台对象资产 | 只有 human/box/sphere/plane/gltf/crowd；无家具/建筑/自然资产库 | `src/shared/scene-object-presets.ts` |
| 06 | Agent 运行时 v3（pi） | M1–M3 已接入动态 import、v2 会话、63 工具审计、确认、撤销、自动续跑、前端新事件；M4 canvas/stage 真实模型通过，timeline/film 与正式 asar 待复测 | `src/main/agent/pi/` |

## 仅文档 / 计划中

| 模块 | 能力 | 文档 | 状态 |
|---|---|---|---|
| 04 | glTF 加载 | `docs/stage-previs-upgrade-plan.md` | P2 评估 |
| 04 | 四视图、EDL | 同上 | 按需 |

## 维护规则

1. 能力状态变化时，只改本表，不改方案文档的「已实现」表述。
2. 新增能力：先有代码与测试，再标「已实现」；只有文档的标「仅文档」。
3. 删除能力：从本表移除，并在对应模块文档的「已知限制」里说明。
4. 每季度或每次发版核对一次；`docs/README.md` 的最后核对日期同步更新。
