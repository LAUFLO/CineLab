# 能力一致性治理方案

日期：2026-11-17
状态：已实现
关联：[models.md](models.md)、[architecture.md](architecture.md)、[reference-audio-plan.md](reference-audio-plan.md)

## 1. 问题定性

参考音频暴露的不是单点 bug，而是「能力声明可以随时变成谎言，且没有机制能发现」。

三层叠加：

1. **声明层**：`models.json`、预设、协议模板可以写 `inputs: ['audio']`、`features: ['audio']`、`reference-audio` 槽位。
2. **执行层**：UI、主进程、适配器各自维护媒体白名单，不认识的直接跳过。
3. **观测层**：跳过不报错、不记录、不测试，只有用户实际用到才会发现。

风险会随模型、模板、Agent 入口数量复利增长。

## 2. 已确认缺口

| 级别 | 缺口 | 位置 | 当前行为 |
|---|---|---|---|
| P0 | Agnes Video 2.5 参考视频 | `agnes.ts`、`PromptBar.tsx` | 声明支持 video，适配器不发 `videos`，UI 还拦截 |
| P0 | 图片数量静默丢弃 | `PromptBar.tsx` 图片收集 | 第 4 张起无提示 |
| P0 | 视频数量静默丢弃 | `PromptBar.tsx` 视频分支 | 第 2 个无提示 |
| P0 | Agent 无法提交音频参考 | `agent/tools/generation.ts` | `libraryRefs.kind` 只允许 image/video |
| P1 | `http-template` 无音频占位符 | `http-template.ts` | 模板声明音频也不发送；`refs.images` 还会混入音频 |
| P1 | `features` 无人读取 | `SettingsPanel.tsx` 是唯一读取点 | 纯展示徽章，不驱动执行 |
| P1 | modes 推导出 audio/video | `provider-schema.ts` | 任何 reference 模型都「看起来支持」 |
| P1 | Agnes 分辨率硬编码 | `agnes.ts` | 非 Flash 的 1080P/2K 无法使用 |
| P2 | TTS / 音乐参考音频 | `generateSpeech` / `generateMusic` | 明确报错，功能缺失 |
| P2 | `ReferenceRole` 缺 `voice` | `shared/generation.ts` | 音色参考无语义位 |

## 3. 设计目标

1. **单一能力来源**：模型最终能接收什么，由一张表计算，UI、主进程、Agent、模板共用。
2. **声明与执行强一致**：配置声明了适配器没有的能力，启动和 CI 必须报出来。
3. **入口统一闸门**：不支持的媒体在 `start-generation` 入口报错，禁止透传后静默丢弃。
4. **不可静默**：用户主动连上来的素材被丢弃时，必须有可见提示。
5. **兼容现有配置**：不要求迁移 `models.json`。

## 4. 核心设计

### 4.1 适配器能力表

新增 `src/shared/capabilities.ts`：

```ts
export interface AdapterCapability {
  media: MediaInput[]
  modes: ModelModeId[]
  features: ModelFeature[]
  /** 适配器会读取的参数键；未列出的参数不会生效 */
  params?: string[]
}

export const ADAPTER_CAPABILITIES: Record<string, AdapterCapability>
```

这张表是唯一事实来源，不再从 modes 或 `features` 反推执行能力。

### 4.2 计算有效能力

```ts
export interface CapabilityGap {
  kind: 'input' | 'mode' | 'feature' | 'param'
  value: string
  message: string
}

export interface EffectiveCapabilities {
  media: MediaInput[]
  modes: ModelModeId[]
  features: ModelFeature[]
  gaps: CapabilityGap[]
}

export function effectiveCapabilities(model: ModelDef): EffectiveCapabilities
```

规则：

- 显式 `inputs` 与适配器 `media` 取交集。
- 显式 `modes` 与适配器 `modes` 取交集。
- 显式 `features` 与适配器 `features` 取交集。
- 差集写入 `gaps`。
- 没有显式 `inputs` 时，用适配器能力兜底，不用 modes 推导。

### 4.3 缺口消费

1. 设置页：模型卡片显示「该配置包含执行器未实现的能力」。
2. 启动日志：一次性汇总。
3. CI：`scripts/audit-capabilities.mjs` 遍历预设、协议模板和示例配置，有缺口即失败；允许在 `capability-gaps.json` 显式豁免，必须写原因和到期时间。

## 5. 统一闸门

把 `referenceInputError` 扩展为覆盖所有媒体的 `referenceInputErrors`：

```ts
export interface ReferenceInputContext {
  kind: OutputKind
  adapter: string
  capabilities: EffectiveCapabilities
  imageCount: number
  videoCount: number
  audioCount: number
  hasMask: boolean
  hasKeyframe: boolean
  mode?: ModelModeId
}

export function referenceInputErrors(ctx: ReferenceInputContext): string[]
```

按媒体分组校验，UI 与主进程共用同一套文案。

## 6. 分阶段

| 阶段 | 内容 | 状态 |
|---|---|---|
| P0 止血 | Agnes `videos`、图片/视频数量提示、Agent `libraryRefs` 加 audio、`http-template` 加 `refs.audios` 并修正 `refs.images` 混入音频 | 已完成（真实生成受余额限制） |
| P1 能力模型 | `capabilities.ts`、`effectiveCapabilities`、缺口报告、设置页提示、错误分类（401/402/403） | 已完成（核心） |
| P2 入口统一 | `referenceInputErrors`、UI 槽位/数量按能力表渲染、模式与参数按能力过滤 | 已完成（核心；参数过滤与特性拆分留 P3） |
| P3 门禁 | 审计脚本、CI、一致性单测、每种媒体一条 e2e | 已完成 |

## 7. P0 改动清单

### Agnes 参考视频

- `src/main/providers/agnes.ts`：`buildAgnesBody` 增加视频参数，reference 模式构造 `videos: [{ url, start_seconds: 0, require_audio: false }]`；Flash 模型不发送 `videos`。
- `src/main/engine/start-generation.ts`：`generateVideoAgnes` 调用传入 `video`。
- `src/renderer/src/canvas/PromptBar.tsx`：视频参考的适配器检查允许 `agnes-video`。
- `src/main/engine/reference-inputs.ts`：`hasSourceVideo` 按模型 `inputs` 校验，Agnes Flash 拒绝，2.5 放行；新增 `hasVideoOperation` 区分参考视频与视频编辑，只有视频编辑拒绝音频。

### 数量上限

- `PromptBar.tsx`：移除图片 3/4 张、音频 8 段的应用层上限，数量交给供应商 API 校验。
- 视频受 `GenerateRequest.video` 单数字段限制，第 2 个视频显示「参考视频仅支持 1 个」。
- `project-schema.ts`：`refOrder` 上限 8 → 64，避免素材增多后排序保存失败。
- `start-generation.ts`：32 个安全上限从静默截断改为明确报错。

### Agent 音频参考

- `src/main/agent/tools/generation.ts`：`libraryRefs.kind` 接受 `audio`。
- 转换 `GenerateRequest.refs` 时带上 `media`。

### http-template 音频

- `src/main/providers/http-template.ts`：`ImageRef` 增加 `media`；新增 `refs.audio` / `refs.audios`；`refs.images`、`refs.frames`、`refs.subject`、`refs.style` 排除音频。
- `src/main/providers/model-body.ts`：`extraBody` 同样支持 `refs.audio` / `refs.audios`，图片 token 排除音频。

### P0 实测记录

- 隔离实例验证：3 张图 + 参考视频 + 参考音频同时显示；数量上限移除后，6 张图全部保留。
- 标准版参考视频请求已通过主进程校验和适配器构造，调用 Agnes API 后返回 403 `insufficient_user_quota`（账户余额 ¥0.1，预扣需要 ¥0.6），真实生成待余额充足后补测。
- 发现 403 配额错误被映射成「API Key 无效或没有权限」，已列入 P1 错误分类。

### P1 实现记录

- 新增 `src/shared/capabilities.ts`：适配器能力表、`resolveAdapter`、`effectiveCapabilities`、`CapabilityGap`。
- `model-modes.ts`：`reference-video` / `reference-audio` 标记 `optional`，不再从 modes 推导输入能力。
- `provider-schema.ts`：显式 `inputs` 优先于 modes；Agnes 的 modes 分支补回 audio / video 白名单。
- `models-config.ts`：用户显式 `inputs` / `operations` 优先；`provider-presets.ts` 的推荐模型不再携带旧 `inputs`。
- `reference-inputs.ts`：改用 `effectiveCapabilities(model).media`，Flash 的 video 在能力层被过滤。
- 新增 `src/main/engine/generation-error.ts`：401 / 402 / 403 / 429 分类，配额错误优先于通用鉴权错误。
- `SettingsPanel.tsx`：模型卡片显示「N 项能力未实现」，title 列出具体缺口。
- 新增 `src/main/settings/capability-report.ts`：启动时汇总缺口写入日志。
- 验证：启动日志检测到 `agnes-video-2.5-flash` 的 video 缺口；设置页显示「1 项能力未实现」；截图仅保留在本地 `.opencode/handover/evidence/capability-consistency/p1-gap.png`，不入库。

### P2 实现记录

- 新增 `src/shared/reference-inputs.ts`：统一闸门移到共享层，`referenceInputErrors` 返回全部命中错误，`referenceInputError` 保留首条兼容主进程。
- 删除 `src/main/engine/reference-inputs.ts`，主进程改用 `@shared/reference-inputs`。
- `PromptBar.tsx`：
  - `activeMissing`、`availableModes`、音频/视频槽位可见性、extra 兜底全部改用 `effectiveCapabilities`。
  - `handleSend` 改为调用 `referenceInputErrors`，不再维护一套独立的检查。
  - 能力表不支持的媒体不再进入槽位条，由模型芯片显示「不支持视频/音频」。
- 测试迁移到 `src/shared/__tests__/reference-inputs.test.ts`，新增多错误返回和模式不支持用例。
- UI 验证：Agnes Flash 连接参考音频和参考视频，全能参考模式只显示「参考音频」槽位，模型芯片显示「不支持视频」；截图仅保留在本地 `.opencode/handover/evidence/capability-consistency/p2-slots.png`，不入库。

### P3 实现记录

- 新增 `capability-gaps.json`：豁免文件，必须写原因和 `expiresAt`，过期自动重新失败。
- 新增 `src/shared/__tests__/capability-audit.test.ts`：遍历 `MODEL_PRESETS`、推荐模型和 `PROTOCOL_TEMPLATES`，计算 `effectiveCapabilities` 的 gaps，未豁免即失败。
- `package.json` 新增 `audit:capabilities` 脚本；CI 的 `pnpm test` / `test:coverage` 已自动包含该测试，无需新增 workflow。
- 审计发现并修复的真实缺口：
  - `kling-video` 模板声明了 `reference` / `video-edit` / `video-extend`，但 `kling.ts` 只实现首尾帧；移除未实现声明。
  - `kling-v2-5-turbo` 预设同步移除 `reference`。
  - `http-template` 能力表补上 `t2i` / `i2i` / `layer` 和 `audio` / `last-frame` 特性。
  - `openai-compat` 能力表补上 `sequential` 特性。
- 结果：`pnpm audit:capabilities` 0 缺口。
- 特性拆分：`capabilities.ts` 新增 `ModelInputFeature` / `ModelOutputFeature` 和 `normalizeFeatureSets`；`audio` 在 Agnes 上归为 `reference-audio` 输入，在其他视频模型上归为输出音频。配置格式保持兼容，旧 `features` 自动映射。
- 参数能力：`AdapterCapability.params` 声明适配器实际读取的参数；`effectiveCapabilities` 新增 `param` 缺口。审计发现 `ark-video` 的 `return_last_frame` / `output_format` 未被 `volcengine-video` 读取，已移除。
- 媒体 e2e：新增 `e2e/capability.spec.ts`，预置 3 图 + 音频 + 视频，断言图片/音频槽位数量、Flash 不支持视频、切换标准版后视频槽位出现。
- 槽位锚点：`PromptBar` 增加 `data-testid="promptbar-slots"` 和 `data-slot-kind`，供 e2e 精确断言。

## 8. 验收标准

1. `typecheck`、`test`、`lint`、`check:docs`、`build` 通过。
2. Agnes 2.5 参考视频可创建任务；Agnes Flash 带视频明确报错。
3. 连 6 张图时 6 张全部保留，不再截断；第 2 个参考视频显示明确提示。
4. Agent `libraryRefs` 可提交音频，主进程行为与 UI 一致。
5. `http-template` 的 `refs.audios` 可取值，`refs.images` 不再混入音频。
6. UI 冒烟覆盖上述四条。

## 9. 风险与边界

- 不改 `models.json` 格式，`features` 暂时保留展示。
- 不做全量 provider 重构，适配器签名只增量修改。
- 不实现 TTS 音色参考，本期只保证明确报错。
- `http-template` 的 token 扩展是增量，已有模板不受影响。
- 豁免机制必须带到期时间。
