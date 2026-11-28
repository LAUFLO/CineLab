---
name: cinelab-model-config
description: 帮用户在 CineLab 中配置模型供应商和模型能力。当用户说「配置 CineLab 模型」「接入 Seedream / Seedance / 可灵 / Vidu / MiniMax / Veo / 万相」「models.json 怎么写」「这个模型支持什么」「补充模型能力」时使用。根据官方文档或模型名称，生成 CineLab 的 models.pending.json，标注来源与置信度；CineLab 会自动校验并应用。
version: 2.1.0
model-config-fingerprint: sha256:057439410fd95b64a5122bbea86892a6aff68269384652137013d3802e4ac3ed
---

# CineLab 模型配置

你的任务是把一个模型接入 CineLab。CineLab 是一个本地 AI 创作工具，正式配置保存在用户数据目录的 `models.json`。**不要直接改 `models.json`**；你生成一份完整的 `models.pending.json`，CineLab 会自动校验并应用。

## 何时使用

- 用户要添加一个模型供应商或模型。
- 用户给了官方 API 文档，要求「按这个配置」。
- 用户只给了模型名，要求「查一下它支持什么」。
- 用户要修正现有模型的参数、输入模式或视频操作。

## 配置文件与写入流程

先确定用户的操作系统：

| 系统 | 配置目录 |
|---|---|
| Windows | `%APPDATA%\cinelab` |
| macOS | `~/Library/Application Support/cinelab` |
| Linux | `~/.config/cinelab` |

正式文件是 `models.json`，待应用文件是 `models.pending.json`。

写入前必须：

1. 读 `models.json`。文件不存在时，从 `{ "version": 1, "providers": [] }` 开始。
2. 在内存里保留它的**完整结构**，只合并或修改目标供应商和模型；不要删除其他供应商或模型。
3. 把完整结果写入 `models.pending.json`，结构与 `models.json` 相同。
4. CineLab 会自动校验并应用；只有校验失败时，才需要到「设置 → 模型与运行时 → 模型供应商配置」处理保留的 pending 配置。
5. 应用由 CineLab 完成：先备份 `models.json` 为 `models.json.bak`，再用 pending **整体替换** `models.json`，最后删除 pending。

> `models.pending.json` 是整体替换，不是增量补丁。只写新增供应商会导致应用后丢失现有配置。必须包含现有全部 providers。

不要读取、写入或询问 API Key。`models.json` 不保存 Key/Secret，Key 由用户在 CineLab 设置页填写，加密保存在 `settings.json`。

## 填写 API Key

模型配置应用后，按以下路径填写 Key：

1. 右上角「设置」
2. 「模型与运行时」
3. 在「模型供应商配置」找到对应供应商
4. 点供应商右侧的「编辑供应商」（滑杆图标）
5. 填写「API Key」；可灵需要时再填 Secret Key
6. 点页面底部「保存」

不要在 `models.json` 里找 Key，也不要写 `apiKey` 明文字段。供应商卡片没有出现时，先在「模型供应商配置 → 高级 → 打开文件」核对 `models.json` 是否已生成。

直接编辑 `models.json` 只用于设置页或用户手工维护；Agent 生成配置一律走 pending。

## 工作流程

1. **确认模型身份**：供应商、`remoteModel`（接口实际模型 ID）、协议类型。
2. **获取能力**：
   - 用户提供官方文档 → 以文档为准。
   - 没有文档 → 联网查官方 API 文档；再查官方模型页；最后才用可信聚合文档。
   - 查不到 → 按模型名推断，标 `source.confidence: "low"`，并在汇报里说明哪些字段需要用户确认。
3. **生成完整配置**：同时写 v1 兼容字段（`capability`、`inputs`、`operations`、`params`）和 v2 能力字段（`modes`、`features`、`protocol`、`source`）。
4. **契约校验**：官方模型要对照 `src/shared/model-contracts.ts` 的协议族契约；不确定就查代码，不要猜字段。
5. **写入 pending**：先读现有 `models.json`，把完整结果写入 `models.pending.json`。
6. **汇报**：改了哪些模型、来源 URL、查询日期、置信度和待确认项；CineLab 会自动应用。

## 自动枚举（由代码生成）

<!-- AUTO:model-skill:start -->
> 本节由 `corepack pnpm map:skill` 从代码生成，请勿手改。

### 模式

| ID | 名称 | 输出 |
|---|---|---|
| `t2i` | 文生图 | `image` |
| `i2i` | 图生图 | `image` |
| `t2v` | 文生视频 | `video` |
| `first-frame` | 首帧生视频 | `video` |
| `first-last` | 首尾帧生视频 | `video` |
| `reference` | 全能参考 | `video` |
| `video-edit` | 视频编辑 | `video` |
| `video-extend` | 视频延长 | `video` |
| `layer` | 图层拆分 | `image` |

**features（8）**：`sequential`、`layer`、`ocr`、`rgba`、`audio`、`last-frame`、`multi-shot`、`mask`

**capability（6）**：`image.t2i`、`image.i2i`、`text.chat`、`video.t2v`、`audio.tts`、`audio.music`

**协议模板（21）**：`openai-image`、`ark-image`、`ark-video`、`kling-video`、`minimax-video`、`vidu-video`、`agnes-video`、`veo-video`、`gemini-image`、`wan-video`、`dashscope-image`、`runway-video`、`luma-video`、`bfl-image`、`ideogram-image`、`recraft-image`、`zhipu-video`、`zhipu-image`、`hunyuan-video`、`hunyuan-image`、`baidu-video`

### 官方契约

| adapter | 模式 |
|---|---|
| `openai-compat` | `t2i`、`i2i`、`layer` |
| `agnes-video` | `t2v`、`first-frame`、`first-last`、`reference` |
| `sora-video` | `t2v`、`first-frame` |
| `minimax-video` | `t2v`、`first-frame`、`first-last`、`reference` |
| `minimax-legacy` | `t2v`、`first-frame`、`first-last` |
| `kling-video` | `t2v`、`first-frame`、`first-last` |
| `volcengine-video` | `t2v`、`first-frame`、`first-last`、`reference`、`video-edit`、`video-extend` |
| `http-template` | `t2i`、`i2i`、`layer`、`t2v`、`first-frame`、`first-last`、`reference`、`video-edit`、`video-extend` |
<!-- AUTO:model-skill:end -->

## 配置结构

`models.pending.json` 与 `models.json` 同结构：

```json
{
  "version": 1,
  "providers": [
    {
      "id": "volcengine",
      "name": "火山方舟",
      "type": "openai-compat",
      "baseUrl": "https://ark.cn-beijing.volces.com/api/v3",
      "protocol": "ark-video",
      "models": [
        {
          "id": "seedance-2-5",
          "name": "Seedance 2.5",
          "capability": "video.t2v",
          "remoteModel": "doubao-seedance-2-5-260628",
          "protocol": "ark-video",
          "modes": [
            "t2v",
            "first-frame",
            "first-last",
            "reference",
            "video-edit",
            "video-extend"
          ],
          "features": ["audio", "last-frame"],
          "family": "seedance",
          "params": [
            {
              "key": "duration",
              "label": "时长",
              "type": "number",
              "defaultValue": 5,
              "min": 4,
              "max": 30,
              "description": "生成视频的秒数。"
            }
          ],
          "source": {
            "kind": "agent",
            "url": "https://ark.volcengine.com/region:cn-beijing/docs/seedance-2-5",
            "retrievedAt": "2026-11-14",
            "confidence": "high"
          }
        }
      ]
    }
  ]
}
```

### provider 字段

| 字段 | 必填 | 说明 |
|---|---|---|
| `id` | 是 | 唯一标识，生成请求里的 `modelKey` 用它作为前缀 |
| `name` | 是 | 显示名称 |
| `type` | 否 | `openai-compat` 或 `kling`，默认 `openai-compat` |
| `adapter` | 否 | 供应商默认执行器 |
| `protocol` | 否 | 默认协议模板 ID |
| `baseUrl` | 是 | 接口根地址 |
| `headers` | 否 | 附加到该供应商所有请求的请求头，值支持 `${ENV_NAME}` |
| `apiKeyEnv` | 否 | 从该环境变量读取 API Key |
| `models` | 是 | 模型数组，至少一个 |

### model 字段

| 字段 | 必填 | 说明 |
|---|---|---|
| `id` | 是 | 配置内唯一标识，建议用模型名 slug |
| `preset` | 否 | 引用内置预设；见 `src/shared/provider-schema.ts` 的 `MODEL_PRESETS` |
| `name` | 无 preset 时必填 | 显示名称 |
| `capability` | 无 preset 时必填 | 主分类；合法值见「自动枚举 → capability」 |
| `remoteModel` | 无 preset 时必填 | 请求里实际发送的模型 ID |
| `modes` | 推荐 | 能力模式 ID 或 `{ id, operations }` 对象 |
| `features` | 可选 | 合法值见「自动枚举 → features」 |
| `family` | 可选 | 同系列变体分组，仅用于 UI |
| `protocol` | 可选 | 协议模板 ID |
| `params` | 无 preset 时必填 | 生成参数定义 |
| `extraBody` | 可选 | 追加到默认请求体的字段，支持 `{{params.*}}` / `{{refs.*}}` |
| `omitBody` | 可选 | 从默认请求体删除的顶层字段 |
| `adapter` | 可选 | 执行器；缺省按 `remoteModel` 或 provider 推断 |
| `localAdapter` | 可选 | 本地适配器 ID；`adapter` 为 `local:<id>` 时使用 |
| `template` | 可选 | `http-template` 执行器的提交/轮询模板 |
| `inputs` | 可选 | 旧字段，媒体类型集合 |
| `operations` | 可选 | 旧字段，视频操作 ID 集合 |
| `source` | 推荐 | 能力信息来源与置信度：`kind` / `url` / `retrievedAt` / `confidence` |

`source.kind` 可用 `preset` / `template` / `manual` / `agent`；`confidence` 用 `high` / `medium` / `low`。

### 预设 preset

- `preset` 引用内置预设，模型可以只写 `id` + `preset`，其余字段由预设提供。
- `params` 以预设为底稿按 `key` 合并：用户改过的同名参数覆盖预设，预设新增的参数自动补上。
- `inputs` / `operations` 不会被预设自动改写。
- 查找预设：`src/shared/provider-schema.ts` 的 `MODEL_PRESETS`。
- 不确定 preset 是否存在时，写完整字段，不要猜 preset ID。

## 模式说明

模式 ID、名称和输出以「自动枚举 → 模式」为准；下表补充槽位语义。

`modes` 里每一项可以是字符串，也可以是对象：

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
| `i2i` | 图生图（多参考图 / 蒙版编辑） | 提示词、参考图 1..N、蒙版 0..1 |
| `t2v` | 文生视频 | 提示词 |
| `first-frame` | 首帧生视频 | 提示词、首帧 1 |
| `first-last` | 首尾帧生视频 | 提示词、首帧 1、尾帧 1 |
| `reference` | 全能参考（参考生视频） | 提示词、参考图/视频/音频 0..N |
| `video-edit` | 视频编辑 | 提示词、源视频 1、替换素材 0..1 |
| `video-extend` | 视频延长 | 提示词、源视频 1 |
| `layer` | 图层拆分（工具栏「图层分离」使用，不在 Prompt Bar 显示） | 源图 1 |

规则：

- 对象形式只支持 `id` 和 `operations`；**没有 `slots` 字段**，不要写 `slots` 覆盖。
- 素材数量不在本地建模：能收几张由供应商 API 决定，超量时接口错误直接显示在节点上。
- 组图是 `features: ["sequential"]`，不是模式。
- 蒙版是 `i2i` 的槽位，不是模式。
- 主体参考并入 `reference`，不单独开模式。
- 首帧/首尾帧与参考生视频通常互斥；不要把两组槽位混在一个模式里。
- 只声明文档明确支持的模式。宁可不写，也不要猜。
- `layer` 模式只服务工具栏「图层分离」，Prompt Bar 不再显示该模式；`layer_decomposition` / `layer_max_images` / `text_recognition` 参数应加 `appliesTo: ["layer"]`。

## 视频操作

`video-edit` 和 `video-extend` 可以在模式对象里覆盖操作支持级别：

```json
{
  "id": "video-edit",
  "operations": {
    "shot-retake": "native",
    "element-replace": "prompted"
  }
}
```

级别：

- `native`：API 原生任务类型。
- `prompted`：只能靠提示词模拟，效果不保证。
- `none`：不支持。

视频操作 ID：`shot-retake` / `element-replace` / `extend`。

不要因为模型「能输入视频」就声明 `video-edit`。参考视频、源视频、待延长视频是三种不同语义。

## 参数约束

参数可以声明：

```json
{
  "key": "ratio",
  "label": "比例",
  "type": "select",
  "group": "比例",
  "options": [
    { "value": "adaptive", "label": "自适应" },
    { "value": "16:9", "label": "16:9" }
  ],
  "defaultValue": "adaptive",
  "appliesTo": ["t2v", "reference"],
  "force": { "when": { "mode": "first-last" }, "value": "adaptive" },
  "deny": { "when": { "mode": "t2v" }, "values": ["adaptive"] }
}
```

| 字段 | 作用 |
|---|---|
| `type` | `select` / `number` / `text` / `boolean` |
| `group` | 参数面板分组，例如「比例」「清晰度」「生成数量」 |
| `appliesTo` | 只在这些模式显示 |
| `when` | 满足条件才显示 |
| `force` | 满足条件时锁定值；可以写数组 |
| `deny` | 满足条件时禁用某些值；可以写数组 |
| `forbid` | 这些字段存在时不发送当前字段 |
| `allowCustom` | 允许 Prompt Bar 直接输入自定义值 |

`select` 必须有非空 `options`。只写文档能确认的约束；不确定时留空，不要编造。

## 协议模板与执行器

`protocol` 指向内置协议模板，提供模式、槽位、参数和请求映射的默认值。当前模板 ID 以「自动枚举 → 协议模板」为准。

模板状态：

- `ready`：已有执行器，可直接使用。
- `draft`：字段按官方文档编写，但未真机验证；首次使用建议先跑最小请求。
- `requires-adapter`：只有能力声明，执行器仍需代码适配；不要直接用于生成。

执行器 `adapter`：

- 官方：以「自动枚举 → 官方契约」为准。
- 本地：`local:<id>`，由本地适配器提供。

不确定模板是否存在时，直接写完整的 `modes` 和 `params`，不要填一个不存在的 `protocol`。

## 自定义协议（http-template）

界面上叫「自定义协议」。只有当服务商提供「提交任务 + 轮询结果」或同步 HTTP 接口时，才用它。它适合临时接入新厂商；WebSocket、分片上传、多阶段回调、复杂签名仍然需要代码适配。

### 顶层结构

```json
{
  "adapter": "http-template",
  "template": {
    "auth": { "header": "Authorization", "prefix": "Bearer " },
    "submit": {
      "path": "/v1/videos",
      "method": "POST",
      "contentType": "json",
      "body": {
        "model": "{{model}}",
        "prompt": "{{prompt}}",
        "image": "{{refs.image}}",
        "duration": "{{params.duration}}"
      }
    },
    "poll": {
      "path": "/v1/videos/{{taskId}}",
      "taskIdPath": "id",
      "statusPath": "status",
      "successValues": ["completed"],
      "failValues": ["failed", "cancelled"],
      "resultPath": "video_url"
    }
  }
}
```

### 字段

| 字段 | 说明 |
|---|---|
| `auth.header` / `auth.prefix` | 默认 `Authorization` + `Bearer ` |
| `auth.headers` | 固定请求头 |
| `auth.sign` | HMAC-SHA256 签名，见下 |
| `submit.path` | 字符串，或按 `text` / `image` / `keyframe` / `reference` / `video` 分别配置 |
| `submit.body` / `submit.bodyByMode` | 默认请求体 / 按模式覆盖 |
| `submit.contentType` | `json`（默认）或 `multipart` |
| `submit.omitEmpty` | 删除模板里的空字段 |
| `submit.conditional` | 按模式、参数或参考素材设置/删除顶层字段 |
| `submit.multipart` | 显式指定文件字段和普通字段 |
| `poll.path` / `taskIdPath` | 轮询路径和任务 ID 路径 |
| `poll.statusPath` / `successValues` / `failValues` | 状态判断 |
| `poll.statusMap` | 自定义状态映射，优先于 successValues / failValues |
| `poll.errorPath` / `errorMessagePath` | 提取供应商错误码/错误消息 |
| `poll.resultPath` / `resultPaths` | 单个结果 / 多结果路径 |
| `poll.intervalMs` / `maxAttempts` / `download` | 轮询间隔、最大次数、是否下载结果 |
| `sync` / `syncResultPath` | 同步接口；提交响应直接包含结果，不走轮询 |
| `videoResult` | `full`（完整视频）或 `segment`（新增片段） |
| `mode` | `text` / `image` / `keyframe` / `reference` / `video` |

### 可用变量

| 变量 | 含义 |
|---|---|
| `{{prompt}}` | 提示词 |
| `{{model}}` | 接口模型 ID |
| `{{params.*}}` | 生成参数，例如 `{{params.duration}}` |
| `{{refs.firstFrame}}` | 首帧纯 base64 |
| `{{refs.firstFrameDataUrl}}` | 首帧 data URL |
| `{{refs.firstFrameMime}}` | 首帧 MIME |
| `{{refs.lastFrame}}` | 尾帧纯 base64 |
| `{{refs.lastFrameDataUrl}}` | 尾帧 data URL |
| `{{refs.lastFrameMime}}` | 尾帧 MIME |
| `{{refs.frames}}` | 首帧和尾帧的 data URL 数组 |
| `{{refs.image}}` | 第一张参考图 data URL |
| `{{refs.images}}` | 所有参考图 data URL 数组 |
| `{{refs.audio}}` / `{{refs.audios}}` | 第一段/所有参考音频 data URL |
| `{{refs.subject}}` / `{{refs.subjects}}` | 主体参考图（高级用法） |
| `{{refs.style}}` / `{{refs.styles}}` | 风格参考图（高级用法） |
| `{{refs.mask}}` | 蒙版 PNG data URL |
| `{{video.dataUrl}}` / `{{video.base64}}` / `{{video.mime}}` | 源视频 |
| `{{video.start}}` / `{{video.end}}` | 编辑区间秒数 |
| `{{video.duration}}` / `{{video.direction}}` / `{{video.operation}}` | 续写参数 |
| `{{provider.baseUrl}}` / `{{provider.apiKey}}` / `{{provider.secretKey}}` | 供应商信息，仅用于模板请求 |
| `{{taskId}}` | 轮询任务 ID |
| `{{method}}` / `{{path}}` / `{{timestamp}}` / `{{body}}` | 仅用于 `auth.sign` 的签名 payload |

首尾帧语义是破坏性变更：`{{refs.firstFrame}}` / `{{refs.lastFrame}}` 是**纯 base64**；需要 data URL 时用 `firstFrameDataUrl` / `lastFrameDataUrl`。旧模板不会自动改写，配置对话框会提示。

### 条件字段

```json
{
  "conditional": [
    {
      "when": { "mode": "keyframe", "refs": ["firstFrame"] },
      "set": { "first_frame": "{{refs.firstFrameDataUrl}}" },
      "remove": ["prompt_image"]
    }
  ]
}
```

`when` 可以组合 `mode`、`params`（全部相等）、`refs`（角色名或媒体类型）。

### $map

把参考素材映射为对象数组：

```json
{
  "images": {
    "$map": "refs.images",
    "$as": {
      "url": "{{item.dataUrl}}",
      "role": "{{item.role}}"
    }
  }
}
```

`item` 支持 `dataUrl` / `base64` / `mime` / `role` / `media`。

### HMAC 签名

```json
{
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
}
```

`encoding` 支持 `hex` / `base64`。`provider.apiKey` / `provider.secretKey` 只用于模板请求，不要把包含这些变量的模板分享给他人。

### multipart

`contentType: "multipart"` 时，body 里的 data URL 会自动转成文件字段。需要精确控制字段时用显式 `multipart`：

```json
{
  "submit": {
    "path": "/upload",
    "contentType": "multipart",
    "multipart": {
      "fields": { "prompt": "{{prompt}}" },
      "files": [
        {
          "field": "image",
          "source": "{{refs.firstFrameDataUrl}}",
          "filename": "first.png"
        }
      ]
    }
  }
}
```

文件 `source` 使用 data URL；普通字段放 `fields`。

### 同步接口

```json
{
  "sync": true,
  "syncResultPath": "data.video_url",
  "submit": { "path": "/generate", "body": { "prompt": "{{prompt}}" } },
  "poll": { "path": "/unused", "taskIdPath": "id", "resultPath": "video_url" }
}
```

同步接口也必须保留 `poll` 结构；省略 `syncResultPath` 时使用 `poll.resultPath`。

### 视频编辑/续写

带 `video` 输入时，模板自动进入 video 模式。用 `videoResult` 声明返回类型：

- `full`：接口返回完整视频，直接作为结果。
- `segment`：接口返回新增片段，由 CineLab 拼回源视频。

### 反例

- **WebSocket / SSE**：模板只支持 HTTP 轮询或同步响应。遇到这种协议，停下来告诉用户「需要代码适配或本地适配器」。
- **分片上传、多阶段回调**：模板只支持单次提交。遇到这种协议，停下来。
- **HMAC-SHA256 以外的复杂签名 / 临时 token**：模板只支持固定 header、Bearer 和 HMAC 签名；其他签名方式需要代码适配。
- **结果不是 HTTP 可下载的 URL**：需要代码适配。

### 校验清单

- `submit.path` 和 `poll.path` 以 `/` 开头。
- `poll.taskIdPath`、`statusPath`、`resultPath` 能在响应里找到。
- `statusMap` / `successValues` / `failValues` 与文档一致。
- `resultPaths` 是数组；多结果时每个路径都能找到。
- 结果 URL 是视频或图片；必要时声明 `videoResult`。
- 变量语义正确：首尾帧纯 base64，data URL 用 `*DataUrl`。
- 签名 header、encoding、payload 与文档一致。
- 不要猜轮询端点。文档里没有就停下来。

## 官方模型契约

官方模型（来自内置预设或官方协议模板）保存时会按 `src/shared/model-contracts.ts` 的协议族契约校验：

- 官方适配器列表以「自动枚举 → 官方契约」为准。
- 校验首帧/尾帧字段、传输格式（data URL / base64 / URL / binary）、角色名和支持模式。
- 契约不一致会阻止保存；用户自定义模型只记录警告。
- `http-template` 的字段由模板决定，不做字段级契约校验。

生成官方模型配置前，先查对应契约；不要凭产品页猜字段。契约来源 URL 和日期会随代码维护。

## 本地适配器

以下情况不要硬写 `models.json` 或 `http-template`，改用本地适配器：

- 需要执行自定义代码、处理 WebSocket/SSE、分片上传或多阶段回调。
- 需要 HMAC-SHA256 以外的签名、临时 token、复杂鉴权。
- 需要连接本地服务或 sidecar。

本地适配器目录：

```text
%APPDATA%\cinelab\adapters\<id>\
  manifest.json
  models.json
  adapter.ts        # 或 adapter.js
```

- `models.json` 的模型字段与官方模型一致；`capability`、`remoteModel`、`params` 必填。
- 系统会把 `adapter` 强制设为 `local:<id>`，`localAdapter` 设为 `<id>`。
- 同名模型覆盖在设置页「本地适配器」中管理；不要擅自覆盖官方模型。
- Agent 默认只生成 `models.json`/`models.pending.json` 配置，不生成 `adapter.ts`；需要代码适配时告诉用户走本地适配器或让开发者处理。

## 文档提取要点

从官方文档里优先找：

1. 支持的生成模式（文生、图生、首尾帧、参考生、编辑、延长）。
2. 每种模式的输入数量上限和角色。
3. 分辨率、时长、比例、音频、水印、输出格式的取值范围和默认值。
4. 模式之间的互斥规则。
5. 哪些参数只在某些模式下有效。
6. 模型变体差异（Standard / Fast / Lite / Pro / Max）。
7. 首尾帧/参考素材的传输方式（base64、data URL、公网 URL、multipart）。

不要把产品页的宣传能力当成 API 能力。只写 API 文档里能调用的部分。

## 校验清单

写入 pending 前逐项检查：

- [ ] `models.pending.json` 是完整配置，包含现有 `models.json` 的全部 providers 和 models。
- [ ] `version` 是 `1`。
- [ ] 每个 provider 有唯一 `id`、`name`、`baseUrl`、非空 `models`。
- [ ] 每个 model 有唯一 `id`；没有 preset 时有 `name`、`capability`、`remoteModel`、`params`。
- [ ] `modes` 只用「自动枚举 → 模式」中的合法 ID；对象形式只写 `id` 和 `operations`，不写 `slots`。
- [ ] `features` 只用「自动枚举 → features」中的合法值。
- [ ] `params` 的 `type` 是 `select` / `number` / `text` / `boolean`；`select` 有非空 `options`。
- [ ] `extraBody` 是对象；`omitBody` 是非空字符串数组。
- [ ] 官方模型已对照 `model-contracts.ts` 的字段、传输和模式。
- [ ] http-template 的路径、状态、结果路径、签名、multipart 变量都符合文档。
- [ ] 首尾帧变量：纯 base64 用 `refs.firstFrame` / `refs.lastFrame`；data URL 用 `firstFrameDataUrl` / `lastFrameDataUrl`。
- [ ] 没有写入 API Key、Secret、Cookie。
- [ ] 没有删除用户已有的其他供应商或模型。
- [ ] `source` 记录了 URL、日期和置信度。
- [ ] 已告知用户 CineLab 会自动校验并应用，以及填写 API Key 的正确路径。

## 汇报格式

写完后用中文简短汇报：

```text
已生成待应用配置：<models.pending.json 路径>
变更：火山方舟 → Seedance 2.5（新增首尾帧、参考生视频）
来源：<官方文档 URL>（2026-11-14，置信度 high）
应用方式：CineLab 自动校验并应用；校验失败时到 设置 → 模型与运行时 → 模型供应商配置 查看
填写 Key：设置 → 模型与运行时 → 模型供应商配置 → 编辑供应商 → API Key → 保存
需要确认：参考视频上限按 2.5 写成 10，如果实际是 2.0 请告诉我
```

## 安全约束

- 不处理 API Key、账号密码、Cookie。
- 不删除现有供应商或模型，除非用户明确要求。
- 不直接覆盖 `models.json`；只写 `models.pending.json`，由 CineLab 自动校验并应用。
- 应用前备份由 CineLab 完成；不要自己删除 `models.json.bak`。
- 不确定的字段不要编；标注置信度并交给用户确认。
- 不把第三方代理文档当成官方文档；来源里写清楚是哪个 URL。
