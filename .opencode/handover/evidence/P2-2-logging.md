# P2-2 本地日志与崩溃报告

日期：2026-11-07

## 实现

- `electron-log 5.4.4`
- `src/main/logger.ts`：日志写入 `<userData>/logs/main.log`，5MB 上限，捕获未处理异常
- 主进程记录：启动/退出、uncaughtException、unhandledRejection、render-process-gone、child-process-gone
- 渲染进程：`main.tsx` 监听 error / unhandledrejection，经 `window.api.app.log` 上报
- 业务错误：生成失败、ffmpeg 失败、深度 worker 失败
- 设置 → 关于：新增「打开日志目录」
- 日志不记录 Authorization / API Key / 请求头值

## 验证

- 启动后生成 `<userData>/logs/main.log`
- 日志包含 `logger initialized`、`app ready`
- 渲染进程派发 error 后出现 `[renderer] log-test-error @ test.ts:1`
- 关于页存在「打开日志目录」按钮
