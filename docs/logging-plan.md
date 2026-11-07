# 本地日志与崩溃报告方案（P2-2）

日期：2026-11-07
状态：已完成

## 目标

- 主进程、渲染进程、Python worker 的错误统一落盘
- 设置页「关于」提供「打开日志目录」
- 日志不包含 API Key 等敏感信息
- 崩溃和未处理异常可在日志中定位

## 实现

### 主进程

新增 `src/main/logger.ts`，使用 `electron-log`：

- 文件：`<userData>/logs/main.log`
- 级别：`info`
- 单文件上限 5MB
- `errorHandler.startCatching()` 捕获未处理异常
- 初始化记录版本与平台

`src/main/index.ts`：

- `setupLogging()` 在 userData 路径确定后调用
- `uncaughtException` / `unhandledRejection` 写入日志
- `render-process-gone`、`child-process-gone` 记录崩溃原因与退出码
- `before-quit` 记录退出

### 渲染进程

- `main.tsx` 监听 `error` 和 `unhandledrejection`，通过 `window.api.app.log` 写入主进程日志
- preload 暴露 `app.log(level, message)` 与 `app.openLogs()`

### 业务错误

- 生成任务失败：记录 nodeId、runId、友好文案、是否可重试
- ffmpeg 失败：记录退出码、参数摘要、stderr 尾部
- 深度 worker 失败：记录退出码与 stderr 尾部

### 设置页

「关于」增加「日志」行与「打开日志目录」按钮，调用 `shell.openPath(<userData>/logs)`。

## 脱敏

- 不记录 `Authorization`、API Key、请求头值
- 只记录错误文案、退出码、stderr 关键片段
- 渲染错误限长 2000 字符

## 验证

- 启动后生成 `<userData>/logs/main.log`
- 日志包含 `logger initialized` 与 `app ready`
- 渲染进程派发 error 后出现 `[renderer] ...` 记录
- 关于页存在「打开日志目录」按钮
