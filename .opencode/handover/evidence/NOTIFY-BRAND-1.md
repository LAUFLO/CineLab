# NOTIFY-BRAND-1 · 系统通知名称与图标

日期：2026-11-12
分支：`feat/sora-video`
状态：通过（应用名显示待用户目视确认）

## 问题

生成完成通知显示应用名为 `Electron`，图标为 Electron 默认图标。

## 修改

- `src/main/index.ts`：Windows 下调用 `app.setAppUserModelId('com.cinelab.app')`，与 `electron-builder.yml` 的 `appId` 一致
- `src/renderer/src/stores/generation.ts`：`new Notification` 增加 `icon: appIcon`（`src/renderer/src/assets/app-icon.png`）

## 验证

- 已确认安装版开始菜单快捷方式 `CineLab.lnk` 的 AUMID 为 `com.cinelab.app`
- `typecheck`、315 tests、`build` 通过
- 隔离实例发出测试通知，`Notification.permission = granted`，标题与正文正常

## 已知限制

- 开发模式下若系统未注册对应 AUMID，Windows 仍可能回退显示 Electron；打包安装后使用开始菜单快捷方式，名称与图标由 `CineLab.lnk` 决定。
