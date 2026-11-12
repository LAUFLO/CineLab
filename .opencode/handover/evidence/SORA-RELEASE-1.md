# SORA-RELEASE-1 · PR 合并与安装版验证

日期：2026-11-12
状态：通过

## 合并

- PR：#14 `feat: add Sora-style video adapter and notification branding`
- 合并提交：`03375de Merge pull request #14 from LAUFLO/feat/sora-video`
- 合并方式：merge commit；head branch 已删除
- CI：`Build Windows` 通过（4m09s）
- 合并前已同步 `origin/main`，解决 `state.json` 与 `docs/README.md` 冲突

## 打包与安装

- 最新 `main` 重新执行 `corepack pnpm dist:win`
- 安装包覆盖到 `Downloads\cinelab-sora-video`
- 静默安装 `/S` 到 `%LOCALAPPDATA%\Programs\CineLab`

## 安装版验证

通过 CDP（`CINELAB_DEBUG_PORT=9444`）连接安装版：

- `settings.listProviders()`：3 个供应商，`beeftv-local` 9 个模型（3 图片 + 6 视频）
- `settings.testConnection({ id: 'beeftv-local' })`：连接成功，发现 59 个模型
- 图片：`seedream-5-0-260128`，`size: 2048x2048` → 成功，写入项目 `assets/img/*.jpg`
- 视频：`seedance-2.0-mini`，`duration: 4` → 成功，`assets/vid/*.mp4`，864×496，24fps，4.096s，含音频
- 通知：`Notification.permission = granted`，已发出安装版测试通知

## 待确认

- 安装版系统通知的应用名与图标是否显示 CineLab（需要目视通知中心）
