# models.json 模型配置

日期：2026-11-13
状态：现行
适用版本：v0.1.0
最后核对：2026-11-13

`models.json` 是 CineLab 唯一的模型供应商配置文件。设置页和手工编辑都直接修改这个文件，适合脚本或 Agent 批量新增模型，不用改代码。

## 文件位置

唯一位置：`%APPDATA%\cinelab\models.json`（设置页顶部会显示实际路径）。开发态和打包态使用同一个文件，不再读取仓库根。

示例见 `models.example.json`。仓库根的 `models.json` 已加入 `.gitignore`，不会被提交；需要时把示例复制到用户数据目录。

## 最小示例

```json
{
  "version": 1,
  "providers": [
    {
      "id": "my-relay",
      "name": "我的中转站",
      "type": "openai-compat",
      "baseUrl": "https://api.example.com/v1",
      "headers": {
        "x-app": "opencode",
        "x-client-version": "1.0.0"
      },
      "apiKeyEnv": "MY_RELAY_KEY",
      "models": [
        {
          "id": "gpt-image-1",
          "preset": "gpt-image-1"
        }
      ]
    }
  ]
}
```

## 字段

### provider

| 字段 | 必填 | 说明 |
|---|---|---|
| `id` | 是 | 唯一标识，生成请求里的 `modelKey` 用它作为前缀 |
| `name` | 是 | 显示名称 |
| `type` | 否 | `openai-compat` 或 `kling`，默认 `openai-compat` |
| `adapter` | 否 | 默认执行器：`openai-compat`、`agnes-video`、`volcengine-video`、`http-template`、`minimax-video`、`minimax-legacy`、`kling-video`、`sora-video` |
| `baseUrl` | 是 | 接口根地址，例如 `https://api.example.com/v1` |
| `headers` | 否 | 附加到该供应商所有请求的自定义请求头，键值对；值支持 `${ENV_NAME}` 环境变量插值 |
| `apiKeyEnv` | 否 | 从该环境变量读取 API Key |
| `apiKey` | 否 | 明文 Key，不推荐 |
| `models` | 是 | 模型数组，至少一个 |

### model

| 字段 | 必填 | 说明 |
|---|---|---|
| `id` | 是 | 模型唯一标识 |
| `preset` | 否 | 引用内置预设，见 `src/shared/provider-schema.ts` 的 `MODEL_PRESETS` |
| `name` | 无 preset 时必填 | 显示名称 |
| `capability` | 无 preset 时必填 | `image.t2i` / `image.i2i` / `text.chat` / `video.t2v` / `audio.tts` / `audio.music` |
| `remoteModel` | 无 preset 时必填 | 请求里实际发送的模型 ID |
| `inputs` | 否 | 模型实际可接收的输入：`text` / `image` / `video` / `audio`；省略时按能力、模型名和模板推断 |
| `operations` | 否 | 模型支持的视频操作：`shot-retake` / `element-replace` / `extend`；省略时按 http-template 变量推断 |
| `adapter` | 否 | 覆盖 provider 的 adapter |
| `template` | 否 | `http-template` 执行器的提交/轮询模板 |
| `extraBody` | 否 | 追加到默认请求体的字段，支持模板变量；见「请求体扩展」 |
| `omitBody` | 否 | 从默认请求体删除的顶层字段，例如 `["n"]` |
| `params` | 否 | 节点 PromptBar 里显示的参数，结构同 `ParamDef`；设置页模型卡片的「模型配置」可编辑 |
| `modes` | 否 | 能力模式，见「能力模式」 |
| `features` | 否 | 输出特性：`sequential` / `layer` / `ocr` / `rgba` / `audio` / `last-frame` / `multi-shot` / `mask` |
| `family` | 否 | 同系列变体分组，仅用于 UI |
| `protocol` | 否 | 协议模板 ID，例如 `ark-video` |
| `source` | 否 | 能力来源：`kind` / `url` / `retrievedAt` / `confidence` |

`inputs` 是兼容字段。有 `modes` 时以 `modes` 为准；没有 `modes` 时用于 Prompt Bar 的模型置灰。

`operations` 是兼容字段。有 `modes` 时，视频操作由 `video-edit` / `video-extend` 模式推导；没有 `modes` 时仍按旧规则推断。操作支持级别分为 `native` / `prompted` / `none`。

### 能力模式

`modes` 是 v2 的能力声明，取代 `inputs` + `operations` 作为主要判断依据。每一项可以写成字符串，需要覆盖操作支持级别时再写成对象：

```json
{
  "modes": [
    "t2i",
    { "id": "video-edit", "operations": { "element-replace": "prompted" } }
  ]
}
```

| 模式 | 含义 | 槽位 |
|---|---|---|
| `t2i` | 文生图 | 提示词 |
| `i2i` | 图生图 / 多参考图 / 蒙版编辑 | 提示词、参考图、蒙版 |
| `t2v` | 文生视频 | 提示词 |
| `first-frame` | 首帧生视频 | 提示词、首帧 |
| `first-last` | 首尾帧生视频 | 提示词、首帧、尾帧 |
| `reference` | 参考生视频 | 提示词、参考图/视频/音频 |
| `video-edit` | 视频编辑 | 提示词、源视频、替换素材 |
| `video-extend` | 视频延长 | 提示词、源视频 |
| `layer` | 图层拆分 | 源图 |

- 旧配置不写 `modes` 时，从 `capability` + `inputs` + `operations` 推断。
- 组图、蒙版、多镜头是 `features`，不是模式。
- 设置页「模型配置」可以勾选/取消模式。
- Prompt Bar 会按当前节点已连的素材判断模型是否兼容。
- 素材数量不在本地建模：能收几张由供应商 API 决定。超量时照常发送，接口错误直接显示在节点上，用户删减素材后重新生成即可。

### 协议模板与指纹规则

`protocol` 指向内置协议模板，例如 `ark-image`、`ark-video`、`kling-video`、`minimax-video`、`vidu-video`、`openai-image`。模板提供模式、槽位、参数和请求映射的默认值；指纹规则只写和模板不一样的地方。

同家族新模型通常不需要新增配置：模型 ID 匹配到规则后自动套模板。当前规则覆盖 Seedance 2.5/2.0、Seedream 5.5/5.0、MiniMax H3、Vidu Q4、可灵 4.0、Veo 3.1、Nano Banana 2、Wan 3、Qwen-Image 3、Runway Gen-4、Luma Ray 3、FLUX.2、Ideogram 4、Recraft V4、CogVideoX-3、GLM-Image、混元和百度蒸汽机。

标记为 `requires-adapter` 的模板只有能力声明，执行器仍需代码适配；在这些适配器落地前，界面上应视为「能力参考」，不要直接用于生成。

模板状态：

- `ready`：已有执行器，可直接使用。
- `draft`：字段按官方文档编写，但未真机验证；首次使用建议先跑最小请求。
- `requires-adapter`：只有能力声明，执行器仍需代码适配。

当前 `wan-video`、`runway-video`、`bfl-image` 已带 `http-template` 默认模板，状态为 `draft`。Runway 的 `promptImage` 已确认支持 base64 data URI；BFL 的 `input_image` 支持 URL 或 base64；Wan 的 `img_url` 字段仍需真机确认。

默认推断规则：

- `image.t2i`：`text`；Agnes 图像模型额外推断 `image`
- `image.i2i`：`text`、`image`
- `video.t2v`：非 http-template 默认 `text`、`image`；Agnes 2.5 Flash 为 `text`、`image`、`audio`，Agnes 2.5 标准版额外包含 `video`
- `http-template`：按模板中的 `image` / `keyframe` / `reference` / `video` 模式推断
- 文本、TTS、音乐：`text`

参数编辑器按模型能力提供模板：图片（尺寸/画幅比例/数量/质量）、视频（画幅比例/时长/分辨率/生成音频）、音频（声音/语速/格式）、文本（温度/最大 token）。下拉选项在编辑器中按「值|显示名」每行一个填写。

`params` 支持 `group` 字段用于合并面板分组（例如「比例」「清晰度」「生成数量」）。PromptBar 会把同一模型的全部参数合并成一个「生成设置」按钮，点击后按分组展示；`duration` 数字参数渲染为时长滑块。

预设升级规则：引用 `preset` 的模型，`params` 以预设为底稿按 `key` 合并——用户改过的同名参数覆盖预设，预设新增的参数自动补上；`inputs` / `operations` 不会被自动改写。模型配置底部的「恢复预设默认值」可以一键恢复参数、输入、操作和请求扩展。

### params

```json
{
  "key": "ratio",
  "label": "比例",
  "type": "select",
  "options": [
    { "value": "16:9", "label": "16:9" },
    { "value": "9:16", "label": "9:16" }
  ],
  "defaultValue": "16:9"
}
```

- `type` 支持 `select`、`number`、`text`、`boolean`
- `select` 必须有 `options`
- 参数的 `key` 会被生成执行器读取，例如图片读取 `size` / `ratio`，视频读取 `ratio` / `duration`，音乐读取 `mode` / `instrumental`
- 比例选项的 `label` 写成 `16:9` 这类格式时，PromptBar 会自动显示比例网格

## 请求体扩展

适配器先按自己的协议构造默认请求体，再合并 `extraBody`、删除 `omitBody`。常见新增字段只改配置即可，不用改代码：

```json
{
  "preset": "doubao-seedream-5-5",
  "extraBody": {
    "background": "{{params.background}}",
    "output_format": "{{params.output_format}}"
  },
  "omitBody": ["n"]
}
```

- `extraBody` 里 `{{token}}` 独占整个字符串时保留原始类型（数字、布尔、数组、对象）；内嵌在字符串里时转成文本
- 可用变量：`{{prompt}}`、`{{model}}`、`{{params.*}}`、`{{refs.firstFrame}}`（纯 base64）、`{{refs.lastFrame}}`（纯 base64）、`{{refs.firstFrameDataUrl}}`、`{{refs.lastFrameDataUrl}}`、`{{refs.firstFrameMime}}`、`{{refs.lastFrameMime}}`、`{{refs.frames}}`（data URL 数组）、`{{refs.image}}`、`{{refs.images}}`、`{{refs.subject}}`、`{{refs.subjects}}`、`{{refs.style}}`、`{{refs.styles}}`、`{{refs.mask}}`
- 首尾帧变量语义：`{{refs.firstFrame}}` / `{{refs.lastFrame}}` 返回纯 base64；需要 data URL 请改用 `{{refs.firstFrameDataUrl}}` / `{{refs.lastFrameDataUrl}}`。旧模板不会自动改写，模型配置对话框会显示迁移提示。
- 主体/风格参考不单独做显式适配：PromptBar 不提供独立角色，统一按普通参考图发送，由提示词表达「保持主体一致」或「参考画风」。`refs.subject` / `refs.subjects` / `refs.style` / `refs.styles` 变量保留给自定义协议的高级用法，但不会自动写入请求。
- 蒙版：`{{refs.mask}}` 是 PNG data URL，透明区域表示需要编辑；`contentType: "multipart"` 的模板会自动把它转成文件字段。OpenAI 兼容模型的 `/images/edits` 已内置 `mask` 字段，不需要写模板。
- `omitBody` 只删除顶层字段
- 图片 multipart 路径会把 `extraBody` 的原始值追加为表单字段；对象值会序列化为 JSON 字符串
- 设置页「模型配置 → 高级」可以直接编辑这两项，保存前会做 JSON 校验

## Sora 视频

`adapter: "sora-video"` 按 OpenAI Sora 风格提交任务。带参考图时优先用 multipart 的 `input_reference` 字段；接口返回 400/415 且错误涉及参考图或 content-type 时自动回退为 JSON data URL。`duration` 会映射为 `seconds`，其余字段用 `extraBody` 追加：

```json
{
  "id": "sora-2",
  "name": "Sora 2",
  "capability": "video.t2v",
  "remoteModel": "sora-2",
  "adapter": "sora-video",
  "inputs": ["text", "image"],
  "params": [
    { "key": "duration", "label": "时长", "type": "number", "defaultValue": 5, "min": 4, "max": 12 },
    { "key": "resolution", "label": "分辨率", "type": "select", "options": [
      { "value": "720p", "label": "720P" },
      { "value": "1080p", "label": "1080P" }
    ], "defaultValue": "720p" },
    { "key": "ratio", "label": "比例", "type": "select", "options": [
      { "value": "16:9", "label": "16:9" },
      { "value": "9:16", "label": "9:16" }
    ], "defaultValue": "16:9" },
    { "key": "generate_audio", "label": "生成音频", "type": "boolean", "defaultValue": true }
  ],
  "extraBody": {
    "resolution": "{{params.resolution}}",
    "ratio": "{{params.ratio}}",
    "generate_audio": "{{params.generate_audio}}"
  }
}
```

## Seedream 图层拆分与 OCR

内置预设 `doubao-seedream-5-5` 使用模型 ID `doubao-seedream-5-5-261028`，并声明：

- `layer_decomposition`：开启图层拆分，输出 1 张底图 + 多个图层
- `layer_max_images`：最多输出图片数，含底图，范围 2–100
- `text_recognition`：对规整文字图层返回 OCR 文本和样式
- `background`：`auto` / `opaque` / `transparent`；透明背景会自动确保 `output_format: png`
- 图层拆分场景不能传 `background`，适配器会自动删除

图层拆分需要一张参考图，建议在 Prompt Bar 里把「图层拆分」打开后再生成。结果会作为同一节点的多个输出展示：底图标记为「底图」，图层显示模型返回的名称；带 OCR 的图层右上角会出现 `OCR` 按钮，可查看识别文本。图层顺序、名称、描述和边界框保存在输出的 `layer` 字段，OCR 保存在 `textRecognition` 字段。

> Seedream 5.0 pro / flash 不支持组图，也不能发送 `n`；内置预设已通过 `omitBody: ["n"]` 处理。5.5 同样不支持组图。

## 视频适配器

| adapter | 适用 |
|---|---|
| `openai-compat` | 图片、文本、TTS、音乐，以及 OpenAI 风格视频 |
| `agnes-video` | Agnes Video 2.5 Flash |
| `volcengine-video` | 火山方舟 Seedance |
| `http-template` | 单步提交 + 单步轮询的 HTTP 视频服务，例如智谱、Vidu |
| `minimax-video` | MiniMax H3 |
| `minimax-legacy` | MiniMax Hailuo 旧版（file_id 两步下载） |
| `kling-video` | 可灵（API Key 或 AccessKey/SecretKey JWT） |
| `sora-video` | OpenAI Sora 风格：`POST /videos` 提交，轮询 `/videos/{id}`，从 `/videos/{id}/content` 下载 |

### 自定义协议（http-template）

界面上叫「自定义协议」。只有服务商提供「提交任务 + 轮询结果」两步 HTTP 接口时，才需要填这里。

`http-template` 适合协议简单、但字段和端点不是 OpenAI 格式的服务。模板支持：

- `auth.header` / `auth.prefix`：默认 `Authorization` + `Bearer `
- `submit.path`：字符串，或按 `text` / `image` / `keyframe` / `reference` / `video` 分别配置
- `submit.bodyByMode`：不同模式使用不同请求体
- `submit.contentType`：`json`（默认）或 `multipart`
- `submit.omitEmpty`：删除模板里的空字段
- `poll.path` / `taskIdPath` / `statusPath` / `resultPath`
- 变量：`{{prompt}}`、`{{model}}`、`{{params.*}}`、`{{refs.firstFrame}}`（纯 base64）、`{{refs.lastFrame}}`（纯 base64）、`{{refs.firstFrameDataUrl}}`、`{{refs.lastFrameDataUrl}}`、`{{refs.firstFrameMime}}`、`{{refs.lastFrameMime}}`、`{{refs.frames}}`、`{{refs.image}}`、`{{refs.images}}`、`{{provider.baseUrl}}`、`{{provider.apiKey}}`、`{{provider.secretKey}}`、`{{video.dataUrl}}`、`{{video.base64}}`、`{{video.mime}}`、`{{video.start}}`、`{{video.end}}`、`{{video.duration}}`、`{{video.direction}}`、`{{video.operation}}`、`{{taskId}}`
- 首尾帧变量从 data URL 改为纯 base64 是破坏性变更：旧模板不自动改写，配置对话框会提示；需要 data URL 的字段请使用 `firstFrameDataUrl` / `lastFrameDataUrl`。
- `submit.conditional`：按模式、参数或参考素材设置/删除顶层字段：
  ```json
  "conditional": [
    {
      "when": { "mode": "keyframe", "refs": ["firstFrame"] },
      "set": { "first_frame": "{{refs.firstFrame}}" },
      "remove": ["prompt_image"]
    }
  ]
  ```
- `$map`：把参考素材映射为对象数组，支持 `item.dataUrl` / `item.base64` / `item.mime` / `item.role` / `item.media`：
  ```json
  "images": {
    "$map": "refs.images",
    "$as": { "url": "{{item.dataUrl}}", "role": "{{item.role}}" }
  }
  ```
- `poll.statusMap`：自定义状态映射，优先于 `successValues` / `failValues`；`poll.errorPath` / `poll.errorMessagePath` 提取供应商错误；`poll.resultPaths` 返回多个结果。
- `auth.sign`：HMAC-SHA256 签名，支持 `{{method}}`、`{{path}}`、`{{timestamp}}`、`{{body}}`：
  ```json
  "auth": {
    "sign": {
      "type": "hmac-sha256",
      "secret": "{{provider.secretKey}}",
      "payload": "{{method}}\n{{path}}\n{{timestamp}}\n{{body}}",
      "header": "X-Signature",
      "timestampHeader": "X-Timestamp",
      "encoding": "hex"
    }
  }
  ```
- `submit.multipart`：显式指定文件字段和普通字段；文件 `source` 使用 data URL，例如 `{{refs.firstFrameDataUrl}}`：
  ```json
  "multipart": {
    "fields": { "prompt": "{{prompt}}" },
    "files": [
      { "field": "image", "source": "{{refs.firstFrameDataUrl}}", "filename": "first.png" }
    ]
  }
  ```
- 同步接口可用 `syncResultPath` 指定结果路径；省略时使用 `poll.resultPath`。
- `provider.apiKey` / `provider.secretKey` 只用于模板请求，不要把包含这些变量的模板分享给他人。

视频编辑/续写接口使用 `mode: "video"`。当请求带 `video` 输入时，模板自动进入 video 模式：

```json
{
  "mode": "video",
  "submit": {
    "path": "/video/edit",
    "bodyByMode": {
      "video": {
        "model": "your-video-edit-model",
        "prompt": "{{prompt}}",
        "video": "{{video.dataUrl}}"
      }
    }
  },
  "poll": {
    "path": "/tasks/{{taskId}}",
    "taskIdPath": "id",
    "statusPath": "status",
    "resultPath": "result.url"
  }
}
```

如果接口要求 multipart 上传，把 `contentType` 设为 `multipart`，body 里的 data URL 会自动转成文件字段：

```json
{
  "mode": "video",
  "submit": {
    "path": "/upload/edit",
    "contentType": "multipart",
    "bodyByMode": {
      "video": {
        "model": "your-video-edit-model",
        "prompt": "{{prompt}}",
        "video": "{{video.dataUrl}}"
      }
    }
  },
  "poll": {
    "path": "/tasks/{{taskId}}",
    "taskIdPath": "id",
    "statusPath": "status",
    "resultPath": "result.url"
  }
}
```

为模型声明操作：

设置 → 模型服务 → 模型卡片「模型配置」，勾选「片段重拍 / 元素替换 / 智能续写」。操作时视频节点会列出所有视频模型，未声明对应操作、不是 http-template、缺少模板或未开启视频输入的模型会置灰，并显示原因。

模板需要声明 `videoResult`：

- `full`：接口返回完整视频，直接作为结果。
- `segment`：接口返回新增片段，由 CineLab 拼回源视频。

变量：

| 变量 | 说明 |
|---|---|
| `{{video.start}}` | 区间开始秒数 |
| `{{video.end}}` | 区间结束秒数 |
| `{{video.duration}}` | 续写新增时长 |
| `{{video.direction}}` | `forward` / `backward` |
| `{{video.operation}}` | `shot-retake` / `element-replace` / `extend` |

智谱示例：

```json
{
  "id": "zhipu-cogvideox-flash",
  "preset": "zhipu-cogvideox-flash"
}
```

智谱、Vidu、MiniMax、可灵的完整模型定义已经内置在 `MODEL_PRESETS` 里，设置面板的“快速添加”可以直接选。

## Key 优先级

1. 设置面板里保存的加密 Key（存于 `settings.json`）
2. `apiKeyEnv` 指向的环境变量
3. `apiKey` 明文字段：忽略，并在设置页显示警告

`models.json` 本身不保存 Key。设置面板保存时只把供应商与模型写入 `models.json`，Key 加密写入 `settings.json`。

## 与设置面板的关系

设置页「模型服务」的模型卡片可以打开「模型配置」，修改输入能力、视频操作、生成参数、能力模式和高级请求字段。普通用户不需要直接编辑 `models.json`。

保存模型时，官方内置模型会校验协议族契约（首帧/尾帧字段、角色名、支持模式）；契约不一致会阻止保存。用户自定义模型只记录警告，不阻塞保存。契约定义在 `src/shared/model-contracts.ts`，覆盖 8 个官方适配器。

「高级」里可以下载配置 Skill。Skill 是一个单文件 Markdown，交给任意 AI Agent 后，Agent 会读官方文档并生成或修正配置。Agent 应写入用户数据目录下的 `models.pending.json`，CineLab 检测到后会显示「发现新的模型配置」，预览后应用；应用前会备份 `models.json` 为 `models.json.bak`。

- 设置面板直接读写 `models.json`：新增、编辑、删除供应商都会立即写入该文件
- Key/Secret 单独用 safeStorage 加密后保存在 `settings.json`
- 不存在“应用内配置”和“JSON 配置”两个来源，也不会出现只读条目
- 手工编辑 `models.json` 后会自动刷新，也可以点“重新加载”

## 从旧版本迁移

旧版本把设置页添加的供应商存在 `settings.json`。启动时会自动迁移：

- 供应商与模型元数据写入 `models.json`
- 加密 Key/Secret 留在 `settings.json`
- 迁移后删除旧的 `providers` 字段
- 同 id 条目保留 `models.json` 中已有的元数据，避免覆盖手工配置

## 校验

```bash
corepack pnpm models:check
```

也可以指定文件：

```bash
node scripts/models-check.mjs models.example.json
```

校验内容包括 JSON 结构、必填字段、capability、inputs、adapter、参数类型和重复 ID。`preset` 是否存在由应用启动时再次校验，设置面板会显示错误。

## 修改后生效

保存后自动生效。手工编辑 `models.json` 时应用会自动监听并刷新；也可以点设置页的“重新加载”。不需要重新打包。

## 常见错误

| 错误 | 原因 |
|---|---|
| `capability 必须是 ...` | capability 拼错或不在支持列表 |
| `inputs 只能是 ...` | 输入能力写错，可用值为 `text` / `image` / `video` / `audio` |
| `preset 不存在` | 引用了不存在的内置预设，改成完整模型字段或换一个 preset |
| `adapter 不支持` | adapter 还没实现，先使用 `openai-compat` |
| `apiKey` 被忽略 | 明文 Key 不安全，请改用设置页或 `apiKeyEnv` |
| `模型无法生成` | 参数 `key` 与执行器不一致，检查 `size` / `ratio` / `duration` 等约定 |
