# Sora 视频适配器方案

日期：2026-11-12
状态：已实施
适用版本：`main` @ `f454844`

## 背景

BeefTV 本地代理（`http://127.0.0.1:8787/v1`）提供 6 个 Seedance 视频模型，接口形态与 OpenAI Sora 一致：

```text
POST /v1/videos                    -> { id, status: "queued" }
GET  /v1/videos/{id}               -> { status: "in_progress" | "completed", video_url }
GET  /v1/videos/{id}/content       -> 视频二进制
```

CineLab 现有视频适配器（`volcengine-video`、`kling-video`、`minimax-video`、`agnes-video`、`http-template`）都假设轮询响应里直接带一个可公开下载的视频 URL。`openai-compat` 适配器只覆盖图片、文本、TTS、音乐，没有视频执行路径。

## 探测结论

2026-11-12 用 `seedance-2.0-mini` 发起 4 秒 480p 任务，真实响应：

- 创建：`{ "id": "task_...", "object": "video", "status": "queued", "progress": 0 }`
- 完成：`status: "completed"`，`progress: 100`，`video_url` 指向 `https://beeftv.app/v1/videos/{id}/content`
- 直连 `video_url`：不带 Key 返回 404，带本地代理 token 返回 401（上游只认真实 Key）
- 通过本地代理 `GET /v1/videos/{id}/content` 带本地 token：返回 `206 video/mp4`

因此下载不能使用响应里的 `video_url`，必须用视频 `id` 拼接 provider 的 `/videos/{id}/content` 端点，并携带 provider 的 Authorization。这样也兼容其他 Sora 风格网关。

## 设计

新增 `src/main/providers/sora.ts`，实现 `generateVideoSora`：

1. `POST {baseUrl}/videos`，body 为 `{ model, prompt, seconds? }`
2. 从响应取 `id`（兼容 `task_id`）
3. 每 3 秒 `GET {baseUrl}/videos/{id}`，最多 200 次（约 10 分钟）
4. `status === "completed"` 后 `GET {baseUrl}/videos/{id}/content` 下载视频
5. 失败状态 `failed` / `cancelled` 抛出上游错误信息
6. 连续 5 次查询失败才放弃

第一版只支持文生视频，模型 `inputs` 写 `["text"]`，不接收参考图。

## 改动清单

| 文件 | 改动 |
|---|---|
| `src/main/providers/sora.ts` | 新增 `generateVideoSora` |
| `src/main/engine/start-generation.ts` | 注册 `sora-video` 分支 |
| `src/main/settings/models-config.ts` | `ADAPTERS` 加入 `sora-video` |
| `scripts/models-check.mjs` | `ADAPTERS` 加入 `sora-video` |
| `docs/README.md` | 索引新增本文档 |
| `%APPDATA%\cinelab\models.json` | 追加 `beeftv-local` provider |

## 模型配置

`beeftv-local` provider，`baseUrl: http://127.0.0.1:8787/v1`：

- 图片：`seedream-5-0-260128`、`dola-seedream-5-0-flash-260915`、`dola-seedream-5-0-pro-260628`
  - `capability: image.t2i`，`inputs: ["text"]`
  - 参数：`size`、`n`
- 视频：`seedance-2.0`、`seedance-2.0-fast`、`seedance-2.0-mini`、`seedance-2.0-portrait`、`seedance-2.5`、`seedance-2.5-portrait`
  - `capability: video.t2v`，`adapter: "sora-video"`，`inputs: ["text"]`
  - 参数：`duration`（4–12，默认 5）

## 验证

1. `corepack pnpm models:check`（指定用户 models.json）
2. `corepack pnpm typecheck`
3. `corepack pnpm test`
4. `corepack pnpm build`
5. 隔离实例实测：Seedream 出图；`seedance-2.0-mini` 出 4 秒视频

## 兼容与回滚

- 新增 adapter 名称，不改现有视频默认推断（Seedance 未显式配置时仍走 `volcengine-video`）
- 不改 `openai-compat.ts`
- 配置回滚：覆盖 `models.json` 备份
- 代码回滚：`git revert` 单个提交即可

## 实施记录

2026-11-12 完成：

- 新增 `src/main/providers/sora.ts`，注册 `sora-video` 分支和两处 adapter 白名单
- 新增 `src/main/providers/__tests__/sora.test.ts`，覆盖提交、轮询、下载、失败和缺少任务 ID
- `models.json` 追加 `beeftv-local`：3 个 Seedream 图片 + 6 个 Seedance 视频
- `typecheck` 通过，43 文件 315 测试通过，`build` 通过
- 真实烟测：`seedream-5-0-260128` 生成 2048×2048 图片；`seedance-2.0-mini` 生成 4 秒 864×496 视频（24fps，含音频）

### Seedream 尺寸限制

实测 `seedream-5-0-260128` 的 `size` 有总像素下限：

| 尺寸 | 结果 |
|---|---|
| 1024×1024 | 拒绝（size exceeds pixel or aspect-ratio limits） |
| 1536×1024 | 拒绝 |
| 2048×1152 | 拒绝 |
| 2048×2048 | 通过 |
| 2560×1440 | 通过 |

配置里的尺寸选项已改为 2K 级：2048×2048、2560×1440、1440×2560、2496×1664、1664×2496、2304×1728、1728×2304，默认 2048×2048。9:16 及 3:2 等比例为同像素量级推断，未逐一实测。
