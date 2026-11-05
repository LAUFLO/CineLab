# models.json 模型配置

CineLab 的模型供应商支持通过 `models.json` 配置，适合脚本或 Agent 直接新增模型，不用改代码。

## 文件位置

按以下顺序读取，后面的文件覆盖前面的同名 provider：

1. `%APPDATA%\CineLab\models.json`（打包后的用户配置）
2. `D:\CineLab\models.json`（开发时的仓库根配置）

示例见 `models.example.json`。`models.json` 已加入 `.gitignore`，不会被提交。

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

1. 设置面板里保存的加密 Key
2. `apiKeyEnv` 指向的环境变量
3. `apiKey` 明文

Agent 配置时建议只写 `apiKeyEnv`，Key 由用户自己设置。

## 与设置面板的关系

- `models.json` 里的 provider 在设置面板显示 `models.json` 标记，**只读**
- 设置面板里的 provider 保存在 `settings.json`，Key 用 safeStorage 加密
- 两者同 `id` 时，`models.json` 覆盖元数据和模型列表，但保留已加密的 Key

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

设置面板里点击“重新加载”，或刷新应用。修改 `models.json` 不需要重新打包。

## 常见错误

| 错误 | 原因 |
|---|---|
| `capability 必须是 ...` | capability 拼错或不在支持列表 |
| `preset 不存在` | 引用了不存在的内置预设，改成完整模型字段或换一个 preset |
| `adapter 不支持` | adapter 还没实现，先使用 `openai-compat` |
| `模型无法生成` | 参数 `key` 与执行器不一致，检查 `size` / `ratio` / `duration` 等约定 |
