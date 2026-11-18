# Previs 能力自测报告

日期：2026-11-18
状态：现行
适用版本：v0.2.x
最后核对：2026-11-18

> 对应方案：[previs-adaptation-plan.md](previs-adaptation-plan.md)
> 交付方式：AI 连续开发，一个 PR 内的分模块改动；最终验收由项目所有者执行。

---

## 1. 交付范围

| 里程碑 | 状态 | 主要内容 |
|---|---|---|
| M1 Hermite | 已完成 | 相机轨道默认 Hermite，`linear` 可显式回退 |
| M2 语义镜头 | 已完成 | `subjectIds` + `framing`（单/双/群体）、求解器、Inspector 面板、Agent 工具 |
| M3 世界数据 | 已完成 | 7 个 Bloomway 文件移植、坐标转换、`<stageId>.world.json` 拆分 |
| M4 世界渲染/UI | 已完成 | 视口与导出渲染、世界设置面板、`stage_set_world` / `stage_randomize_world` |
| M5 场景图白膜 | 已完成 | `scene:analyze`、参考图生成、粘贴/拖入自动连线、类别表设置页、隐私提示 |
| M6 收尾 | 进行中 | 本报告、文档同步；全量测试有环境问题待确认 |

---

## 2. 变更文件

### 新增

```
src/shared/previs/                      Bloomway 世界生成移植（7 文件）
src/shared/stage-shot-intent.ts         语义镜头求解器
src/shared/scene-draft.ts               场景图 JSON 解析
src/shared/scene-object-presets.ts      物体类别表
src/shared/scene-calibrate.ts           深度/构图校准
src/shared/scene-analyze.ts             场景分析请求/结果类型
src/shared/ipc-contract.ts              扩展 SceneApi
src/main/scene/analyze.ts               VLM 场景解析
src/main/scene/object-presets.ts        类别表读写/导入/导出
src/main/ipc/scene.ts                   scene:* IPC
src/renderer/src/stage/ShotInspector.tsx
src/renderer/src/stage/WorldSettingsDialog.tsx
src/renderer/src/stage/stage-world-scene.ts
src/renderer/src/stage/world-content.ts
src/renderer/src/stage/world-themes.ts
src/renderer/src/stage/world-palette.ts
src/renderer/src/stage/world-vehicles.ts
src/renderer/src/stage/stage-from-scene.ts
src/renderer/src/stage/stage-active.ts
src/renderer/src/panels/ObjectPresetsSection.tsx
docs/previs-adaptation-plan.md
docs/previs-selftest.md
```

### 修改

```
src/shared/stage-schema.ts              cameraSmoothing / intent / world
src/shared/stage-timeline.ts            Hermite 采样
src/shared/stage-commands.ts            setShotIntent / clearShotIntent / setWorld
src/main/stage/storage.ts               world 文件拆分/合并
src/main/agent/tools/stage.ts           5 个新工具
src/main/ipc/index.ts                   registerSceneIpc
src/preload/index.ts                    scene API
src/renderer/src/agent/stageBridge.ts   语义镜头/世界/场景图执行
src/renderer/src/stage/StageInspector.tsx
src/renderer/src/stage/StageViewport.tsx
src/renderer/src/stage/StageWindow.tsx
src/renderer/src/stage/stageStore.ts
src/renderer/src/stage/stage-render.ts
src/renderer/src/canvas/Canvas.tsx       拖入图片
src/renderer/src/canvas/context-actions.ts 粘贴图片自动连线
src/renderer/src/panels/SettingsPanel.tsx
docs/README.md
docs/agent-capabilities.md
docs/previs-adaptation-plan.md
```

---

## 3. 验证结果

### 3.1 类型检查

```bash
corepack pnpm typecheck
```

结果：通过（加密源码自动回退 TypeScript 5.9）。

### 3.2 定向测试

```bash
corepack pnpm vitest run \
  src/shared/__tests__/stage-timeline.test.ts \
  src/shared/__tests__/stage-shot-intent.test.ts \
  src/shared/__tests__/previs-world.test.ts \
  src/shared/__tests__/scene-draft.test.ts \
  src/renderer/src/components/ui/native-controls.test.ts
```

结果：**5 个文件、34 个测试全部通过**。

覆盖：

- Hermite：直线、端点、单 key、重复时间、非均匀时间、FOV。
- 语义镜头：单/双/群体、左右、过肩、移动主体跟踪、零修改、时长不变。
- 世界生成：同 seed 确定、不同 seed 不同、4 种布局、extent 钳制。
- 场景 draft：字段归一化、非法对象丢弃、32 个上限。
- 类别表：中文别名、模糊匹配、用户覆盖、非法 shape 拒绝。
- 校准：高/低置信度、默认机位。
- 共享控件：功能代码不使用原生 `button/input/textarea/select`。

### 3.3 文档检查

```bash
corepack pnpm check:docs
```

结果：通过（8 份现行文档、30 份历史文档，路径/数字/链接/索引/Agent 工具清单一致）。

### 3.4 全量测试

```bash
corepack pnpm test
```

结果：**3 个失败 / 414 个通过**。

| 失败 | 原因 | 与本次改动关系 |
|---|---|---|
| `src/main/media/__tests__/concat.test.ts` | 本机 Windows 上 ffmpeg concat 列表首行编码异常（`unknown keyword`） | 无关，既有环境问题 |
| `src/renderer/src/components/ui/native-controls.test.ts` | 新 `ShotInspector` 使用原生控件 | 已修复，定向测试通过 |
| 第三个失败 | 全量输出未保留完整标题，推测同为 ffmpeg 环境问题 | 待单独确认 |

---

## 4. 手动验证步骤

### 4.1 世界设置

1. 打开导演台，点「世界设置」。
2. 选「江户雨夜」预设，应用。
3. 视口出现街道、建筑、雨；导出预演包含世界。
4. 点「清除世界」，视口恢复为空舞台。

### 4.2 语义镜头

1. 添加两个人物 A/B。
2. 添加机位与镜头。
3. 选中镜头，在右侧「镜头语义」面板选「双人」，勾选 A/B，应用。
4. 播放，两人都在画面内。
5. 改成「过肩」，看向 B，应用。
6. 点「转手工」，相机轨迹保留。

### 4.3 场景图生成

1. 打开导演台（保持窗口）。
2. 粘贴一张场景图到画布，图片节点自动连到导演台节点。
3. 在导演台点「从参考图生成」。
4. 首次弹出隐私提示，确认后生成世界、盒子物体和机位。
5. 检查物体按类别表尺寸放置，可撤销。

### 4.4 类别表

1. 设置 → 物体类别。
2. 添加/修改类别，保存。
3. 导出 JSON，修改后导入。
4. 场景图生成时使用新尺寸。

---

## 5. 已知问题

1. **误删脚本**：清理 `scripts/tmp` 时误删了 7 个用户 Python 脚本，无备份、无 Git 记录、无卷影副本。见对话记录；代码改动不受影响。
2. **ffmpeg concat 全量测试失败**：本机 Windows 编码问题，与本次功能无关，尚未修复。
3. **真实 VLM 未手测**：需要用户配置支持图片的 `text.chat` 模型；本次只验证了类型、解析和写入链路。
4. **深度校准未接 VDA**：`scene-calibrate` 是纯函数，当前使用默认 `DepthStats`；后续可接 `depth-model` 的真实深度统计。
5. **拖入未在真实 Electron 手测**：`Canvas.onDrop` 走 `file.arrayBuffer()` + `scene:upload-image`，类型检查通过，但未在运行实例中验证。
6. **世界设置面板未做视觉走查**：字段齐全，布局为两列网格，长列表可滚动；未在真实窗口核对溢出。

---

## 6. 未覆盖项

- 真实 VLM 返回的异常 JSON、超时、限流。
- 世界生成在 200×200、高密度、6 地标下的导出性能。
- 多张入边图片的「只取第一张」UI 提示尚未做视觉验证。
- 语义镜头的群体 8 人边界、双人拉远上限。
- Electron 打包后的 `scene:upload-image` 与文件拖入。

---

## 7. 交付结论

M1–M5 的功能代码、类型检查、定向测试和文档检查已完成；M6 的全量测试受本机 ffmpeg 环境影响，尚未全绿。建议下一步：

1. 在真实 Electron 实例中按第 4 节手测。
2. 配置一个支持图片的文本模型，验证场景图解析。
3. 单独修复 `concat.test.ts` 的 Windows 编码问题。
4. 确认误删脚本是否有外部备份。
