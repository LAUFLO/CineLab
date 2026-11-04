# CineLab · Boot Packet

> **下一会话优先**：先确定优先级——M5 打包 / 可灵 JWT / 音乐生成 / 先提交本轮改动（`next_focus` 暂定）。
> 唯一真相源是 `.opencode/handover/state.json`，本文件只是只读投影。

## 当前状态

- Phase：M5 in_progress
- 已完成：M0–M2、M3 火山方舟/首尾帧、M4 TTS/资产库/模板/角色一致性、文本生成、图生图、LibTV 风格 UI、项目/多画布、项目中心
- 未完成：M3-1 可灵 JWT、音乐生成、M5 打包
- 阻塞：无
- 环境：依赖已装，pnpm 走 `corepack pnpm`

## Frontier

1. **M5-1 进行中** 免安装绿色版与 zip 已完成；NSIS 因 electron-builder EXDEV 未生成，待解决
2. **M3-1** 可灵 JWT 鉴权（可选）
3. **收尾** 素材导入人工验证、删除最后项目欢迎页验证

## 已知缺口（详见 state.json.knownIssues，9 条）

- 图生图仅标准 `/images/edits`；多图中转站未验证
- 文本生成无流式/多轮；音乐生成未接
- 素材导入/参考图选择待人工验证
- 删除最后一个项目欢迎页未端到端验证
- NSIS 安装包因 EXDEV 未生成；导出/AI 助手/画布参考/标记仍是占位

## 核心证据

`M2-3-image-edit`、`P2-text-generation`、`M4-2-library`、`M4-2-character-consistency`、`M4-2-templates`、`ui-libtv-alignment`、`project-canvas-management`、`project-center-welcome`

## 关键约定

- Electron 45 + React 19 + React Flow 12 + Zustand + Tailwind 4 + TS 7
- 主进程即后端；JSON/JSONL；不引入 SQLite
- 纯自由画布，参数只在 prompt bar，节点不显示「尝试」
- 左侧 `+` 只接收，右侧 `+` 才生成下游
- 主题只走 CSS 变量

## 踩坑

- 主进程改动必须重启 `corepack pnpm dev`，HMR 会报中间态 parse error
- React Flow handle 锚点用外边缘；视觉圆用伪元素外移，连线才贴边
- JSON 原子写临时文件加 pid+uuid；并发保存否则互相覆盖

## 验证

`corepack pnpm typecheck` → `corepack pnpm build` → `corepack pnpm dev`（9222 + `scripts/cdp-*.mjs`）
