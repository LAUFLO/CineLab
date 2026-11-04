# CineLab · Boot Packet

> **下一会话优先**：M2 第一阶段 —— `.cinelab` 项目文件夹 + Provider 配置 + OpenAI 兼容文生图闭环。

## 当前状态

- Phase：M1 已完成，进入 M2
- 已完成：M0 脚手架、M1 画布核心（四类节点 / 连线 / 添加菜单 / prompt bar / localStorage 持久化）
- 已开源：https://github.com/LAUFLO/CineLab（MIT）
- 阻塞：无

## Frontier（按顺序）

1. **M2-1** `.cinelab` 项目文件夹：创建 / 打开 / 自动保存 / 崩溃恢复
2. **M2-2** 模型配置：Provider、Base URL、Key 加密存储、模型列表
3. **M2-3** OpenAI 兼容适配器：文生图 / 图生图
4. **M2-4** 任务队列：并发限制、进度事件、取消、失败重试
5. **M2-5** 资产落盘：内容 hash 去重、缩略图、版本栈
6. **M2-6** prompt bar 接入真实参数与生成按钮
7. M3 视频 → M4 音频/角色 → M5 打包

## 必读文档

- `docs/ui-spec.md`：界面规格（区域尺寸、深浅色板、节点结构、prompt bar、菜单、交互）
- `docs/architecture.md`：进程架构、`.cinelab` 格式、Provider 接口、执行引擎、IPC 协议

## 关键约定

- 技术栈：Electron 45 + React 19 + React Flow 12 + Zustand + Tailwind 4 + TS 7
- 主进程即后端，无独立服务；存储用 JSON/JSONL，不引入 SQLite
- 完全复刻 LibTV：纯自由画布、参数只在 prompt bar、节点不显示「尝试」列表
- 左侧 `+` 仅接收（target），右侧 `+` 才生成下游（source）
- 主题只走 CSS 变量，禁止组件硬编码色值

## 踩坑记录

- prompt bar 定位必须乘 `viewport.zoom`，否则缩放后间距失真
- React Flow handle 用负 margin 居中，不能用 `transform`，否则连线锚点偏移
- pnpm 12 的构建白名单在 `pnpm-workspace.yaml` 的 `allowBuilds`
- TypeScript 7 移除了 `baseUrl`，`paths` 必须用 `./` 相对路径

## 验证方式

- `pnpm typecheck`
- `pnpm dev`
- 开发期开 9222 调试端口，用 `scripts/cdp-*.mjs` 做自动化验证
