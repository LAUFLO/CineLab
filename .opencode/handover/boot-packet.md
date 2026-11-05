# CineLab · Boot Packet

> **下一会话优先**：K5 收尾 —— 导出（项目 / 当前画布 PNG / 选中素材）、prompt bar 画布参考、图片标记。AI 助手不做，后续单独做 agent 与画布协作。
> 唯一真相源是 `.opencode/handover/state.json`，本文件只是只读投影。

## 当前状态

- Phase：M6 in_progress
- 已完成：M0–M4（画布、项目文件夹、模型配置、出图 / 出视频 / 出音频、资产库、模板、角色一致性）
- 打包：免安装绿色版与 zip 已完成；安装包已从计划中移除
- 阻塞：无

## Frontier

1. **P6-1** 导出：项目打包、当前画布 PNG、选中素材
2. **P6-2** prompt bar 画布参考：点选画布节点引用其输出
3. **P6-3** 标记：图片局部涂抹 / 蒙版
4. **AGENT-1** Agent 与画布协作（延后，单独规划）
5. **M3-1** 可灵 JWT 鉴权（可选）

## 已知缺口

- 导出、画布参考、标记仍是占位
- AI 助手延后，等 K5 完成后再设计
- 可灵未接；`audio.music` 未接
- 素材导入、删除最后项目后的欢迎页待人工验证

## 关键约定

- Electron 45 + React 19 + React Flow 12 + Zustand + Tailwind 4 + TS 7
- 主进程即后端；JSON / JSONL；不引入 SQLite
- 纯自由画布，参数只在 prompt bar，节点不显示「尝试」
- 左侧 `+` 只接收，右侧 `+` 才生成下游
- 主题只走 CSS 变量
- 弹窗必须与 topbar 平级，不能渲染在 topbar 内部

## 踩坑

- 弹窗在 topbar 内会被层叠上下文压住；顶部 40px 是窗口拖拽区，按钮会点不动
- typecheck 自动探测：TS 7 可用即用，加密导致 `Invalid character` 时才回退 5.9
- 主进程改动必须重启 dev，HMR 会报中间态错误

## 验证

`corepack pnpm typecheck` → `corepack pnpm dev`（9222 + `scripts/cdp-*.mjs`）
