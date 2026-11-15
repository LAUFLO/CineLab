---
name: cinelab-model-config
description: 帮用户在 CineLab 中配置模型供应商和模型能力。当用户说「配置 CineLab 模型」「接入 Seedream / Seedance / 可灵 / Vidu / MiniMax / Veo / 万相」「models.json 怎么写」「这个模型支持什么」「补充模型能力」时使用。根据官方文档或模型名称，生成或更新 CineLab 的 models.json，并标注来源与置信度。
version: 2.0.0
---

# CineLab 模型配置

你的任务是把一个模型接入 CineLab。CineLab 是一个本地 AI 创作工具，模型配置保存在用户数据目录的 `models.json` 里。用户不应该手写这个文件；你负责读文档、提取能力、生成配置、校验并合并。

## 何时使用

- 用户要添加一个模型供应商或模型。
- 用户给了官方 API 文档，要求「按这个配置」。
- 用户只给了模型名，要求「查一下它支持什么」。
- 用户要修正现有模型的参数、输入模式或视频操作。

## 配置文件位置

先确定用户的操作系统：

| 系统 | 路径 |
|---|---|
| Windows | `%APPDATA%\cinelab\models.json` |
| macOS | `~/Library/Application Support/cinelab/models.json` |
| Linux | `~/.config/cinelab/models.json` |

写入前必须：

1. 读现有文件。文件不存在时，从 `{ "version": 1, "providers": [] }` 开始。
2. 复制一份 `models.json.bak`。
3. 只合并，不覆盖其他供应商和模型。
4. 不读取、不写入、不询问 API Key。Key 由用户在 CineLab 设置页填写。

## 工作流程

1. **确认模型身份**：供应商、`remoteModel`（接口实际模型 ID）、协议类型。
2. **获取能力**：
   - 用户提供官方文档 → 以文档为准。
   - 没有文档 → 联网查官方 API 文档；再查官方模型页；最后才用可信聚合文档。
   - 查不到 → 按模型名推断，标 `source.confidence: "low"`，并在汇报里说明哪些字段需要用户确认。
3. **生成配置**：同时写 v1 兼容字段（`capability`、`inputs`、`params`）和 v2 能力字段（`modes`、`features`、`protocol`、`source`）。
4. **校验**：按下面的清单逐项检查。
5. **备份并合并写入**。
6. **汇报**：改了哪些模型、来源 URL、查询日期、置信度、待确认项。

## 配置结构

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
          "modes": ["t2v", "first-frame", "first-last", "reference", "video-edit", "video-extend"],
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

### 模型字段

| 字段 | 必填 | 说明 |
|---|---|---|
| `id` | 是 | 配置内唯一标识，建议用模型名 slug |
| `name` | 是 | 显示名称 |
| `capability` | 是 | 主分类：`image.t2i` / `image.i2i` / `text.chat` / `video.t2v` / `audio.tts` / `audio.music` |
| `remoteModel` | 是 | 请求里实际发送的模型 ID |
| `modes` | 推荐 | 能力模式 ID 或带槽位覆盖的对象 |
| `features` | 可选 | `sequential` / `layer` / `ocr` / `rgba` / `audio` / `last-frame` / `multi-shot` / `mask` |
| `family` | 可选 | 同系列变体分组，仅用于 UI |
| `protocol` | 可选 | 协议模板 ID |
| `params` | 是 | 生成参数定义 |
| `extraBody` | 可选 | 追加到默认请求体的字段，支持 `{{params.*}}` / `{{refs.*}}` |
| `omitBody` | 可选 | 从默认请求体删除的顶层字段 |
| `adapter` | 可选 | 执行器；缺省按 `remoteModel` 推断 |
| `inputs` | 可选 | 旧字段，媒体类型集合 |
| `operations` | 可选 | 旧字段，视频操作 ID 集合 |
| `source` | 推荐 | 能力信息来源与置信度 |

## 9 个模式

`modes` 里每一项可以是字符串，也可以是对象：

```json
{ "id": "reference", "slots": { "reference-image": { "max": 30 } } }
```

| 模式 | 含义 | 槽位 |
|---|---|---|
| `t2i` | 文生图 | 提示词 |
| `i2i` | 图生图 / 多参考图 / 蒙版编辑 | 提示词、参考图 1..N、蒙版 0..1 |
| `t2v` | 文生视频 | 提示词 |
| `first-frame` | 首帧生视频 | 提示词、首帧 1 |
| `first-last` | 首尾帧生视频 | 提示词、首帧 1、尾帧 1 |
| `reference` | 参考生视频 | 提示词、参考图 0..N、参考视频 0..N、参考音频 0..N |
| `video-edit` | 视频编辑 | 提示词、源视频 1、替换素材 0..1 |
| `video-extend` | 视频延长 | 提示词、源视频 1 |
| `layer` | 图层拆分 | 源图 1 |

规则：

- 组图是 `features: ["sequential"]`，不是模式。
- 蒙版是 `i2i` 的可选槽位，不是模式。
- 主体参考并入 `reference`，不单独开模式。
- 首帧/首尾帧与参考生视频通常互斥；不要把两组槽位混在一个模式里。
- 只声明文档明确支持的模式。宁可不写，也不要猜。

## 视频操作

`video-edit` 和 `video-extend` 可以在模式对象里覆盖支持级别：

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

不要因为模型「能输入视频」就声明 `video-edit`。参考视频、源视频、待延长视频是三种不同语义。

## 参数约束

参数可以声明：

```json
{
  "key": "ratio",
  "label": "比例",
  "type": "select",
  "options": [{ "value": "adaptive", "label": "自适应" }, { "value": "16:9", "label": "16:9" }],
  "defaultValue": "adaptive",
  "appliesTo": ["t2v", "reference"],
  "force": { "when": { "mode": "first-last" }, "value": "adaptive" },
  "deny": { "when": { "mode": "t2v" }, "values": ["adaptive"] }
}
```

| 字段 | 作用 |
|---|---|
| `appliesTo` | 只在这些模式显示 |
| `when` | 满足条件才显示 |
| `force` | 满足条件时锁定值；可以写数组 |
| `deny` | 满足条件时禁用某些值；可以写数组 |
| `forbid` | 这些字段存在时不发送当前字段 |

只写文档能确认的约束。不确定时留空，不要编造。

## 协议模板

优先使用已有模板，减少重复字段：

`openai-image`、`ark-image`、`ark-video`、`kling-video`、`minimax-video`、`vidu-video`、`agnes-video`、`openai-chat`、`openai-tts`、`suno`、`sora-video`、`veo-video`、`gemini-image`、`wan-video`、`dashscope-image`、`runway-video`、`luma-video`、`bfl-image`、`ideogram-image`、`recraft-image`、`zhipu-video`、`zhipu-image`、`hunyuan-video`、`hunyuan-image`、`baidu-video`。

不确定模板是否存在时，直接写完整的 `modes` 和 `params`，不要填一个不存在的 `protocol`。

## 自定义协议（http-template）

界面上叫「自定义协议」。只有当服务商提供的是「提交任务 + 轮询结果」两步 HTTP 接口时，才用它。它适合临时接入新厂商，不适合 WebSocket、分片上传、特殊签名。

### 结构

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

### 可用变量

| 变量 | 含义 |
|---|---|
| `{{prompt}}` | 提示词 |
| `{{model}}` | 接口模型 ID |
| `{{params.*}}` | 生成参数，例如 `{{params.duration}}` |
| `{{refs.firstFrame}}` | 首帧 data URL |
| `{{refs.lastFrame}}` | 尾帧 data URL |
| `{{refs.image}}` | 第一张参考图 |
| `{{refs.images}}` | 所有参考图数组 |
| `{{refs.frames}}` | 首帧和尾帧数组 |
| `{{video.dataUrl}}` | 源视频 data URL |
| `{{video.base64}}` | 源视频 base64 |
| `{{video.mime}}` | 源视频 MIME |
| `{{video.start}}` / `{{video.end}}` | 编辑区间 |
| `{{video.duration}}` | 续写时长 |
| `{{video.direction}}` | 续写方向 |
| `{{video.operation}}` | 操作 ID |
| `{{taskId}}` | 轮询任务 ID |

### 正例：图生视频

```json
{
  "submit": {
    "path": "/v1/videos",
    "body": {
      "model": "{{model}}",
      "prompt": "{{prompt}}",
      "image_url": "{{refs.image}}"
    }
  },
  "poll": {
    "path": "/v1/videos/{{taskId}}",
    "taskIdPath": "id",
    "statusPath": "status",
    "successValues": ["completed"],
    "failValues": ["failed"],
    "resultPath": "video_url"
  }
}
```

### 正例：视频续写

```json
{
  "submit": {
    "path": "/v1/videos/extend",
    "body": {
      "model": "{{model}}",
      "prompt": "{{prompt}}",
      "video": "{{video.dataUrl}}",
      "direction": "{{video.direction}}",
      "duration": "{{video.duration}}"
    }
  },
  "poll": {
    "path": "/v1/videos/{{taskId}}",
    "taskIdPath": "id",
    "statusPath": "status",
    "successValues": ["completed"],
    "failValues": ["failed"],
    "resultPath": "video_url"
  },
  "videoResult": "full"
}
```

### 反例

- **WebSocket / SSE**：模板只支持 HTTP 轮询。遇到这种协议，停下来告诉用户「需要代码适配」。
- **AK/SK 签名、临时 token**：模板只支持固定 header 和 Bearer。遇到签名协议，停下来。
- **分片上传、多阶段回调**：模板只支持单次提交。遇到这种协议，停下来。

### 校验清单

- `submit.path` 和 `poll.path` 以 `/` 开头。
- `poll.taskIdPath`、`statusPath`、`resultPath` 能在响应里找到。
- `successValues` / `failValues` 与文档一致。
- 结果 URL 是视频或图片。
- 返回数组时，`resultPath` 用 `[0]`。
- 视频操作要写 `videoResult`：完整视频 `full`，新增片段 `segment`。
- 不要猜轮询端点。文档里没有就停下来。

## 文档提取要点

从官方文档里优先找：

1. 支持的生成模式（文生、图生、首尾帧、参考生、编辑、延长）。
2. 每种模式的输入数量上限和角色。
3. 分辨率、时长、比例、音频、水印、输出格式的取值范围和默认值。
4. 模式之间的互斥规则。
5. 哪些参数只在某些模式下有效。
6. 模型变体差异（Standard / Fast / Lite / Pro / Max）。

不要把产品页的宣传能力当成 API 能力。只写 API 文档里能调用的部分。

## 校验清单

写入前逐项检查：

- [ ] `version` 是 `1`。
- [ ] 每个 provider 有唯一 `id`、`name`、`baseUrl`。
- [ ] 每个 model 有唯一 `id`、`name`、`capability`、`remoteModel`。
- [ ] `modes` 只用 9 个合法 ID。
- [ ] `features` 只用 8 个合法值。
- [ ] `params` 的 `select` 有非空 `options`。
- [ ] 参数 `type` 是 `select` / `number` / `text` / `boolean`。
- [ ] `extraBody` 是对象；`omitBody` 是非空字符串数组。
- [ ] 没有写入 API Key。
- [ ] 已备份 `models.json.bak`。
- [ ] 没有删除用户已有的其他供应商或模型。
- [ ] `source` 记录了 URL、日期和置信度。

## 汇报格式

写完后用中文简短汇报：

```text
已更新：火山方舟 → Seedance 2.5
来源：<官方文档 URL>（2026-11-14，置信度 high）
新增模式：文生视频、首帧、首尾帧、参考生、视频编辑、视频延长
需要确认：参考视频上限按 2.5 写成 10，如果实际是 2.0 请告诉我
```

## 安全约束

- 不处理 API Key、账号密码、Cookie。
- 不删除现有供应商或模型，除非用户明确要求。
- 不覆盖整个 `models.json`，只做合并。
- 写入前备份。
- 不确定的字段不要编；标注置信度并交给用户确认。
- 不把第三方代理文档当成官方文档；来源里写清楚是哪个 URL。
