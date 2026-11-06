# models.json 模型配置

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
| `adapter` | 否 | 默认执行器：`openai-compat`、`agnes-video`、`volcengine-video`、`http-template`、`minimax-video`、`minimax-legacy`、`kling-video` |
| `baseUrl` | 是 | 接口根地址，例如 `https://api.example.com/v1` |
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
| `adapter` | 否 | 覆盖 provider 的 adapter |
| `params` | 否 | 节点 PromptBar 里显示的参数，结构同 `ParamDef` |

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

### http-template 模板

`http-template` 适合协议简单、但字段和端点不是 OpenAI 格式的服务。模板支持：

- `auth.header` / `auth.prefix`：默认 `Authorization` + `Bearer `
- `submit.path`：字符串，或按 `text` / `image` / `keyframe` / `reference` 分别配置
- `submit.bodyByMode`：不同模式使用不同请求体
- `submit.omitEmpty`：删除模板里的空字段
- `poll.path` / `taskIdPath` / `statusPath` / `resultPath`
- 变量：`{{prompt}}`、`{{model}}`、`{{params.*}}`、`{{refs.firstFrame}}`、`{{refs.lastFrame}}`、`{{refs.frames}}`、`{{refs.images}}`、`{{taskId}}`

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

校验内容包括 JSON 结构、必填字段、capability、adapter、参数类型和重复 ID。`preset` 是否存在由应用启动时再次校验，设置面板会显示错误。

## 修改后生效

保存后自动生效。手工编辑 `models.json` 时应用会自动监听并刷新；也可以点设置页的“重新加载”。不需要重新打包。

## 常见错误

| 错误 | 原因 |
|---|---|
| `capability 必须是 ...` | capability 拼错或不在支持列表 |
| `preset 不存在` | 引用了不存在的内置预设，改成完整模型字段或换一个 preset |
| `adapter 不支持` | adapter 还没实现，先使用 `openai-compat` |
| `apiKey` 被忽略 | 明文 Key 不安全，请改用设置页或 `apiKeyEnv` |
| `模型无法生成` | 参数 `key` 与执行器不一致，检查 `size` / `ratio` / `duration` 等约定 |
