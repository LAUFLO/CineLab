# 参考音频链路方案

日期：2026-11-17
状态：历史（2026-11-18 归档）
关联：[models.md](../models.md)、[ui-spec.md](../ui-spec.md)、[architecture.md](../architecture.md)

## 1. 背景

模型配置里已经声明了 `audio` 输入能力（Agnes Video 2.5 / 2.5 Flash 的 `inputs` 含 `audio`），但整条参考音频链路有四处断点：

1. `PromptBar.tsx` 的槽位渲染遇到 `slot.media === 'audio'` 直接 `return []`。
2. `promptbar-model.tsx` 的 `RefKind` 只有 `image | video`，音频进不了 `pickedRefs`。
3. `start-generation.ts` 的 `REF_MIME` 只认图片，音频扩展名被跳过。
4. `agnes.ts` 的 reference 模式只构造 `body.images`，没有 `body.audios`。

这不是接口问题，也不是只改 `models.json` 能绕过的配置问题，需要在主程序和 UI 两侧补链路。

## 2. 实测结论

2026-11-17 用真实 Key 对 Agnes Video 2.5 Flash 做了三组对照，模型、提示词、时长、画幅完全一致，唯一变量是 `audios` 内容：

| 组 | `audios` 内容 | 创建任务 | 最终状态 | 错误 |
|---|---|---|---|---|
| A | 真实 3 秒 wav Data URI | HTTP 200 | `completed`，返回视频 URL | 无 |
| B | 假数据 `data:audio/mpeg;base64,AAAA` | HTTP 200 | `failed` | `invalid_media: input audio or video is invalid or unsupported` |
| C | 假链接 `https://example.com/nope.mp3` | HTTP 200 | `failed` | `media URL could not be downloaded or did not return valid supported media` |

结论：

1. **Data URI 可用**。A 组没有使用公网 URL，任务正常完成。
2. **音频真实参与**。B 组假数据被服务端解码并拒绝，说明服务端会读取音频内容，不是只检查字段非空。
3. **不需要托管**。不引入对象存储、第三方图床或内网穿透。
4. **创建 200 只代表入队成功**。媒体错误在异步任务阶段返回，必须把 `failed` 的 `error.message` 透传到 UI。
5. **不做本地硬限制**。音频时长、大小、数量交给供应商 API 校验；本地只做扩展名识别和明确报错。
6. 纯音频 `reference` 也能创建并完成，不需要同时提供图片。

## 3. 支持矩阵

| 适配器 / 模型 | 参考音频 | 行为 |
|---|---|---|
| `agnes-video`（2.5 / 2.5 Flash） | 支持 | reference 模式发送 `audios` Data URI |
| `sora-video` | 不支持 | 主进程明确报错 |
| `minimax-video` / `kling-video` | 不支持 | 主进程明确报错 |
| `volcengine-video` | 不支持 | 主进程明确报错 |
| `http-template` | P1 | 本期明确报错，后续增加 `refs.audios` 占位符 |
| 图片 / 文本 / TTS / 音乐模型 | 不支持 | 主进程明确报错，UI 不提供入口 |

## 4. 设计原则

1. 参考音频只属于视频节点的「全能参考」模式，不扩到其他节点类型。
2. 能力判定看模型显式 `inputs`，不看 `features`（`features` 语义是输出特性）。
3. 音频时长、大小、数量不做本地硬限制，供应商错误原样展示。
4. 首尾帧模式与参考音频互斥。
5. 任何执行器不支持的参考媒体，必须在主进程入口报错，禁止透传后静默丢弃。
6. 切换模型后残留的音频引用保留数据，槽位置灰，生成时拦截。

## 5. 数据契约

```ts
// src/shared/generation.ts
export type ReferenceMedia = 'image' | 'video' | 'audio'

export interface ReferenceInput {
  path: string
  role: ReferenceRole
  scope?: AssetScope
  /** 可选；省略时主进程按扩展名推断，旧数据和 Agent 请求无需迁移 */
  media?: ReferenceMedia
}
```

主进程 `loadRefs` 统一返回：

```ts
interface LoadedRef {
  dataUrl: string
  role: string
  media: 'image' | 'audio'
  mime: string
}
```

能力判定：

```ts
// src/shared/provider-schema.ts
export function supportsReferenceAudio(model: ModelDef): boolean {
  if (model.inputs && model.inputs.length > 0) {
    return model.inputs.includes('audio')
  }
  return model.adapter === 'agnes-video' || /^agnes-video/i.test(model.remoteModel)
}
```

## 6. 防静默丢弃统一校验

### 6.1 位置

`src/main/engine/reference-inputs.ts` 提供纯函数，`start-generation.ts` 在 `loadRefs` 之后调用。这里是普通生成与 Agent 提案共用的唯一入口。

### 6.2 上下文

```ts
export interface ReferenceInputContext {
  isVideo: boolean
  adapter: string
  model: ModelDef
  imageCount: number
  audioCount: number
  hasSourceVideo: boolean
  hasMask: boolean
  hasKeyframe: boolean
}

/** 返回第一条命中的错误；全部通过返回 null */
export function referenceInputError(ctx: ReferenceInputContext): string | null
```

### 6.3 判定顺序

| 顺序 | 条件 | 错误文案 |
|---|---|---|
| 1 | `audioCount > 0 && !isVideo` | 当前类型的模型不支持参考音频 |
| 2 | `audioCount > 0 && !supportsReferenceAudio(model)` | 当前模型不支持参考音频，请在设置 → 模型 → 模型配置中勾选「音频」输入 |
| 3 | `audioCount > 0 && hasKeyframe` | 首尾帧模式不支持参考音频，请切换到全能参考模式 |
| 4 | `audioCount > 0 && hasSourceVideo` | 视频编辑模式不支持参考音频 |
| 5 | `audioCount > 0 && adapter !== 'agnes-video'` | 当前视频适配器暂不支持参考音频 |
| 6 | `imageCount > 0 && !modelInputs(model).includes('image')` | 该模型不支持图片输入，请在设置 → 模型 → 模型配置中勾选「图片」 |
| 7 | `hasMask && !modelInputs(model).includes('image')` | 该模型不支持蒙版编辑 |
| 8 | `hasSourceVideo && !modelInputs(model).includes('video')` | 该模型不支持参考视频，请选择支持视频输入的模型 |

命中即返回第一条，不收集列表。

UI 层还会额外拦截「输入模式不是全能参考」：`t2v`、首帧、首尾帧连接音频时都提示切换到全能参考，避免 UI 选文生视频、实际请求被升级成 `reference`。

### 6.4 覆盖范围

| 场景 | 结果 |
|---|---|
| 视频 + Agnes + 纯音频 | 放行 |
| 视频 + Agnes + 图 + 音频 | 放行 |
| 视频 + Agnes + 首尾帧 + 音频 | 拒绝 |
| 视频 + Sora / Minimax / Kling / 火山 | 拒绝 |
| 视频 + http-template | 拒绝（P1 支持） |
| 图片 / 文本 / TTS / 音乐 + 音频 | 拒绝 |
| 任意模型 + 超出能力的图片 / 视频 / 蒙版 | 拒绝 |

### 6.5 UI 配合

1. 非视频节点或模型不支持音频时，不渲染「参考音频」槽位。
2. 音频节点连到不支持的节点时，`onConnect` 后提示一次，用 edge id 去重。
3. 切换模型后残留的音频引用置灰，不删除数据。
4. 从全能参考切到其他输入模式时，如果存在音频引用，切换动作本身给出提示。
5. UI 与主进程使用同一套文案常量。

## 7. 代码改动

### 共享层

| 文件 | 改动 |
|---|---|
| `src/shared/generation.ts` | `ReferenceInput` 增加可选 `media` |
| `src/shared/provider-schema.ts` | 新增 `supportsReferenceAudio()` |

### 主进程

| 文件 | 改动 |
|---|---|
| `src/main/engine/reference-inputs.ts` | 新增统一校验纯函数 |
| `src/main/engine/start-generation.ts` | MIME 拆分图片 / 音频；`loadRefs` 返回 `media`；接入统一校验；替换 `refs.length > 0` 的误判 |
| `src/main/providers/agnes.ts` | 拆分 `images` / `audios`；修正 mode 推断；轮询间隔 2s → 3s |

### 渲染层

| 文件 | 改动 |
|---|---|
| `src/renderer/src/canvas/promptbar-model.tsx` | `RefKind` 增加 `'audio'` |
| `src/renderer/src/canvas/PromptBar.tsx` | 收集音频、`rawRefs` 计数、`mergedRefs` 提前返回、槽位渲染、缩略图、预览、生成前拦截 |

### 测试

| 文件 | 内容 |
|---|---|
| `src/main/engine/__tests__/reference-inputs.test.ts` | 8 条判定分支 |
| `src/main/providers/__tests__/agnes.test.ts` | `buildAgnesBody()` 纯音频、图+音频、首尾帧+音频 |
| `src/shared/__tests__/model-inputs.test.ts` | `supportsReferenceAudio()` 三种输入 |

## 8. 后续（P1）

1. `http-template` 增加 `refs.audios` / `refs.audio` 占位符。
2. mention 菜单和资产库增加音频入口。
3. 模式描述按模型能力动态化，不支持的媒体不出现在文案里。
4. `generateText` 的 `refs` 参数收窄为图片专用。
5. 清理 `inferModelInputs` 从 modes 推导出 audio 的副作用。
6. TTS 音色参考、音乐风格参考单独设计，不复用视频的 `reference` 语义。
