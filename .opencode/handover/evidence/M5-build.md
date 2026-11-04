# M5 打包验证

- 日期：2026-11-04

## 产物

| 产物 | 路径 | 状态 |
|---|---|---|
| 免安装目录 | `release/win-unpacked/` | 可运行 |
| 压缩包 | `release/CineLab-0.1.0-win-x64.zip` | 273 MB |
| 快捷方式 | `release/win-unpacked/CineLab.lnk` | 可启动 |

启动方式：双击 `electron.exe` 或 `CineLab.lnk`，窗口标题为 CineLab。

## 组装方式

由于 `electron-builder` 在 packaging 阶段失败，改用脚本 `scripts/assemble.mjs` 手动组装：

```
release/win-unpacked/
├─ electron.exe            Electron 45.2.2 运行时
├─ resources/app/
│  ├─ out/                 主进程、preload、渲染进程构建产物
│  ├─ node_modules/zod/    主进程唯一外部依赖
│  └─ package.json         main: out/main/index.js
└─ CineLab.lnk
```

## 未解决的问题

1. **electron-builder 26 报 EXDEV**
   `rename 'release\win-unpacked\LICENSE' -> 'LICENSE.electron.txt'` 失败。
   - 同目录 Node `fs.rename` 测试正常
   - Windows Defender 排除路径无效
   - 降级 electron-builder 25 时 pnpm 下载卡住，未完成
   - 结果：NSIS 安装包未生成

2. **exe 不能改名为 CineLab.exe**
   改名后启动报 "A JavaScript error occurred in the main process"，错误指向 `out/main/index.js:1`，但内容与未改名版本一致。
   保留 `electron.exe` 原名时启动正常。
   推测与 Electron 的 `defaultApp` 判定或 Windows 映像缓存有关，未定位到根因。

## 验证

| 项 | 结果 |
|---|---|
| 免安装目录启动 | 通过，窗口标题 CineLab |
| 快捷方式启动 | 通过 |
| zip 生成 | 通过，273 MB |
| 安装包（NSIS） | 未生成 |
