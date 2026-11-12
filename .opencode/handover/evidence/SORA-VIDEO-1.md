# SORA-VIDEO-1 · Sora 风格视频适配器

日期：2026-11-12
分支：`feat/sora-video`
状态：通过

## 改动

- 新增 `src/main/providers/sora.ts`：`POST /videos` 提交，3 秒轮询 `/videos/{id}`，完成后从 `/videos/{id}/content` 下载并返回 Buffer
- `src/main/engine/start-generation.ts`：注册 `sora-video` 分支
- `src/main/settings/models-config.ts`、`scripts/models-check.mjs`：adapter 白名单加入 `sora-video`
- `src/main/providers/__tests__/sora.test.ts`：3 个用例
- 用户 `models.json` 追加 `beeftv-local`：3 个 Seedream 图片 + 6 个 Seedance 视频

## 自动化验证

```text
corepack pnpm typecheck   # 通过
corepack pnpm test        # 43 文件 315 用例通过
corepack pnpm build       # 通过
node scripts/models-check.mjs %APPDATA%\cinelab\models.json
# [models:check] 格式正确：3 个供应商，13 个模型
```

## 真实端到端

隔离实例（`CINELAB_USER_DATA=%TEMP%\cinelab-sora-test`，CDP 9333）：

- 图片：`beeftv-local/seedream-5-0-260128`，`size: 2048x2048` → 成功，`assets/img/*.jpg`，2048×2048
- 视频：`beeftv-local/seedance-2.0-mini`，`duration: 4` → 成功，`assets/vid/*.mp4`，864×496，24fps，4.096s，含音频
- 视频进度事件 26 条，run 完成状态 `done`

## Seedream 尺寸限制

`seedream-5-0-260128` 拒绝低像素尺寸，实测：

| 尺寸 | 结果 |
|---|---|
| 1024×1024 | 400 size exceeds limits |
| 1536×1024 | 400 |
| 2048×1152 | 400 |
| 2048×2048 | 200 |
| 2560×1440 | 200 |

配置选项已改为 2K 级尺寸，默认 2048×2048。

## 已知限制

- `sora-video` 第一版只做文生视频，`inputs: ["text"]`
- 视频 `size` 未传，输出比例由上游默认（测试为 16:9 864×496）
- 9:16、3:2 等尺寸为同像素量级推断，未逐一实测
- 用户需在 CineLab 设置页为 `beeftv-local` 填一次 Key；本次隔离实例用 `BEEFTV_PROXY_KEY` 环境变量完成验证
