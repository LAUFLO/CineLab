# Changelog

本项目的版本记录。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循语义化版本。

## [0.2.1] - 2026-11-16

### 变更

- 样式体系全量迁移到 Tailwind utility：CSS 从 14,197 行降到 495 行，组件样式 0 行，构建 CSS 289.0 → 167.9 KB。
- 行为钩子从语义类名统一为 `data-*`，`className` 只保留 utility 与 Tailwind 变体。
- 样式入口精简为 3 个文件：`tokens.css`、`tailwind.css`、`infrastructure.css`（原 `global.css` 更名，文件头限定五类内容）。
- 文档治理：30 份已完成方案移入 `docs/archive/`，索引重新分类；`ui-spec` 补输入槽位与模型配置 v2。
- 修复 e2e 在 DevTools 端口 9222 被占用时启动超时，4 个用例恢复通过。
- 依赖更新：electron 45.3.1、vite 8.3.8、`@babel/core` 8.1.2。

## [0.2.0] - 2026-11-15

### 新增

- 模型配置 v2：能力模式、9 个生成模式、协议模板与配置 Skill。
- PromptBar 模式驱动槽位：首尾帧、参考图、拖拽排序、超限自动切换模式。
- 默认主题改为跟随系统。
- README 重构，补充社区入口。

### 变更

- 移除本地槽位数量上限，连线改为严格模式。

## [0.1.1] - 2026-11-14

### 修复

- Windows 主窗口恢复无边框，修复 v0.1.0 出现的双标题栏。
- macOS 隐藏自绘的最小化 / 最大化 / 关闭按钮，避免与原生红绿灯重复。
- 修复 tag 发布时 publish job 缺少 Git checkout 的问题。
- 安装包改为无空格文件名，确保 `latest.yml` 与 GitHub Release asset 一致。

## [0.1.0] - 2026-11-14

首个公开版本（Early Access）。

### 新增

- 无限画布、多项目 / 多画布、项目中心、自动保存与崩溃恢复
- 图片 / 视频 / 音频 / 文本生成，支持 OpenAI 兼容接口、可灵、火山方舟、MiniMax、Vidu
- 分组节点、分镜组、版本栈、2K 拼接、节点工具栏
- CineBot：自然语言操作画布、剪辑室、导演台和拉片，生成提案与回合撤销
- 剪辑室：多轨时间线、自动粗剪、自动字幕、ffmpeg 导出成片
- 导演台：three.js 3D 视口、多机位、机位关键帧运镜、白模预演导出
- 逐帧拉片：镜头检测、AI 描述、分镜表与多种格式导出
- 本地媒体处理：深度动作捕捉、抽帧、裁切、分离音视频、去字幕、抠图
- 自动更新、深浅双主题、统一组件库

### 已知限制

- 提供 Windows x64 和 macOS Apple Silicon 安装包
- macOS 的深度捕捉、视觉增强和本地字幕组件与 Windows 一致，首次使用时按平台下载
- 安装包未做代码签名：Windows 会出现 SmartScreen 提示，macOS 需要手动放行 Gatekeeper
- macOS 首版暂不支持自动更新，需要手动下载新版本
- 自动更新依赖 GitHub Releases，国内网络可能较慢
- 自动更新默认只检查版本，下载和安装需要用户手动确认
