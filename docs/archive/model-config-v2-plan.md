# 模型配置 v2：从「配置文件编辑器」到「能力向导」

日期：2026-11-14
状态：历史（2026-11-16 归档）
关联：[models.md](../models.md)、[video-operations-plan.md](video-operations-plan.md)

## 1. 背景

模型配置是 CineLab 最前置的功能：没有模型，画布上任何生成都无法开始。但当前实现更像「`models.json` 的图形编辑器」，而不是「帮用户把模型用起来的向导」。

现有问题集中在六处：

1. **三类字段混在同一层**：用户必须懂的（API Key）、预设该代劳的（Base URL、remoteModel）、只有开发者才该碰的（`extraBody`、`omitBody`、`http-template`）平铺在同一个表单里。
2. **能力声明太粗**：模型只有 `inputs: ['text', 'image', 'video', 'audio']`，无法表达首帧、尾帧、参考图、源视频、蒙版等角色差异。
3. **`capability` 是单选**：Seedream 5.5 同时支持文生图、图生图、多参考图、图层拆分，却只能标成 `image.t2i`。
4. **参数没有约束**：`ParamDef` 只有 type/default/min/max/options，无法表达「仅编辑模式出现」「首尾帧必须 adaptive」「图层拆分不能带 background」。
5. **模型预设不可持续**：每出一个新模型就要加一条完整预设，维护速度跟不上厂商发版。
6. **配置结果没有确定性**：测试连接只验证 `/models`，不验证模型能力；生成失败也不会回链到具体配置项。

目标：**用户选供应商、填 Key、勾模型，剩下的由协议模板代劳；每个字段都能用一句人话解释；配完能验证，错了能定位。**

## 2. 已确定的决策

| 编号 | 决策 | 理由 |
|---|---|---|
| D1 | 不做全量模型预设，改为「供应商预设 + 协议模板 + 模型条目 + 指纹规则」 | 模型迭代速度不是应用发版能跟上的；协议变化慢，适合做模板 |
| D2 | 能力以「模式」为核心，不以媒体类型为核心 | 各家 API 都是按互斥的生成模式组织能力 |
| D3 | 9 个归一化模式：`t2i`、`i2i`、`t2v`、`first-frame`、`first-last`、`reference`、`video-edit`、`video-extend`、`layer` | 覆盖调研样本的全部输入契约；组图作为输出特性，不单列模式 |
| D4 | 参数约束做完整版：模式过滤、条件可见、条件锁值、互斥 | 已知规则无法用简单枚举表达，否则会出现「预设想给 5–10 秒、官方其实是 -1 或 4–30」的错配 |
| D5 | 变体独立成 `ModelDef` 条目，`family` 只用于 UI 分组 | Veo Standard/Fast、Seedream 5.5/5.0、MiniMax H3/H3-Highspeed/H3-Lite/H3-Max 的能力不同，不能按系列声明 |
| D6 | 视频操作从「模型级布尔数组」改为「模式级支持级别」 | 参考视频输入是必要不充分条件；原生编辑、提示词模拟、不支持必须区分 |
| D7 | 视频操作不再和 `adapter` 绑定 | 现有逻辑只允许 `http-template`，反而排除了 Seedance 的原生编辑能力 |
| D8 | 设置页去掉配置文件路径/重新加载/打开文件，收进「高级」 | 普通用户不会手写 JSON，这些是开发者入口 |
| D9 | 提供单文件 `SKILL.md`，用户下载后交给任意 Agent | 降低新协议/新模型的接入成本；Agent 读文档比人填字段更准 |
| D10 | Skill 不处理 API Key，只处理供应商与模型定义 | Key 在应用内加密保存，不应经过第三方 Agent |

## 3. 调研结论

调研范围：火山方舟、OpenAI、可灵、Vidu、MiniMax、Google Veo、阿里万相、Gemini 图像、Suno 的官方 API 文档。

### 3.1 代表模型能力矩阵

| 模型 | 模式 | 输入槽位 | 输出/特殊能力 | 关键约束 |
|---|---|---|---|---|
| Seedream 5.5 | 文生图 / 图生图 / 多参考图 / 图层拆分 | 参考图 0–10；图层拆分仅 1 张 | 组图、1 底图 + 99 图层、富文本 OCR、原生 RGBA | 图层拆分禁传 `background`；透明背景需 PNG；2026-11-15 API 上线 |
| Seedream 5.0 pro/flash | 同上，无 OCR | 参考图 0–10 | 图层最多 16；RGBA 图生图仅 1 张透明 PNG | 同上 |
| Seedance 2.5 | 文生 / 首帧 / 首尾帧 / 全模态参考 / 视频编辑 / 视频延长 | 参考图 0–30、参考视频 0–10、音频 0–10；首帧 1；首尾 1+1 | 有声/无声、尾帧、mov | 首尾帧与全模态参考互斥；首尾帧 `ratio=adaptive`；编辑 `duration=-1` |
| Seedance 2.5 flash | 同 2.5，速度优先 | 同 2.5 | 速度翻倍、价格更低 | 2026-11-15 API 上线 |
| Seedance 2.0 | 文生 / 首帧 / 首尾 / 全模态参考 | 参考图 0–9、视频 0–3、音频 0–3 | 4K | 音频不能单独输入 |
| Sora 2 | 文生 / 首帧锚点 | `input_reference` 1 张 | 带音频、角色引用 | 官方 API 已于 2026-09-24 关停 |
| Vidu Q4 | 图生 / 参考生 | 参考图 1–15、参考音频 0–3 | 2K/4K、最长 16s | Q4 Preview；旧版 Q2 支持首尾帧 |
| 可灵 4.0 | 文生 / 首帧 / 首尾 / 参考生 / 视频编辑 / 延长 | 参考素材最多 15（图/视频/元素/声音）；关键帧最多 10 | 4K、1080p HDR、21:9、30s、原生音频 | 模式互斥；4.0 Flash 为速度变体 |
| MiniMax H3 | 文生 / 首帧 / 尾帧 / 首尾 / 参考生 | 参考图 ≤9、参考视频 ≤3、参考音频 ≤3；首帧 1、尾帧 1 | 2K、24fps、原生立体声 | 首尾帧与参考生互斥；文生 `ratio` 不能 `adaptive`；图生 `ratio` 强制 `adaptive` |
| MiniMax H3-Image | 文生图 / 图像编辑 | 参考图 1–16 | 4K 图像、流式输出 | — |
| Veo 3.1 | 文生 / 首帧 / 首尾 / 参考图 | 参考图 0–3 | 原生音频、1080p | Fast 变体不支持参考图；尾帧要求 8s |
| Wan 3.0 | 文生 / 首帧 / 首尾 / 参考生 / 视频编辑 / 延长 | 多模态素材最多 20（图/视频/音频/文档/网页） | 30s、1080p、30fps、原生台词/BGM/音效 | All-in-One，模式统一 |
| GPT Image 2.6 | 文生 / 编辑 / 多图编辑 | 参考图多张 + mask | 透明背景、webp、GIF | 编辑走 `/images/edits` |
| Nano Banana 2.1 | 文生 / 编辑 / 多轮编辑 | 参考图 0–14（4 角色 + 10 物体） | 1K/2K/4K、14 种比例 | — |
| Qwen-Image 3.0 | 文生图 / 图像编辑 | 参考图 0–9 | 复杂排版、原生透明 | — |
| Runway Gen-4.5 | 文生 / 图生 | 首帧 1 | 最长 10s | API 按 credits |
| Luma Ray 3.2 | 文生 / 图生 / Modify | 首帧 1、源视频 1 | 5–10s、1080p HDR | Modify 保留源音频 |
| FLUX.2 | 文生图 / 图生图 | 参考图 0–N | klein / pro / max 变体 | 按变体区分质量与速度 |
| Ideogram 4.5 | 文生图 / 精确编辑 | 参考图 1–N | 原生 2K、多轮编辑 | — |

### 3.2 差异的五个层次

1. **模式**：文生、首帧、首尾帧、参考生、编辑、延长、图层拆分。互斥。
2. **槽位**：每个模式收哪些素材、什么角色、几张、是否必填。
3. **参数约束**：枚举、范围、档位、依赖模式、互斥。
4. **输出形态**：组图、图层、OCR、RGBA、音频、尾帧、多镜头。
5. **变体**：同系列不同型号，能力不同，必须独立声明。

### 3.3 视频输入的三种语义

当前 `inputs: ['video']` 把三种语义混成一种：

| 语义 | 含义 | 典型字段 |
|---|---|---|
| 参考视频 | 学动作、运镜、风格，生成新视频 | `reference_video` |
| 源视频 | 被编辑的对象，要求其他部分保持不变 | `source_video` / `reference_video` + edit 意图 |
| 待延长视频 | 续写的起点或终点 | `reference_video` + extend 意图 |

「能收参考视频」只说明第一种。片段重拍、元素替换、智能续写必须显式声明。

### 3.4 行业状态

- **Sora 2 官方 API 已于 2026-09-24 关停**。现有 Sora 适配只对中转站和兼容网关有意义。
- **MiniMax H3 是当前主推视频模型**，Hailuo 2.3 / 2.3 Fast / 02 已被官方标记为 Legacy；H3-Image 于 2026-11-10 发布。
- **可灵 4.0 于 2026-10-16 全量上线**，支持 30 秒、4K、15 个参考素材、10 个关键帧；3.0 系列退居上一代。
- **Vidu Q4 Preview 于 2026-10-08 发布**，参考图 1–15、参考音频 0–3、2K/4K、最长 16 秒；Q2 为上一代。
- **万相 3.0 是当前 All-in-One 视频模型**，支持 20 个多模态素材、30 秒、原生音频、视频编辑与延长；2.7 为上一代。
- **Seedream 5.5 于 2026-11-09 发布，API 2026-11-15 上线**；Seedance 2.5 flash 同一天上线 API。
- **MiniMax 音乐 API 从 2026-08-20 起不再对新用户开放**。模型库需要「仅存量」状态。

这组时间线本身就是「不做模型预设」的证据：三个月内五家主力模型换代，任何写死模型的预设都会迅速过时，只有协议模板和指纹规则能跟上。

## 4. 总体设计

### 4.1 三层结构

| 层 | 内容 | 变化频率 | 维护方式 |
|---|---|---|---|
| 供应商预设 | 名称、Base URL、鉴权方式、协议类型、Key 获取链接 | 很低 | 内置，约 7–10 条 |
| 协议模板 | 这类接口支持哪些模式、槽位、参数、约束、请求映射 | 低 | 内置，约 10 条 |
| 模型条目 | 用户实际添加的模型 ID 和能力覆盖 | 高 | 从 `/models` 拉取或手填，自动套模板 |

再往上加一层**指纹规则**：只写「和模板不一样的地方」。同家族新模型零维护，新协议才需要加模板。

### 4.2 新模型接入流程

1. 用户点供应商预设 → 填 Key。
2. 点「获取模型列表」→ `/models` 返回模型 ID。
3. 系统按 ID 指纹匹配协议模板：
   - `seedream` → 图像模板
   - `seedance-2-5` → 视频模板 + 2.5 差异规则
   - `veo-3-1-fast` → Veo 模板 + Fast 差异规则
4. 用户看到模式徽章和参数，确认或修改。
5. 保存。

如果明天出了 `seedream-6-0`：匹配到 `seedream` 家族 → 套图像模板 → 标注「按 Seedream 通用能力推断，请确认」。**同家族新模型 0 维护。**

### 4.3 模式定义

`capability` 在 v2 里降级为「主分类」，只用于模型筛选和图标，不参与可用性判断。真正的可用性由 `modes` 决定。

| 模式 | 说明 | 槽位 | 输出 |
|---|---|---|---|
| `t2i` | 文生图 | 文本 1 | 图片 |
| `i2i` | 图生图 / 多参考图 / 蒙版编辑 | 文本 1、参考图 1..N、蒙版 0..1 | 图片 |
| `t2v` | 文生视频 | 文本 1 | 视频 |
| `first-frame` | 首帧生视频 | 文本 1、首帧 1 | 视频 |
| `first-last` | 首尾帧生视频 | 文本 1、首帧 1、尾帧 1 | 视频 |
| `reference` | 参考生视频（图/视频/音频组合） | 文本 1、参考图 0..N、参考视频 0..N、参考音频 0..N | 视频 |
| `video-edit` | 视频编辑（重拍/元素替换） | 文本 1、源视频 1、参考图 0..1 | 视频 |
| `video-extend` | 视频延长 | 文本 1、源视频 1 | 视频 |
| `layer` | 图层拆分 | 源图 1 | 图片多张（底图 + 图层） |

说明：

- **组图不是模式**，是 `features: ['sequential']` + 参数 `n` / `sequential_image_generation`。
- **蒙版不单列模式**，是 `i2i` 的可选槽位 + `features: ['mask']`。
- **主体参考**并入 `reference`，用槽位 `role: 'subject'` 表达。
- **多镜头**是 `features: ['multi-shot']`，靠参数控制，不改变输入契约。

### 4.4 输出特性

| 特性 | 含义 |
|---|---|
| `sequential` | 一次生成多张图（组图） |
| `layer` | 输出 1 张底图 + 多个图层 |
| `ocr` | 文字图层返回富文本 OCR |
| `rgba` | 直接生成带透明通道的图片 |
| `audio` | 视频带同步音频 |
| `last-frame` | 返回生成视频的尾帧 |
| `multi-shot` | 单次生成多镜头视频 |
| `mask` | 图片编辑支持蒙版 |

### 4.5 槽位定义

```ts
type MediaKind = 'text' | 'image' | 'video' | 'audio'

type SlotRole =
  | 'reference'    // 参考图/参考视频/参考音频
  | 'firstFrame'   // 首帧
  | 'lastFrame'    // 尾帧
  | 'mask'         // 蒙版
  | 'source'       // 被编辑/被延长的源素材
  | 'subject'      // 主体参考

interface InputSlot {
  id: string
  media: MediaKind
  role: SlotRole
  label: string
  min: number
  max: number
  required: boolean
  /** 同组槽位互斥，例如首帧模式与参考模式 */
  exclusiveGroup?: string
}
```

槽位校验规则：

- `required` 槽位数量必须在 `[min, max]` 内。
- 非 `required` 槽位可以为 0，但不能超过 `max`。
- `reference` 模式要求至少一个媒体槽位有值。
- `video-edit` 的 `element-replace` 操作要求参考图槽位有值；只做 `retake` 时参考图可以为空。
- `exclusiveGroup` 相同的槽位不能同时有值。

### 4.6 参数约束

```ts
type ModelModeId =
  | 't2i'
  | 'i2i'
  | 't2v'
  | 'first-frame'
  | 'first-last'
  | 'reference'
  | 'video-edit'
  | 'video-extend'
  | 'layer'

interface ParamCondition {
  mode?: ModelModeId
  params?: Record<string, unknown>
}

interface ParamDef {
  key: string
  label: string
  type: 'select' | 'number' | 'text' | 'boolean'
  options?: ParamOption[]
  defaultValue?: string | number | boolean
  min?: number
  max?: number
  group?: string
  allowCustom?: boolean
  description?: string

  /** v2：只在这些模式出现 */
  appliesTo?: ModelModeId[]
  /** v2：满足条件才显示 */
  when?: ParamCondition
  /** v2：满足条件时锁定值 */
  force?: { when: ParamCondition; value: unknown }
  /** v2：这些字段存在时不发送当前字段 */
  forbid?: string[]
}
```

覆盖已知规则：

- `duration` 在 `video-edit` 下 `force: -1`
- `ratio` 在 `first-last` / `video-edit` / `video-extend` 下 `force: 'adaptive'`
- `background` 在 `layer` 下 `forbid: ['layer_decomposition']`
- `n` 在 Seedream 5.0/5.5 下不出现（组图不支持）

### 4.7 视频操作

```ts
type OperationSupport = 'native' | 'prompted' | 'none'

interface ModeDef {
  // ...
  operations?: Partial<Record<VideoOperationId, OperationSupport>>
}
```

| 操作 | 模式 | 必要输入 | 门槛 |
|---|---|---|---|
| 片段重拍 | `video-edit` | 源视频 + 区间 + 提示词 | 视频条件生成，保持原视频一致性 |
| 元素替换 | `video-edit` | 源视频 + 区间 + 参考图 + 提示词 | 视频 + 参考图 + 主体替换 |
| 智能续写 | `video-extend` | 源视频 + 方向 + 时长 | 视频延长，或尾帧→首帧近似 |

UI 显示：

```
片段重拍   ● 原生
元素替换   ◐ 提示词模拟（效果不保证）
智能续写   ○ 不支持
```

现有实现只对 `adapter === 'http-template'` 开放，会排除 Seedance 2.5 的原生编辑。v2 改为按 `modes` 判断，`adapter` 只负责请求构造。

## 5. 配置格式

### 5.1 供应商

```json
{
  "id": "volcengine",
  "name": "火山方舟",
  "type": "openai-compat",
  "protocol": "ark",
  "baseUrl": "https://ark.cn-beijing.volces.com/api/v3",
  "apiKeyEnv": "ARK_API_KEY",
  "source": {
    "kind": "preset",
    "url": "https://www.volcengine.com/docs/82379",
    "retrievedAt": "2026-11-14"
  }
}
```

`protocol` 指向默认协议模板。`apiKey` 仍由应用内加密保存，不写入此文件。

### 5.2 模型

```json
{
  "id": "seedream-5-5",
  "family": "seedream",
  "name": "Seedream 5.5",
  "capability": "image.t2i",
  "remoteModel": "doubao-seedream-5-5-261028",
  "protocol": "ark-image",
  "modes": ["t2i", "i2i", "layer"],
  "features": ["sequential", "layer", "ocr", "rgba"],
  "params": [
    {
      "key": "size",
      "label": "尺寸",
      "type": "select",
      "options": [
        { "value": "1K", "label": "1K" },
        { "value": "1.5K", "label": "1.5K" },
        { "value": "2K", "label": "2K" }
      ],
      "defaultValue": "2K"
    },
    {
      "key": "background",
      "label": "背景",
      "type": "select",
      "options": [
        { "value": "auto", "label": "自动" },
        { "value": "opaque", "label": "不透明" },
        { "value": "transparent", "label": "透明" }
      ],
      "defaultValue": "auto",
      "appliesTo": ["t2i", "i2i"]
    },
    {
      "key": "layer_max_images",
      "label": "最多图层数",
      "type": "number",
      "defaultValue": 30,
      "min": 2,
      "max": 100,
      "appliesTo": ["layer"]
    }
  ],
  "extraBody": {
    "background": "{{params.background}}",
    "output_format": "{{params.output_format}}",
    "layer_decomposition": "{{params.layer_decomposition}}"
  },
  "omitBody": ["n"],
  "inputs": ["text", "image"],
  "source": {
    "kind": "template",
    "url": "https://ark.volcengine.com/region:cn-beijing/docs/seedream-5-5",
    "retrievedAt": "2026-11-14",
    "confidence": "high"
  }
}
```

### 5.3 协议模板

```ts
interface ProtocolTemplate {
  id: string
  label: string
  adapter?: string
  providerType?: ProviderType
  modes: ModeDef[]
  params: ParamDef[]
  extraBody?: Record<string, unknown>
  omitBody?: string[]
  template?: HttpTemplate
}
```

首批模板：

| 模板 | 适用 |
|---|---|
| `openai-image` | GPT Image、DALL·E、OpenAI 兼容图像 |
| `openai-chat` | GPT-4o、文本模型 |
| `openai-tts` | TTS |
| `suno` | Suno 音乐 |
| `ark-image` | Seedream 5.5 / 5.0 |
| `ark-video` | Seedance 2.5 / 2.5 flash / 2.0 |
| `sora-video` | Sora 风格（官方已关停，保留给中转站） |
| `kling-video` | 可灵 4.0 / 4.0 Flash |
| `vidu-video` | Vidu Q4 |
| `minimax-video` | MiniMax H3 / H3-Highspeed / H3-Lite / H3-Max |
| `veo-video` | Veo 3.1 Standard / Fast |
| `gemini-image` | Nano Banana 2.1 |
| `wan-video` | 万相 3.0 |
| `dashscope-image` | Qwen-Image 3.0 / 万相图像 |
| `runway-video` | Runway Gen-4.5 |
| `luma-video` | Luma Ray 3.2 |
| `bfl-image` | FLUX.2 klein / pro / max |
| `ideogram-image` | Ideogram 4.5 |
| `recraft-image` | Recraft V4.1 |
| `zhipu-video` | CogVideoX-3 |
| `zhipu-image` | GLM-Image / CogView-4 |
| `hunyuan-video` | 腾讯混元生视频 |
| `hunyuan-image` | 混元 Image-3.0 |
| `baidu-video` | 百度蒸汽机 |
| `fal` / `replicate` | 聚合平台，按模型 ID 路由 |

### 5.4 指纹规则

```ts
interface ModelRule {
  match: RegExp
  template: string
  overrides?: {
    modes?: Partial<Record<ModelModeId, Partial<ModeDef>>>
    params?: Record<string, Partial<ParamDef>>
    features?: string[]
  }
}
```

示例：

```ts
{
  match: /^doubao-seedance-2-5/,
  template: 'ark-video',
  overrides: {
    modes: {
      reference: {
        slots: [
          { id: 'reference-image', media: 'image', role: 'reference', min: 0, max: 30, required: false },
          { id: 'reference-video', media: 'video', role: 'reference', min: 0, max: 10, required: false },
          { id: 'reference-audio', media: 'audio', role: 'reference', min: 0, max: 10, required: false }
        ]
      }
    },
    params: {
      duration: { min: 4, max: 30, defaultValue: -1 }
    }
  }
}
```

### 5.5 兼容与迁移

- `inputs` 继续有效：`modes` 缺失时，从 `capability` + `inputs` 推断。
- `operations` 继续有效：`modes` 缺失时，按旧逻辑推断，但解除 `http-template` 限制。
- 未知字段保留：解析器改为保留 `modes`、`family`、`source` 等 v2 字段。
- 旧 `models.json` 不需要手动迁移；保存时按 v2 重写。
- `preset` 字段保留，但新模型不再新增预设；已有预设继续可用。

## 6. 界面设计

### 6.1 模型服务页

```
模型服务

[供应商卡片列表]
  Agnes AI           3 个模型 · Key 已保存
  BeefTV 本地代理    10 个模型 · Key 已保存

快速预设
  热门
  OpenAI 兼容   火山方舟   阿里百炼   可灵
  MiniMax       Vidu      OpenAI     Gemini

  更多
  Runway   Luma   智谱   百度千帆   FLUX
  Ideogram Recraft Stability  Fal.ai  Replicate  腾讯混元  Agnes

[+ 添加供应商]                         [下载配置 Skill]  [高级]
```

变化：

- 去掉顶部「模型供应商配置 / models.json 路径 / 重新加载 / 打开文件」卡片。
- 「高级」展开后才有：配置文件路径、重新加载、打开文件、手动导入。
- 新增「下载配置 Skill」。
- 供应商预设不再硬编码模型列表，只填连接信息。
- 首屏只放当前热门的 8 个供应商，其余收进「更多」；MOSS、Agnes 降级到「更多」。

### 6.2 模型卡片

```
Seedream 5.5
文生图 · 图生图 · 图层拆分
doubao-seedream-5-5-261028 · 7 个参数
[可用] [模型配置] [删除]
```

- 模式徽章代替单一「文生图」。
- 状态徽章：`缺 Key` / `未验证` / `可用` / `自定义` / `已下线`。
- 参数摘要最多 3 个。

### 6.3 模型配置对话框

```
模型配置
Seedream 5.5 · 来自 ark-image 模板

模式
  [✓] 文生图    文本
  [✓] 图生图    文本 + 参考图 1–10
  [✓] 图层拆分  源图 1（禁用背景参数）

参数
  尺寸      1K / 1.5K / 2K        默认 2K
  背景      自动 / 不透明 / 透明   默认 自动    仅文生图、图生图
  图层数    2–100                 默认 30      仅图层拆分

高级
  请求扩展 / 删除字段 / 接口字段名 / 来源

[恢复模板默认值]  [取消]  [保存配置]
```

信息层级：

1. 模型身份与模板来源
2. 模式（只读或可勾选）
3. 参数（按模式过滤，显示约束原因）
4. 高级（默认折叠）
5. 底部操作

### 6.4 PromptBar

- 模型列表按当前节点已连素材推断候选模式。
- 不支持当前模式的模型置灰，显示原因：「该模型不支持首尾帧」「该模型不支持元素替换（仅提示词模拟）」。
- 参数面板只显示当前模式适用的参数。
- 生成失败时提供「检查模型配置」入口，定位到具体模型。

### 6.5 下载 Skill 弹窗

```
配置 Skill 已下载
C:\Users\...\cinelab-model-config.md

1. 把文件交给任意 AI Agent（OpenCode / Claude Code / Cursor / ChatGPT）
2. 附上提示词：
   「读取这份 SKILL.md，按里面的规则帮我在 CineLab 中配置 <模型名>。
    官方文档：<链接>。配置写完后告诉我改了哪些模型。」
3. 回到 CineLab，配置会自动重新加载。

[复制提示词]  [打开所在文件夹]  [关闭]
```

## 7. Skill 设计

### 7.1 定位

单文件 `SKILL.md`，自包含，任何能读 Markdown 的 Agent 都能使用。不绑定 OpenCode。

存放位置：`resources/model-config-skill/SKILL.md`。不放进 `resources/skills`，避免 CineLab 内置 CineBot 自动加载后尝试写文件。

打包：`electron-builder.yml` 的 `extraResources` 增加 `resources/model-config-skill → model-config-skill`。

### 7.2 内容结构

1. 何时使用
2. 配置文件位置（Windows / macOS / Linux）
3. 工作流程
4. 配置格式（v1 兼容 + v2 扩展）
5. 9 个模式与槽位
6. 参数约束
7. 常见协议速查
8. 校验清单
9. 完整示例
10. 安全约束

### 7.3 工作流程

1. 读现有 `models.json`，确认供应商和模型是否已存在。
2. 确认模型身份：供应商、`remoteModel`、协议。
3. 获取能力：
   - 用户提供官方文档 → 读文档
   - 没提供 → 联网查官方文档
   - 查不到 → 按模型名推断，标 `confidence: low`
4. 生成配置：同时写 v1 兼容字段和 v2 扩展字段。
5. 校验：JSON 语法、必填字段、模式与槽位一致性、参数约束。
6. 备份：写入前复制 `models.json.bak`。
7. 合并写入：保留现有供应商和模型，不覆盖整个文件。
8. 汇报：改了哪些模型、来源 URL、置信度、需要用户确认的项。

### 7.4 安全约束

- 不读取、不写入、不询问 API Key。
- 不删除现有供应商或模型，除非用户明确要求。
- 不覆盖整个 `models.json`，只做合并。
- 写入前备份。
- 不确定的字段不要编，留空并标注。
- 记录来源 URL 和查询日期。

### 7.5 下载与使用

主进程新增：

- `src/main/settings/model-skill.ts`：定位 SKILL.md、保存对话框、写文件。
- IPC `settings:download-model-skill`。
- preload 暴露 `settings.downloadModelSkill()`。

渲染进程：

- 「下载配置 Skill」按钮。
- 下载成功弹窗，含路径、三步说明、提示词模板、复制按钮、打开文件夹按钮。

## 8. 实施计划

### 阶段 0：schema 与文档

- 冻结 v2 类型：`ModelModeId`、`InputSlot`、`ModeDef`、`ParamConstraint`、`ProtocolTemplate`、`ModelRule`、`ConfigSource`。
- 新增 `docs/model-config-v2-schema.md`，作为 Skill 和代码的共同来源。
- 更新 `docs/README.md` 索引。

### 阶段 1：能力模型与兼容层

- `ModelDef` 增加 `modes`、`features`、`source`、`family`、`protocol`。
- 新增 `src/shared/model-modes.ts`：模式定义、槽位校验、旧字段推断。
- 解析器保留 v2 字段。
- 单元测试：旧配置推断、新模式解析、槽位上限校验。

### 阶段 2：协议模板与指纹规则

- 新增 `src/shared/protocol-templates.ts`。
- 新增 `src/shared/model-rules.ts`。
- `resolveModels` 时套模板和规则。
- 供应商预设去掉硬编码模型列表。
- 补全首批模板：ark-image、ark-video、openai-image、openai-chat、openai-tts、suno、sora-video、kling-video、vidu-video、minimax-video、veo-video、gemini-image、wan-video。

### 阶段 3：界面

- 设置页去掉顶部配置文件卡片，收进「高级」。
- 模型卡片显示模式徽章和状态徽章。
- 模型配置对话框按模式组织。
- 参数约束求值器：UI 和请求构造共用。
- PromptBar 按模式过滤和置灰。
- 下载 Skill 按钮 + 弹窗。

### 阶段 4：视频操作

- `operations` 从模型级改为模式级，支持 `native / prompted / none`。
- 解除 `http-template` 限制。
- `volcengine-video` 适配器支持 `video-edit` / `video-extend` 的 role 和参数。
- `VideoOpNodeView` 显示支持级别和置灰原因。

### 阶段 5：Skill

- 写 `resources/model-config-skill/SKILL.md`。
- 打包配置、下载 IPC、弹窗。
- 用两个场景测试：
  - 给 Seedream 5.5 官方文档
  - 只给「Veo 3.1」让 Agent 联网查

### 阶段 6：收尾

- 更新 `docs/models.md`、`docs/video-operations-plan.md`、`docs/p2-acceptance.md`。
- 更新 `.opencode/handover/state.json` 和 evidence。
- 全量验证。

## 9. 验收标准

1. 用户从空状态到第一个模型可用，不超过 3 步：选供应商、填 Key、勾模型。
2. 每个字段有说明、示例和「不知道就留默认」的出口。
3. 新模型同家族零维护：从 `/models` 拉取后自动套模板，显示模式徽章。
4. Seedream 5.5：显示文生图/图生图/图层拆分，图层拆分下背景参数消失，OCR 可查看。
5. Seedance 2.5：显示六种模式，首尾帧与全模态参考互斥，编辑模式 `duration` 锁定 `-1`，`ratio` 锁定 `adaptive`。
6. Veo 3.1 Fast：不显示参考图模式，与 Standard 区分。
7. 视频操作显示原生/模拟/不支持；Seedance 原生编辑可用，不再被 `http-template` 排除。
8. 下载 Skill → 弹窗 → Agent 生成配置 → CineLab 自动重载。
9. `pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm check:docs` 通过。

## 10. 风险与取舍

| 风险 | 处理 |
|---|---|
| 模式归一化丢失厂商特性 | 只归一化输入/输出契约；厂商特有参数留在 `params` / `features` |
| 旧 `models.json` 不兼容 | `inputs` / `operations` / `preset` 继续有效；缺失 `modes` 时推断 |
| 指纹匹配误判 | 标注「推测」；允许手动切换协议模板；生成失败回链配置 |
| Agent 幻觉字段 | 来源、置信度、校验清单、备份、用户确认 |
| 并发写入 | 第一版直接写 + 备份；后续引入 `models.pending.json` 预览应用 |
| Sora 2 已关停 | 模型状态标注「已下线」；不删适配器，保留给中转站 |
| 模板维护成本 | 约 10 条协议模板；差异只写规则，不写全量 |

## 11. 调研来源

- 火山方舟 Seedream 5.5：<https://ark.volcengine.com/region:cn-beijing/docs/seedream-5-5>
- 火山方舟图片生成 API：<https://ark.volcengine.com/region:cn-beijing/docs/image-generation-api>
- 火山方舟创建视频生成任务：<https://ark.volcengine.com/region:cn-beijing/docs/create-video-generation-task-api>
- OpenAI Videos API（Sora 2，已关停）：<https://developers.openai.com/api/reference/resources/videos/methods/create>
- OpenAI Images API：<https://developers.openai.com/api/docs/guides/image-generation>
- 可灵 API：<https://klingai.com/document-api/apiReference>
- 可灵 4.0 发布：<https://klingai.com/dev/model-release/kling-4>
- Vidu 首尾帧：<https://platform.vidu.cn/docs/start-end-to-video>
- Vidu 参考生视频：<https://platform.vidu.cn/docs/reference-to-video>
- Vidu Q4：<https://vidu.com/zh/vidu-q4>
- MiniMax H3 视频生成：<https://platform.minimax.io/docs/api-reference/video-generation-v2-create>
- MiniMax 模型列表：<https://platform.minimax.io/docs/guides/models-intro>
- Veo 3.1：<https://aistudio.google.com/docs/veo>
- 万相 3.0 视频生成：<https://help.aliyun.com/zh/model-studio/wan3-video-generation-guide>
- 万相图生视频：<https://help.aliyun.com/zh/model-studio/wan-image-to-video-guide>
- Nano Banana：<https://aistudio.google.com/docs/image-generation>
- Suno API：<https://docs.sunoapi.org/suno-api/generate-music>
- MiniMax 音乐生成：<https://platform.minimax.io/docs/api-reference/music-generation>

## 12. 实施进度（2026-11-15）

### 已完成

- 阶段 0/1：`src/shared/model-modes.ts` 定义 9 个模式、槽位和操作支持级别；`ModelDef` / `ModelsFileModel` 增加 `modes` / `features` / `family` / `protocol` / `source`；旧 `capability` + `inputs` + `operations` 可自动推断模式。
- 阶段 2：`src/shared/protocol-templates.ts` 提供 21 个协议模板和 22 条指纹规则；`resolveModels` 会套模板并合并预设槽位。需要新执行器的模板标记为 `requires-adapter`。
- PromptBar：新增 `modelModeCompatibility`，按节点类型、图片/视频数量和首尾帧角色判断模型是否兼容；`ModelMenu` 显示具体置灰原因。
- 模型配置：
  - 能力模式可勾选/取消，切换后自动更新输入能力。
  - 模式下方可调整槽位上限（参考图、参考视频、参考音频等），支持恢复默认。
  - 常用参数默认展开。
  - 请求扩展改为键值对表格 + JSON 切换；删除字段改为标签；自定义协议保留 JSON 并加格式化。
  - 用户可见术语中文化：`http-template` → 自定义协议，`extraBody` → 请求扩展，`omitBody` → 删除字段，`remoteModel` → 接口 ID。
- 视频执行器：`volcengine-video` 支持 Seedance 2.5 的 `video-edit` / `video-extend`，发送 `reference_video`、`reference_image`、`omni_reference_task_type`，编辑时 `ratio=adaptive`、`duration=-1`；修正参考图 role 为 `reference_image`。
- Skill：`resources/model-config-skill/SKILL.md` 增加自定义协议结构、变量表、正例、反例和校验清单。
- Pending 流程：监听 `models.pending.json`，模型服务页显示「发现新的模型配置」，预览供应商/模型后应用；应用前备份 `models.json.bak`。
- 验证：`pnpm typecheck`、`pnpm test`（59 文件 / 397 用例）、`pnpm build`、`pnpm check:docs` 通过；隔离实例验证 pending 预览/应用、槽位编辑、模式添加/取消、键值对 ↔ JSON 切换。

### 2026-11-15 补充

- 供应商预设：热门 8 个小标签 + 「更多供应商」折叠；预设不再自动填入模型；推荐模型只在点击时添加；API Key 下显示 Key 获取地址。
- 参数约束：新增 `param-constraints.ts`，按模式过滤参数并应用 `force`；Seedance 的 `ratio=adaptive`、编辑 `duration=-1`，MiniMax 文生视频禁用 `adaptive`。
- 视频操作：`VideoOpNodeView` 改为按 `video-edit` / `video-extend` 模式判断，不再要求 `http-template`，Seedance 会出现在操作模型列表。
- 模型卡片：增加 `features` 徽章（图层/OCR/透明/音频等）和协议模板状态徽章（未验证 / 需适配 / 可用）。
- PromptBar：增加视频/图片模式选择器（自动、文生、首帧、首尾帧、参考、图生图、图层拆分）；按模式重新分配 firstFrame/lastFrame/reference；首尾帧超过 2 张自动切参考图并显示「撤销切换」。
- 仍未完成：PromptBar 槽位面板、图片节点的完整槽位、手动改角色菜单、Luma/智谱/百度模板、同步图片 http-template 分支。

### 2026-11-15 第二批

- PromptBar 增加槽位条：按当前模式显示首帧、尾帧、参考图、源图槽位，并填入对应素材缩略图。
- 协议模板：Luma、智谱 CogVideoX、百度蒸汽机、Ideogram、Recraft、智谱图像补上 `http-template` 默认模板，状态为 `draft`。
- `http-template` 增加 `sync` 模式：提交响应直接包含结果，不走轮询，用于 Ideogram / Recraft / 智谱图像这类同步图片接口。
### 2026-11-15 第三批

- 槽位缩略图点击可设为首帧 / 尾帧 / 参考图，或恢复自动分配。
- 节点错误区增加「检查模型配置」，直接打开设置 → 模型服务。
- 空状态增加三步引导：选供应商、填 Key、获取模型列表。
- 仍未完成：拖拽排序、主体/风格/蒙版完整槽位、真实 API Key 验证。

### 2026-11-15 第四批

- 槽位支持拖拽交换角色：拖到另一个槽位会交换两者的首帧/尾帧/参考图角色，拖到空槽会改角色。
- 供应商表单增加步骤条：1 连接 → 2 选模型 → 3 保存。
- `ReferenceRole` 扩展 `mask` / `subject` / `style` / `source`，为后续完整槽位预留。
- 仍未完成：主体/风格/蒙版槽位的底层适配、真实 API Key 验证。

### 2026-11-15 第五批

- 主体/风格/蒙版映射：新增 `refs.subject` / `refs.subjects` / `refs.style` / `refs.styles` / `refs.mask` 模板变量；`refs.images` 排除 mask。
- 手动角色菜单增加「设为主体参考」「设为风格参考」。
- 生成时自动追加主体一致性/风格参考提示词。
- 调研结论：Veo 3.1 只支持 `referenceType: asset`，不支持 style；可灵用 `elements`；MiniMax 用 `subject_reference`；FLUX.2 用 `input_image_N`；Qwen-Image-Edit 的 mask 走原生接口。显式字段仍需对应 adapter。
- 仍未完成：真实 API Key 验证。

### 未完成

- 14 个标记为 `requires-adapter` 的协议模板只有能力声明，真实执行器仍需按厂商官方 API 实现；在适配器落地前，这些模型不能直接生成。
- PromptBar 的图片角色仍自动分配（第一张首帧、第二张尾帧、其余参考图），用户还不能手动指定「这张图是首帧还是参考图」；当前兼容判断是保守放行。
- 「下载配置 Skill」的原生保存对话框无法用 CDP 自动验证；用户已手动点击确认弹窗和复制提示词可用。

### 验证

- `pnpm typecheck` 通过。
- `pnpm test`：59 个测试文件、397 个用例通过。
- `pnpm build` 通过。
- `pnpm check:docs` 通过。
- `pnpm lint`：0 errors，14 个既有 warning。
- 隔离实例：pending 卡片出现、预览供应商/模型、应用后写入 `models.json`；槽位上限可展开编辑；Seedream 5.5 图生图参考图 0–10；Seedance 2.5 六模式。
