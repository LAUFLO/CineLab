# CineLab · Boot Packet

> **下一会话优先**：待定。M6 已收尾（导出、画布参考完成；图片标记按用户要求取消）。
> 唯一真相源是 `.opencode/handover/state.json`，本文件只是只读投影。

## 当前状态

- Phase：M6 completed
- 已完成：M0–M4、M6；M3 部分完成（可灵 JWT 未接）
- 打包：免安装绿色版与 zip 已完成
- 阻塞：无

## Frontier

1. **AGENT-1** Agent 与画布协作（pending，用户明确延后）
2. **M3-1** 可灵 JWT 鉴权（partial，可选）

## 已知缺口

- K1：图生图多图兼容已实现，待真实 i2i provider 验证
- K3：`audio.music` 未接入执行器
- K4：可灵 JWT 未接入
- K7：素材导入对话框待人工验证
- K8：删除最后一个项目回欢迎页待人工验证
- 导出三入口的保存对话框待人工确认

## 关键约定

- Electron 45 + React 19 + React Flow 12 + Zustand + Tailwind 4 + TS 7
- 主进程即后端；JSON / JSONL；不引入 SQLite
- 纯自由画布，参数只在 prompt bar，节点不显示「尝试」
- 左侧 `+` 只接收，右侧 `+` 才生成下游
- 主题只走 CSS 变量
- 弹窗必须与 topbar 平级
- 参数选择用下拉框，不做循环切换

## 踩坑

- Vite HMR 多次快速编辑后会缓存混合版本模块，页面渲染旧结构；强制刷新无效时重启 dev
- 拾取节点要同时拦 `pointerdown` 与 `click`，否则 React Flow 会切换选中导致引用丢失
- 删除引用缩略图必须同步删 edge
- 主进程改动必须重启 dev
- 测试不要用 `SetForegroundWindow` 把应用拉到前台

## 验证

`corepack pnpm typecheck` → `corepack pnpm dev`（9222 + `scripts/cdp-*.mjs`）
