# CineLab · Boot Packet

> **下一会话优先**：K3 音频音乐生成 —— 接入 `audio.music` 执行器，让 prompt bar 的音乐模型能真正生成。
> 唯一真相源是 `.opencode/handover/state.json`，本文件只是只读投影。

## 当前状态

- Phase：M6 completed
- 已完成：M0–M4、M6；M3 部分完成（可灵 JWT 未接）
- 打包：免安装绿色版与 zip 已完成
- 阻塞：无

## Frontier

1. **K3-1** 音频音乐生成：接入 `audio.music` 执行器（下一焦点）
2. **AGENT-1** Agent 与画布协作（pending，延后）
3. **M3-1** 可灵 JWT 鉴权（partial，可选）

## 已知缺口

- K1：图生图多图兼容已实现，待真实 i2i provider 验证
- K4：可灵 JWT 未接入
- K7：素材导入对话框待人工验证
- K8：删除最后一个项目回欢迎页待人工验证
- 视频比例与水印关闭待真实视频输出验证
- AI 水印关闭需重启主进程后生成确认

## 关键约定

- Electron 45 + React 19 + React Flow 12 + Zustand + Tailwind 4 + TS 7
- 主进程即后端；JSON / JSONL；不引入 SQLite
- 纯自由画布，参数只在 prompt bar，节点不显示「尝试」
- 左侧 `+` 只接收，右侧 `+` 才生成下游
- 主题只走 CSS 变量；弹窗与 topbar 平级
- 参数选择用下拉/网格，不做循环切换
- 节点工具栏随选中显示，与 prompt bar 同步

## 踩坑

- 输出必须记录宽高，否则节点会把图片裁成错误比例
- 图片浮窗用 `createPortal`，fixed 在 React Flow transform 祖先内会错位
- MOSS 水印字段是 `output_watermark: { enabled }`
- typecheck 前先停 dev，TS 7 原生编译器可能内存不足
- Vite HMR 多次快速编辑后会缓存混合版本，必要时重启 dev

## 验证

`corepack pnpm typecheck` → `corepack pnpm dev`（9222 + `scripts/cdp-*.mjs`）
