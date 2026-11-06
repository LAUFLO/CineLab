# 品牌资源接入

日期：2026-11-06
设计稿：

- 应用图标：`docs/brand/explorations/H3-icon-C-split-transparent.png`（1024×1024，内容区 826×824）
- 文字 logo：`docs/brand/explorations/H2-wordmark-two-tone-transparent.png`（1024×576）

## 资源生成

| 文件 | 用途 |
|---|---|
| `resources/icon.png` | 1024×1024 圆角应用图标 |
| `resources/icon.ico` | Windows exe / 安装包图标（16–256 多尺寸） |
| `src/renderer/src/assets/app-icon.png` | 界面内应用图标（256×256） |
| `src/renderer/src/assets/wordmark-light.png` | 浅色主题文字 logo |
| `src/renderer/src/assets/wordmark-dark.png` | 深色主题文字 logo（cine 反白，lab 保持灰） |

圆角处理：裁切到内容边界后等比铺满 1024 画布，使用 22.5% 圆角半径（230px），透明背景。

文字 logo：剔除源图边缘单像素 alpha 噪点后按内容裁切，四周留 4% padding。

## 界面接入

新增 `src/renderer/src/components/Brand.tsx`：

- `BrandIcon`：应用图标（圆角 PNG）
- `BrandWordmark`：文字 logo，按 `data-theme` 自动切换浅色/深色两版

替换位置：

| 位置 | 修改 |
|---|---|
| `canvas/TopBar.tsx` | 左上角红框位置改为文字 logo（高 16px） |
| `panels/ProjectCenter.tsx` | 欢迎页品牌区改为文字 logo（高 30px），移除原图标 + 文字 |
| `App.tsx` | 启动屏 / 错误屏文字 logo 改为图片（高 22px） |
| `panels/SettingsPanel.tsx` | 侧边栏「关于」改为圆角应用图标；关于页标题改为文字 logo |
| `main/window.ts` | 开发模式窗口图标指向 `resources/icon.png` |
| `electron-builder.yml` | `win.icon: icon.ico`（相对 `resources` buildResources） |

## 验证

- `pnpm typecheck` 通过
- `pnpm build` 通过，PNG 资源进入 `out/renderer/assets`
- CDP 截图确认：
  - 画布顶栏文字 logo 正常（修复了浅色/深色两版同时渲染的 CSS 特异性问题）
  - 欢迎页文字 logo 正常
  - 深色主题下自动切换为反白版
  - 设置侧边栏「关于」显示圆角图标
  - 关于页标题显示文字 logo

## 备注

- `Icon.tsx` 中旧的 `logo` SVG 路径保留但已无渲染使用，可后续清理。
- exe / 安装包图标需要重新打包后生效。

## 本机任务栏名称修复（2026-11-06）

本机因加密软件限制，快捷方式指向 `electron.exe`，任务栏右键显示 “Electron”。

处理：

- 用 `rcedit-x64.exe` 修改安装目录 `electron.exe` 的版本资源：`ProductName` / `FileDescription` / `CompanyName` 均为 `CineLab`，并写入 `resources/icon.ico`
- 保持文件名 `electron.exe`，加密软件仍按文件名放行，应用可正常启动
- 桌面和开始菜单快捷方式的 `IconLocation` 同步为 `electron.exe,0`
- `ie4uinit.exe -show` 刷新图标缓存

备份：`build/electron-official-backup.exe`。正式安装包使用 `CineLab.exe`，产品名和图标由 electron-builder 正确写入，不需要这步。
