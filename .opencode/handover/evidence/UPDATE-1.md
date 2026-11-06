# UPDATE-1 · 自动更新功能验证记录

日期：2026-11-06
范围：electron-updater 接入（检查更新 / 下载 / 重启安装入口）

## 实现

- `electron-updater` 6.8.11
- 主进程更新服务：检查、下载、安装、状态广播、启动后静默检查
- IPC / preload / shared 类型
- 设置 → 关于：版本号、检查更新、下载进度、重启并安装、发布说明
- 顶栏：检测到新版本或下载完成时显示更新图标
- 发布配置：generic provider 指向 GitHub Releases `latest/download`
- 本地测试：`dev-app-update.yml` + `scripts/mock-update-server.mjs`

## 验证结果

### 构建与打包

- `node scripts/typecheck.mjs`：通过
- `corepack pnpm build`：通过
- `electron-builder --win --publish never`：通过
- `release/win-unpacked/resources/app-update.yml` 正确生成

### 检查更新（打包态 + 本地 mock）

- 启动 mock server：`latest.yml` 版本 0.1.1，测试包 8MB
- 打包应用设置 `CINELAB_UPDATE_URL=http://127.0.0.1:8788`
- `window.api.update.check()` 后状态：

```json
{
  "state": "available",
  "currentVersion": "0.1.0",
  "latestVersion": "0.1.1",
  "releaseNotes": "本地 mock 更新包，用于验证检查与下载流程。\n"
}
```

### 下载更新

- `window.api.update.download()` 后状态：

```json
{
  "state": "downloaded",
  "percent": 100,
  "transferred": 8388608,
  "total": 8388608
}
```

### UI

- 关于页版本读取为 0.1.0
- 更新卡片显示「新版本 0.1.1 已下载」和「重启并安装」
- 顶栏更新图标出现，点击打开设置 → 关于

## 未验证 / 后续

- 真实 GitHub Release 检查与下载（当前未发包）
- 「重启并安装」实际执行（测试包为占位文件）
- 代码签名、镜像/备用源、灰度/强制更新、差分更新
- 正式发版时需要提升版本号并用 `--publish always` 创建 Release
