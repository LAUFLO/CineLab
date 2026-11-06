# 模型配置统一方案

> 状态：已确认，实施中
> 日期：2026-11-06
> 关联：`docs/models.md`、`src/main/settings/`、`src/renderer/src/panels/SettingsPanel.tsx`

## 0. 一句话结论

`models.json` 成为唯一的供应商与模型清单，`settings.json` 只保存加密后的 Key/Secret。设置页不再区分配置来源，新增、编辑、删除都直接维护 `models.json`。

## 1. 现状问题

- 设置页添加的供应商写入 `settings.json`，`models.json` 只作为外部只读配置读取，两者不会互相写入。
- 用户看到设置页有供应商，但 `models.json` 显示 0 个，误以为配置没有保存。
- 同一份供应商信息被拆到两个文件，来源标记和只读规则增加理解成本。

## 2. 数据职责

### models.json

位置：`app.getPath('userData')/models.json`（Windows 下为 `%APPDATA%\cinelab\models.json`）。开发态与打包态使用同一路径，不再额外读取仓库根。

```json
{
  "version": 1,
  "providers": [
    {
      "id": "provider-uuid",
      "name": "MOSS",
      "type": "openai-compat",
      "baseUrl": "https://api.mosi.cn/v1",
      "apiKeyEnv": "MOSS_API_KEY",
      "models": [
        {
          "id": "moss-image-sft-1.0",
          "name": "moss-image-sft-1.0",
          "capability": "image.t2i",
          "remoteModel": "moss-image-sft-1.0",
          "params": []
        }
      ]
    }
  ]
}
```

规则：

- 只保存供应商与模型元数据，不保存 Key。
- `apiKeyEnv` 保留，用于从环境变量读取 Key。
- 明文 `apiKey` 字段仅做读取兼容：读到时忽略，并在设置页显示警告，提示改用设置页或环境变量。
- 应用内保存永远不写入 Key。

### settings.json

位置：`app.getPath('userData')/settings.json`。

```json
{
  "version": 2,
  "providerKeys": {
    "provider-uuid": {
      "encryptedKey": "base64...",
      "encryptedSecret": "base64..."
    }
  }
}
```

规则：

- 只保存 safeStorage 加密后的 Key/Secret。
- 旧版本 `providers` 数组迁移后删除。
- 不保存供应商名称、Base URL、模型列表。

## 3. Key 解析优先级

1. `settings.json` 中该 provider 的加密 Key
2. `models.json` 中 `apiKeyEnv` 指向的环境变量
3. 明文 `apiKey`：忽略并警告

可灵同时支持 `encryptedSecret` 生成 JWT。

## 4. 迁移

启动时执行一次 `migrateLegacySettings()`：

1. 读取 `settings.json`。如果是 version 1 且存在 `providers` 数组，进入迁移。
2. 读取 `models.json`（不存在则创建空配置）。
3. 对每个旧 provider：
   - `models.json` 中没有同 id 时，写入元数据（id、name、type、baseUrl、models）。
   - 已有同 id 时保留文件中的元数据。
   - `encryptedKey` / `encryptedSecret` 写入 `providerKeys[id]`。
4. 原子写入 `models.json`，成功后写入 `settings.json` version 2。
5. 迁移成功后删除旧 `providers` 字段；迁移失败保留原文件，下次启动重试。
6. 迁移不覆盖 `models.json` 已有的同 id 条目，避免覆盖手工配置。

## 5. 主进程接口

- `modelsFilePath()`：返回唯一配置文件路径。
- `loadModelsConfig()`：读取并解析，返回 providers、warnings、errors。
- `saveModelsConfig(providers)`：原子写入。
- `listProviders()`：合并 models.json 元数据与 settings.json 的 Key 状态，不再返回 `source`。
- `saveProvider(input)`：写 models.json 元数据；非空 Key 加密写 settings.json。
- `deleteProvider(id)`：从 models.json 删除，同时清理 providerKeys。
- `resolveProvider(id)` / `testConnection` / `fetchModels`：统一从 models.json + providerKeys 解析。
- `startModelsWatcher()`：监听配置文件变化，防抖后广播 `settings:models-changed`。

并发：写操作串行化，避免连续保存互相覆盖。

## 6. 设置页

- 顶部标题改为「模型供应商配置」。
- 保留路径、供应商/模型计数、重新加载、打开文件按钮。
- 去掉 `models.json` 来源标记和「只读」。
- 所有供应商统一可编辑、可删除。
- 监听 `settings:models-changed`，外部修改文件后自动刷新。
- 解析错误与明文 Key 警告显示在列表上方。

## 7. 验收

- 旧设置数据迁移后，供应商全部出现在 `models.json`，Key 仍可用。
- 设置页新增/编辑/删除供应商，`models.json` 立即更新。
- 设置页保存 Key 后，`models.json` 不出现 Key 明文。
- 手工编辑 `models.json` 后，设置页自动刷新；重新加载按钮仍可用。
- 明文 `apiKey` 被忽略并显示警告。
- `pnpm typecheck`、`pnpm build` 通过。
- 启动、保存、删除、测试连接、获取模型列表均正常。

## 8. 风险

- 迁移会删除 `settings.json` 的旧 `providers` 字段，迁移前确保写 models.json 成功。
- 文件监听在 Windows 上会收到多次事件，需要防抖。
- 外部手工编辑与设置页同时写入时，以最后一次写入为准；当前为单机单进程，风险可控。
