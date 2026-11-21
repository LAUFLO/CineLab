# 视频首尾帧媒体传输方案

日期：2026-11-21
状态：方案（P0 已实施）
适用版本：v0.4.0

## 背景

Agnes Video 2.5 Flash 的首帧模式此前没有锁定输入图片。排查后确认，问题不在 CineLab 侧的 PromptBar 角色分配，而在适配器把 `data:image/...;base64,...` 直接塞进了 `first_frame`。Agnes keyframe 接口接受图片 URL 或纯 base64，带 `data:` 前缀的字符串不会被当作真正的首帧。

截至本方案：

- Agnes 的 `first_frame` / `last_frame` 已改为纯 base64（`src/main/providers/agnes.ts`）；
- Kling 的 `image` / `image_tail` 本来就用 `base64Of` 去掉前缀；
- 其余视频适配器的媒体格式仍不统一，需要一次性收敛，而不是逐个模型试错。

## 现状矩阵

| 适配器 | 首帧字段 | 尾帧字段 | 当前传值 | 风险 |
|---|---|---|---|---|
| Agnes | `first_frame` | `last_frame` | 纯 base64（已修） | 无 |
| Kling | `image` | `image_tail` | 纯 base64（`base64Of`） | 无 |
| MiniMax | `first_frame_image` / `last_frame_image` | 同上 | data URL | 取决于 MiniMax 是否接受 data URL |
| 火山 Seedance | `image_url.url` + role | 同上 | data URL | 取决于火山是否接受 data URL |
| Sora | multipart `input_reference` | — | Blob / data URL 回退 | 已按文件上传处理 |
| OpenAI 兼容 | `image_url.url` | — | data URL | 多数兼容站接受 |
| http-template | `{{refs.firstFrame}}` | `{{refs.lastFrame}}` | data URL | 模板无法直接拿纯 base64 |

## 根因分类

1. **格式不统一**：`dataUrl`、纯 base64、公网 URL 三种格式混用，适配器各自切字符串。
2. **URL 要求**：Agnes 官方要求媒体 URL 可由其服务访问；纯 base64 是可用的兼容路径，但不是所有供应商都如此。
3. **字段名差异**：`first_frame`、`image`、`first_frame_image`、`image_url`、`input_reference` 分属不同协议。
4. **校验与角色分配分散**：PromptBar 负责把第一张图设为 `firstFrame`，主进程又做一次数量校验；两处规则不一致时会出现“界面选了首帧，请求里没有首帧”。

## 通用方案

目标不是给每个模型加一套 UI，而是把“本地媒体 → 供应商请求”的转换收敛到一层。

### 1. 统一媒体载荷

在 `start-generation` 的 `loadRefs` 中一次性生成：

```ts
interface LoadedRef {
  dataUrl: string   // data:image/png;base64,...
  base64: string    // 去掉 data URL 前缀
  mime: string
  role: string
  media: 'image' | 'audio'
}
```

适配器只从 `LoadedRef` 取自己需要的格式，不再各自解析 data URL。

### 2. 适配器契约

在 provider 层提供共享 helper：

- `ref.dataUrl`：OpenAI 兼容、MiniMax、火山等常用格式；
- `ref.base64`：Agnes keyframe、Kling 等；
- `ref.publicUrl`（可选）：只有模型声明需要公网 URL 且用户允许上传时才有值。

是否使用公网 URL 由适配器/模型能力决定，不进入 PromptBar。

### 3. 首尾帧校验统一

抽取共享校验函数，主进程和 PromptBar 共用同一套规则：

- `first-frame`：必须恰好 1 张图片，只能有首帧；
- `first-last`：必须恰好 2 张图片，第一张首帧、第二张尾帧；
- `reference`：首帧/尾帧字段必须为空，图片走参考图数组。

PromptBar 负责角色分配，主进程负责二次校验；两边使用同一常量，避免“界面能发、主进程拒绝”或反向情况。

### 4. http-template 变量

新增模板变量，避免模板作者自己处理前缀：

- `{{refs.firstFrameBase64}}` / `{{refs.lastFrameBase64}}`
- `{{refs.firstFrameMime}}` / `{{refs.lastFrameMime}}`

保留现有 `{{refs.firstFrame}}` / `{{refs.lastFrame}}` 作为 data URL，保持向后兼容。

### 5. 可选上传层

如果某个供应商明确只接受公网 URL：

- 定义 `MediaHost` 接口（上传 → 返回 URL）；
- 只有模型声明 `needsPublicUrl` 且用户确认后才启用；
- 默认关闭，不上传用户素材到第三方；
- 上传结果只在任务生命周期内缓存，不写入项目。

### 6. 测试矩阵

每个视频适配器至少覆盖：

- 只有首帧 → 请求体字段正确，格式正确；
- 首帧 + 尾帧 → 两个字段都存在；
- 首尾帧与参考图互斥 → 不会被同时发送；
- 首帧参数为空/格式错误 → 明确报错，不静默降级成文生视频。

## 分阶段

| 阶段 | 内容 | 状态 |
|---|---|---|
| P0 | Agnes 首帧/尾帧改纯 base64；Kling 复用统一 helper | Agnes 已完成，Kling 待抽取 |
| P1 | 按官方文档验证 MiniMax、火山 Seedance 的 data URL 支持 | 待实施 |
| P2 | http-template 增加 base64/mime 变量并更新模型文档 | 待实施 |
| P3 | 可选 `MediaHost` 上传层（需要用户确认隐私与费用） | 按需 |

## 影响模块

- `src/main/engine/start-generation.ts`：`LoadedRef` 与 `loadRefs`
- `src/main/providers/agnes.ts`、`kling.ts`、`minimax.ts`、`volcengine.ts`、`http-template.ts`、`model-body.ts`、`sora.ts`
- `src/shared/provider-schema.ts`：模型媒体格式声明（可选）
- `src/shared/reference-inputs.ts`：首尾帧共享校验
- `src/renderer/src/canvas/PromptBar.tsx`：角色分配与校验调用
- `docs/models.md`：http-template 新变量说明

## 验收

- 首帧模式：生成视频的首帧与输入图片构图一致；
- 首尾帧模式：首帧、尾帧都与输入一致；
- 每个适配器的请求体单测通过；
- `typecheck`、`test`、`check:ui` 通过；
- 不引入默认外部上传。

## 决策记录

1. 不按模型写 PromptBar 分支；统一在媒体载荷和适配器层解决。
2. 不默认上传素材到第三方；公网 URL 能力必须显式开启。
3. 首尾帧校验只保留一套规则，UI 与主进程共用。
