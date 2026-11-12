# CineLab · Boot Packet

> **下一会话优先**：创建并合并 `feat/sora-video` PR；合并后安装 `Downloads\cinelab-sora-video` 新包，验证通知与 Seedance/Seedream 生成。

## 状态

2026-11-12：Sora 视频适配器与通知品牌修复完成，分支 `feat/sora-video`（`26c6bcd`）已推送。

- `typecheck`、315 tests、`build` 通过
- 安装包：`Downloads\cinelab-sora-video`
- 本地配置：`%APPDATA%\cinelab` 已加 9 个 BeefTV 模型并写入加密 Key
- 通知 AUMID 已对齐 `com.cinelab.app`，待安装版确认

## Frontier

1. 创建 PR 并合并 `feat/sora-video`（下一项）
2. 安装新包，验证通知与 Seedance/Seedream
3. CineBot Phase 1
4. PR #2 review/merge

## Gates

- G-SORA-INSTALL：安装版未验证通知与生成。
- G-AGENT-VIDEO：Agnes Video 队列 503。

## Lessons

- Sora 视频必须用 provider `baseUrl + /videos/{id}/content` 下载，上游 `video_url` 只认上游 Key。
- Electron `safeStorage` 绑定 userData 的 `Local State`，跨 userData 无法解密。
- Windows toast 名称/图标由 AUMID 对应快捷方式决定，需与 `electron-builder` 的 `appId` 一致。

## 证据

`evidence/SORA-VIDEO-1.md`、`evidence/NOTIFY-BRAND-1.md`、`docs/sora-video-plan.md`。

## 约定

视频协议独立 `providers/<protocol>.ts`；UI 与 Agent 共用执行器；主题只走 `styles/tokens.css`。
