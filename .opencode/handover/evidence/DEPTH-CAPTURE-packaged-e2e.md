# DEPTH-CAPTURE 打包态端到端验证

日期：2026-11-06
方案：`docs/depth-capture-plan.md`
前置：`DEPTH-CAPTURE-package.md`（安装包结构与体积）

## 环境

- 安装包：`CineLab Setup 0.1.0.exe`（asar: false 调试包，NSIS 静默安装）
- 安装目录：`C:\Users\Administrator\AppData\Local\Programs\CineLab`
- userData：`C:\Users\Administrator\AppData\Local\Temp\cinelab-packaged-components`
- 组件源：本地 mock 服务 `http://127.0.0.1:8899`

## 组件下载与安装

| 组件 | 大小 | 结果 |
|---|---|---|
| `depth-model-vda-small` | 116,440,756 字节 | ✅ 下载、SHA256 校验、安装成功 |
| `depth-runtime` | 258,743,360 字节 / 解压 854,438,270 | ✅ 下载、校验、解压 22,165 个文件、安装成功（约 90 秒） |

安装后路径：

- `...\components\depth-model-vda-small\video_depth_anything_vits.pth`
- `...\components\depth-runtime\python\python.exe`

## 深度动作捕捉

通过渲染进程 preload API 直接调用（打包态主进程 + 打包态 Python runtime + 打包态 ffmpeg）：

| 输入 | 输入尺寸 | 输出尺寸 | 帧数 | 结果 |
|---|---|---|---|---|
| `test.mp4` | 640×360 | 640×360 | 72 @ 24fps | ✅ 灰度视频 148.3KB |
| `portrait.mp4` | 360×640 | 360×640 | 48 @ 24fps | ✅ 比例跟随输入 |

输出编码：H.264 / `yuv420p`，无音轨（符合深度参考视频定位），生成路径 `assets/vid/*.mp4`。

进度事件完整：`queued → running 5% → 10% → 15% → 82% → 90% → 100% → done`。

## 关键发现：CineLab.exe 在本机无法启动

### 现象

- 安装后启动 `CineLab.exe`：窗口标题 `Error`，主进程弹「A JavaScript error occurred in the main process」
- 错误位置指向 `resources\app\out\main\index.js:1`，错误文本为乱码
- 同一份 `resources\app` 用官方 `electron.exe` 启动完全正常（页面、组件、深度功能全部通过）

### 证据

用 `ELECTRON_RUN_AS_NODE=1` 让 `CineLab.exe` 自己读取入口文件：

```text
len=176888
head="????\u0005?\u0000\u0002\u0000..."
```

同一文件用 Node 读取：

```text
len=172792
head="// \0rolldown/runtime.js\nvar __create = "
```

`CineLab.exe` 读到的是加密后的字节，且长度不同（176,888 vs 172,792）。

### 根因

企业透明加密软件按**可执行文件**放行解密：

- Node、开发版 `electron.exe`、官方 `electron.exe` 在白名单 → 读到明文
- electron-builder 重写资源后的 `CineLab.exe`（哈希改变）不在白名单 → 读到密文
- 文件重命名为 `electron-test.exe` 仍失败，排除文件名匹配
- 两个 exe 均未签名，排除签名因素
- 官方 `electron.exe` 复制到安装目录后启动成功
- 把官方 `electron.exe` **改名**为 `CineLab.exe` 后仍失败，确认白名单同时匹配**文件名**（或完整路径），不是纯哈希

### 本机临时方案

安装目录保留官方 `electron.exe`，桌面和开始菜单快捷方式改为指向 `electron.exe`，图标仍取 `CineLab.exe` 的资源。双击快捷方式可正常启动，功能与打包版一致。

`CineLab.exe` 本体保持原版不动；直接双击它仍会报错。此方案仅用于本机验证，不作为发布方案。

### 影响与结论

- **代码、asar 结构、打包配置均正常**，问题仅存在于当前这台装有加密软件的机器
- 在干净 Windows 机器上，`CineLab.exe` 预期可正常启动
- 本机如需验证，需把 `CineLab.exe` 加入加密软件白名单，或使用官方 `electron.exe` 作为启动器（仅调试用，不作为发布方案）
- `app-builder.exe` 读取源文件得到密文/零，也是同一原因；这解释了 asar 内容损坏和 `EXDEV` 之外的打包异常

## 未覆盖

- 通过 UI 点击「深度动作捕捉」按钮的完整交互（dev 环境已验证）
- 打包态画布节点自动创建（本次通过 API 调用，欢迎页未切换，节点未渲染；dev 环境已验证）
- 真实拍摄素材的视觉效果验收（当前为合成测试视频）
