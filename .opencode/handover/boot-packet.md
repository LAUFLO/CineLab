# CineLab · Boot Packet

> **下一会话优先**：继续 CineBot Phase 1 能力补齐；PR #2 review/merge。

## 状态

2026-11-12：Sora 视频适配器与通知品牌已合并进 main，安装版验证通过。

- `main` @ `03375de`（PR #14 已合并，CI 4m09s）
- 安装包已覆盖 `Downloads\cinelab-sora-video` 并静默安装
- 安装版：3 供应商 / `beeftv-local` 9 模型；`testConnection` 发现 59 模型
- 安装版生成：Seedream 2048×2048 图片、Seedance 2.0 Mini 4 秒视频成功
- 通知已发出，应用名/图标待目视确认

## Frontier

1. CineBot Phase 1 能力补齐（下一项）
2. PR #2 review/merge
3. 安装版通知品牌目视确认
4. 交接文件更新提交（可开 docs PR）

## Gates

- G-NOTIFY-CONFIRM：安装版通知名称/图标待用户确认。
- G-AGENT-VIDEO：Agnes Video 队列 503。

## Lessons

- Sora 视频用 provider `baseUrl + /videos/{id}/content` 下载，上游 `video_url` 只认上游 Key。
- Electron `safeStorage` 绑定 userData 的 `Local State`，跨 userData 无法解密。
- PR 要求分支与 main strict 一致；先 merge origin/main，`state.json` 冲突按 id 合并双方 frontier。
- Windows toast 名称/图标由 AUMID 对应快捷方式决定，需与 `electron-builder` 的 `appId` 一致。

## 证据

`evidence/SORA-RELEASE-1.md`、`SORA-VIDEO-1.md`、`NOTIFY-BRAND-1.md`、`docs/sora-video-plan.md`。

## 约定

视频协议独立 `providers/<protocol>.ts`；UI 与 Agent 共用执行器；主题只走 `styles/tokens.css`。
