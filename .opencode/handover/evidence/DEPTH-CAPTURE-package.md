# DEPTH-CAPTURE 打包验证

日期：2026-11-06
方案：`docs/depth-capture-plan.md`

## 构建

命令：

```powershell
corepack pnpm exec electron-builder --win "--config.directories.output=C:/Users/Administrator/AppData/Local/Temp/cinelab-release"
```

产物：

| 文件 | 体积 |
|---|---|
| `CineLab Setup 0.1.0.exe` | 225.6MB |
| `CineLab-0.1.0-win.zip` | 288.3MB |
| `app.asar` | 18.7MB |

## 检查结果

| 项 | 结果 |
|---|---|
| 组件是否进入安装包 | ❌ 否，`resources/components` 不存在 |
| asar 内是否含 Python/worker/组件 | ❌ 否，1842 个条目中无相关文件 |
| ffmpeg 是否解包 | ✅ `app.asar.unpacked/node_modules/ffmpeg-static/ffmpeg.exe` 79MB |
| ffprobe 是否解包 | ✅ `app.asar.unpacked/node_modules/ffprobe-static/bin/win32/x64/ffprobe.exe` 60.1MB |
| `CineLab.exe` | 237.9MB（Electron 本体） |

组件仍在用户数据目录按需下载，安装包只增加应用代码与 Electron 本体。

## 发现的问题

### 1. D 盘文件系统过滤驱动导致 electron-builder 失败

- 现象：`EXDEV: cross-device link not permitted, rename '...\LICENSE' -> '...\LICENSE.electron.txt'`
- 原因：`app-builder-lib` 的 `retainElectronLicenseFiles` 使用 `fs.rename`，被文件系统过滤驱动拦截；`Get-PSDrive D` 的 `FileSystem` 为空，说明 D 盘不是标准本地卷
- 临时处理：把输出目录改到 C 盘仍失败，最终 patch `node_modules/.pnpm/app-builder-lib@26.18.0.../out/electron/ElectronFramework.js`，把 `rename` 改为 `copy + remove`
- 影响：仅当前机器；其他机器若 D 盘正常则无需处理

### 2. `ffprobe-static` 打包了全平台二进制

`app.asar.unpacked` 中包含：

- darwin arm64 / x64
- linux ia32 / x64
- win32 ia32 / x64

合计约 335MB，是安装包偏大的主要原因。可以优化为只保留 `win32/x64`，预计安装包减少 60–80MB。

这是既有问题，与深度功能无关，建议单独立项优化。

## 未验证

- 安装包真实安装与启动
- 安装后首次使用深度功能时的组件下载
- 打包环境下 ffmpeg 路径解析（代码已做 `app.asar` → `app.asar.unpacked` 替换）
