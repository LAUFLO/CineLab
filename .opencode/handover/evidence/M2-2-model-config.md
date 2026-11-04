# M2-2 模型配置与加密存储验证

- 日期：2026-11-04
- 方式：CDP 操作 UI + 读取 settings.json 核对

## 存储位置

`C:\Users\Administrator\AppData\Roaming\cinelab\settings.json`

## 验证结果

| 项 | 结果 |
|---|---|
| 设置面板打开 / 关闭 | 通过，右侧 420px 抽屉 + 遮罩 |
| 添加供应商表单 | 通过，名称 / Base URL / API Key / 模型列表 |
| 快速添加模型 | 通过，GPT Image 1、DALL·E 3、GPT-4o mini |
| 保存 Provider | 通过，列表出现卡片 |
| API Key 加密 | 通过，文件中只有 `encryptedKey` 密文，无明文 |
| prompt bar 读模型 | 通过，显示「GPT Image 1」 |
| 参数行动态生成 | 通过，尺寸 1:1 / 画质 自动 / 数量 1 |
| 参数切换 | 通过，点击尺寸后变为 3:2 |

## 测试数据

保存了一个测试供应商：

- 名称：Test Provider
- Base URL：https://api.openai.com/v1
- Key：假值 `sk-test-key-123`（已加密）

> 正式使用前需要在设置里把它改成真实 Base URL 和 Key。

## 未验证

- 真实 API 的连接测试（需要有效 Key）
- 自定义模型（非预置）的添加，留到 M2-3 或之后
