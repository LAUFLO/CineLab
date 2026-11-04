# M4-1 音频语音合成验证

- 日期：2026-11-04
- 方式：mock OpenAI `/v1/audio/speech` + CDP 操作 + DOM 核对

## 适配器

`src/main/providers/openai-compat.ts` 新增 `generateSpeech`：

```
POST {baseUrl}/audio/speech
body: { model, input, voice, speed, response_format }
响应: 音频二进制
```

- 支持 OpenAI 兼容的 TTS 接口
- 按响应头 `Content-Type` 决定落盘扩展名
- 错误走统一重试策略

## 模型预设

`OpenAI TTS`（`tts-1`）：

| 参数 | 选项 |
|---|---|
| 音色 | alloy / echo / fable / onyx / nova / shimmer |
| 语速 | 0.75x / 1.0x / 1.25x / 1.5x |
| 格式 | MP3 / Opus / AAC / WAV |

## 验证结果

| 项 | 结果 |
|---|---|
| 音频节点模型过滤 | 通过，只显示 OpenAI TTS |
| 提示词占位符 | 通过，音频专用文案 |
| 请求 `/audio/speech` | 通过 |
| 音频落盘 | 通过，`assets/aud/53b63d50….wav` |
| `<audio>` 加载 | 通过，`readyState=4`、时长 1.5s |
| 节点状态 | 通过，「已完成」 |

## 已知事项

- 只支持 OpenAI 兼容 TTS；音乐生成（`audio.music`）尚未接入。
- 测试期间 `settings.json` 曾被清空一次，已通过设置面板重建并验证。
- 角色库按用户决定并入后续「资产库」，不在 M4 实现。
