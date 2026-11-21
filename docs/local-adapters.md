# 本地适配器

日期：2026-11-21
状态：现行
适用版本：v0.4.0
最后核对：2026-11-21

> 本地可信适配器（L3）：目录存在即自动加载，完全信任，不受官方能力白名单限制。
> 需要隔离时用 L4 sidecar，不在本文范围。

## 目录

```text
%APPDATA%\cinelab\adapters\<id>\
  manifest.json
  models.json
  adapter.ts        # 或 adapter.js
  node_modules\     # 可选；adapter 自己的依赖
  .build\           # CineLab 生成的构建产物
```

`<id>` 必须与 `manifest.id` 一致，只能包含字母、数字和连字符。

## manifest.json

```json
{
  "id": "echo",
  "version": "0.1.0",
  "type": "code",
  "entry": "adapter.ts",
  "models": "models.json"
}
```

| 字段 | 必填 | 说明 |
|---|---|---|
| `id` | 是 | 适配器 ID，必须与目录名一致 |
| `version` | 否 | 默认 `0.0.0` |
| `type` | 否 | 当前只支持 `code`；`config` / `template` 预留 |
| `entry` | 否 | 默认 `adapter.ts`；也支持 `adapter.js` |
| `models` | 否 | 默认 `models.json` |

没有 `permissions` 字段：适配器拥有 CineLab 应用权限，权限声明没有意义。

## models.json

```json
{
  "provider": {
    "name": "Echo 本地适配器",
    "baseUrl": "",
    "headers": {},
    "apiKeyEnv": "ECHO_API_KEY"
  },
  "models": [
    {
      "id": "echo-image",
      "name": "Echo Image",
      "capability": "image.t2i",
      "remoteModel": "echo-image",
      "inputs": ["text"],
      "modes": ["t2i"],
      "params": []
    }
  ]
}
```

- `provider.name` 是设置页显示的供应商名称。
- `baseUrl` / `headers` / `apiKeyEnv` 会传给适配器；`apiKeyEnv` 从环境变量读取，不写进配置文件。
- 每个模型的 `adapter` 会被强制设为 `local:<id>`，`localAdapter` 设为 `<id>`。
- 模型字段与 `models.json` 的官方模型一致；`capability`、`remoteModel`、`params` 必填。

## adapter.ts 接口

```ts
export default {
  async generate(input, ctx) {
    ctx.onProgress(20, '提交任务')
    const response = await fetch(input.provider.baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: input.prompt }),
      signal: ctx.signal
    })
    const buffer = Buffer.from(await response.arrayBuffer())
    return [{ data: buffer, mime: 'image/png' }]
  }
}
```

`input`：

| 字段 | 说明 |
|---|---|
| `model` | `id`、`name`、`capability`、`remoteModel`、`params` |
| `provider` | `baseUrl`、`apiKey`、`secretKey`、`headers` |
| `prompt` | 最终提示词（已拼接主体/风格约束） |
| `params` | 当前参数值 |
| `refs` | `LoadedRef[]`：`dataUrl`、`base64`、`mime`、`role`、`media` |
| `video` | 可选，`dataUrl`、`mime` |
| `videoOptions` | 可选，视频操作参数 |
| `mask` | 可选，PNG data URL |

`ctx`：

| 字段 | 说明 |
|---|---|
| `onProgress(percent, message?)` | 上报进度 |
| `signal` | `AbortSignal`，取消生成时触发 |

返回值：非空数组，每项：

```ts
{
  data: Uint8Array | Buffer
  mime: string
  text?: string
  layer?: AssetLayer
  textRecognition?: TextRecognition
}
```

当前不支持流式返回；一次返回完整结果。

## 构建与热重载

- `adapter.ts` 由 CineLab 用 esbuild 构建到 `.build/adapter.cjs`，`platform: node`、`format: cjs`、`packages: external`。
- 适配器自己的 npm 依赖需要安装在 `<id>/node_modules`；原生模块由适配器自己匹配 Electron ABI，CineLab 不负责编译。
- 保存 `adapter.ts` / `manifest.json` / `models.json` 后自动重建并重启该适配器的 utilityProcess。
- 构建失败只把适配器标记为 `error`，不影响应用和其他适配器；修复后自动恢复。
- 每个适配器一个 utilityProcess；崩溃只拒绝当前请求，下一次生成自动重启。

## 状态与排查

- `window.api.localAdapters.list()` 返回适配器状态、错误和模型数。
- `window.api.localAdapters.reload(id)` 手动重建。
- `window.api.localAdapters.openDir()` 打开适配器目录。
- 构建错误会包含 esbuild 的原始信息；适配器 `console.log` / `console.error` 会转发到主进程日志。

## 当前限制

- 只支持 `type: "code"`；`config` / `template` 类型预留，尚未接入。
- 打包后的 esbuild 二进制需要 `asarUnpack`；安装包验证在 S2b 收尾时进行。
- 设置页的本地适配器管理区块和模型「本地适配器」标注在 S2b。
- MCP 控制接口在 S2c；当前通过渲染进程 API 和文件监听使用。
