# 通用设置第二批验证

日期：2026-11-08
关联：`docs/general-settings-plan.md`、`GENERAL-SETTINGS-2`

## 范围

在 11 项 MVP 基础上补齐剩余通用设置：

- 关闭前确认、默认项目目录
- 显示连线、滚轮行为、双击缩放、网格样式
- 失败自动重试、默认 AI 水印
- 启动检查更新、更新通道
- 缩略图缓存信息/清理、自动清理天数、清空生成历史
- 界面缩放
- 模型请求代理、请求超时
- 通用设置导入/导出

语言未实现为无效下拉；当前界面为中文硬编码，需要单独做全量 i18n。

## 实现

### 主进程

- `preferences.json` 扩展 `updates` / `storage` / `ui` / `network`
- `applyRuntimePreferences`：并发、更新通道、会话代理统一应用
- `net.fetch` 统一请求入口 `providers/http.ts`，支持超时和调用方取消信号
- provider 与连接测试全部切换到 `httpFetch`
- 项目默认目录读取偏好；新建项目与打开对话框使用该目录
- 窗口关闭拦截：有未保存修改时通知渲染进程确认
- 缩略图缓存扫描、清理、按天自动清理
- 通用设置 JSON 导入/导出
- 更新服务按偏好决定是否静默检查，并应用更新通道

### 渲染进程

- 偏好 store 增加 updates/storage/ui/network 更新动作、连线切换、refresh
- 画布读取滚轮模式、双击缩放、网格样式
- Prompt Bar 读取默认水印，切换写回偏好
- 生成失败按偏好自动重试，记录重试次数
- 关闭确认弹窗：有未保存修改时保存并退出
- 通用设置增加界面缩放、网络、缓存、备份等分组

## 实测

隔离实例 `dev:isolated`：

- 通用设置共 8 个分组、32 个设置行
- 同时切换显示连线、双击缩放、水印：
  - 偏好写入 `edgesVisible=false`、`zoomOnDoubleClick=false`、`watermark=false`
  - 连线从画布 DOM 消失
- 网格样式改为「不显示」：偏好写入 `gridStyle=none`，画布背景移除
- 滚轮行为改为「缩放画布」：`scrollMode=zoom`
- 失败自动重试改为 2 次、更新通道改为测试版、缓存清理 30 天、超时 30 秒，均写入偏好
- 代理改为手动，输入 `http://127.0.0.1:7890`，失焦后写入偏好
- 界面缩放 110%：`innerWidth` 1240 → 1127，偏好写入 `scale=110`
- 缩略图缓存显示 `59.8 KB · 10 个文件`
- 默认项目目录改为临时目录后，`project.create` 在该目录创建项目
- 标题栏关闭时如有未保存修改，出现「退出 CineLab」确认框；取消后窗口保持
- 本地 mock `/v1/models` 经 `httpFetch` 返回 `mock-model`，确认 `net.fetch` 入口可用

## 验证

```text
corepack pnpm typecheck  通过
corepack pnpm test       7 files / 21 tests 通过
corepack pnpm build      通过
```

## 说明

- Chromium 默认绕过 localhost 代理，因此手动代理只做了写入与应用，未做外部代理端到端验证。
- 更新通道依赖更新源提供 `beta` 通道；没有对应通道时效果与稳定版一致。
- 缩略图缓存清理未在共享资产库上执行，避免删除用户实际缓存；只验证了扫描与显示。
