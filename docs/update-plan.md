# 自动更新方案

> 状态：已实现（随 v0.1.0 首发启用）
> 日期：2026-11-06
> 适用版本：v0.1.0
> 最后核对：2026-11-14
> 关联：`electron-builder.yml`、`src/main/update/`、`src/renderer/src/panels/SettingsPanel.tsx`

## 0. 结论

使用 `electron-updater` + electron-builder 的 NSIS 安装包做自动更新。更新源按 GitHub Releases 的 `latest/download` 配置，本地测试通过环境变量覆盖为 mock 服务器。发布由 `.github/workflows/release.yml` 在 `v*` tag 时自动构建并上传；默认只检查版本，下载和安装需要用户手动确认。

## 1. 用户交互

- 主入口：设置 → 关于。
  - 显示当前版本。
  - 「检查更新」按钮。
  - 状态：检查中、已是最新、发现新版本、下载中、下载完成、失败。
  - 下载进度条。
  - 「重启并安装」按钮。
- 画布顶栏：仅在检测到新版本或下载完成时显示一个小图标，点击打开设置 → 关于。
- 不在画布工具栏加常驻更新按钮。
- 启动后延迟静默检查一次；不做自动下载，下载由用户触发。

## 2. 数据与状态

`src/shared/update.ts`：

```ts
type UpdateState =
  | 'idle'
  | 'checking'
  | 'not-available'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'error'
  | 'unsupported'

interface UpdateStatus {
  state: UpdateState
  currentVersion: string
  latestVersion?: string
  releaseNotes?: string
  releaseDate?: string
  percent?: number
  transferred?: number
  total?: number
  error?: string
  canCheck: boolean
}
```

主进程保存当前状态，通过 `update:event` 广播给所有窗口；渲染进程挂载时用 `update:get-state` 取初始值。

## 3. 主进程

`src/main/update/service.ts`：

- `autoUpdater.autoDownload = false`
- `autoUpdater.autoInstallOnAppQuit = false`
- `autoUpdater.allowPrerelease = false`
- 打包态直接使用 `app-update.yml`。
- 开发态需要 `CINELAB_UPDATE_DEV=1` 且项目根存在 `dev-app-update.yml`。
- `CINELAB_UPDATE_URL` 可在运行时覆盖更新源，用于 mock 测试。
- 启动后延迟 8 秒静默检查一次。
- 事件映射：`checking-for-update`、`update-available`、`update-not-available`、`download-progress`、`update-downloaded`、`error`。
- 错误统一转成用户可读文案，原始错误写 console。

`src/main/ipc/update.ts`：

- `update:get-state`
- `update:check`
- `update:download`
- `update:install`

## 4. 发布配置

`electron-builder.yml` 增加：

```yaml
publish:
  provider: generic
  url: https://github.com/LAUFLO/CineLab/releases/latest/download
```

这会让打包产物生成 `app-update.yml`。CI 使用 `--publish never` 构建，再由 `release.yml` 上传 exe、zip、`latest.yml`、blockmap 和 `SHA256SUMS.txt`。

正式发版时：

1. 提升 `package.json` 版本号。
2. 打 tag（如 `v0.1.1`）。
3. `release.yml` 创建 GitHub Release，上传 exe、zip、`latest.yml`、blockmap 和 `SHA256SUMS.txt`。
4. 应用即可从 `releases/latest/download/latest.yml` 检查更新。

## 5. 本地测试

- `scripts/mock-update-server.mjs`：本地 HTTP 服务器，提供 `latest.yml` 和假安装包（sha512 由脚本计算）。
- 打包应用启动时设置 `CINELAB_UPDATE_URL=http://127.0.0.1:8788`。
- 验证检查更新、发现版本、下载进度、下载完成；不执行安装。
- 开发态测试设置 `CINELAB_UPDATE_DEV=1`，读取 `dev-app-update.yml`。

## 6. 暂不做

- 代码签名（未签名会有 SmartScreen 提示，但更新流程可用）。
- macOS 自动更新（Squirrel.Mac 要求 Apple 签名；首版未签名，关闭自动更新）。
- 灰度发布、强制更新、差分更新。
- 国内镜像/备用更新源。
- 自动下载和自动安装（当前均为手动触发）。

## 7. 风险

- electron-updater 在开发态默认不工作，必须用打包态做端到端验证。
- GitHub 下载在国内可能不稳定，后续需要镜像或自建 CDN。
- 未签名安装包首次运行会被 SmartScreen 拦截，正式发版前应安排签名。
- 更新包必须使用与用户架构、安装方式一致的 NSIS 包。
