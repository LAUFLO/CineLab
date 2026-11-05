# CineLab · Boot Packet

> **下一会话优先**：继续 UI 细节打磨。优先修使用中发现的视觉与交互问题，保持主题绿、圆角浮层、统一 tooltip 的规范；K 项收尾与 P2 命令面板暂缓。
> 唯一真相源是 `.opencode/handover/state.json`，本文件只是只读投影。

## 当前状态

- Phase：M7 completed；GROUP-1 / UI-1 / STORYBOARD-1 全部完成
- 已完成：分组节点、分镜组与 2K 拼接、底部工具栏（搜索/历史/快捷键）、组引用、统一 tooltip、主题绿、滚动条重设计
- 代码：本地领先 origin/main 2 个提交，另有约 30 个文件未提交
- 阻塞：无

## Frontier

1. **UI 细节打磨**（下一焦点）
2. K 项收尾：真实 i2i、真实厂商 Key、Windows 打包、人工验证项
3. P2 命令面板（未排期）
4. AGENT-1（明确延后）

## 已知缺口

- K1 图生图真实 provider 未验证；K12 智谱/Vidu/MiniMax/可灵真实 Key 未跑通
- K7/K8/K14 依赖系统对话框，需人工验证
- K16 ffmpeg 打包路径未在安装包验证
- 分镜拼接只支持项目内路径，未支持拖拽排序

## 关键约定

- Electron 45 + React 19 + React Flow 12 + Zustand + TS 7
- 按钮强调色统一 `--pick-bar`（#166534），不要再把 `--accent` 用于按钮
- 浮层居中用独立 `translate` 属性，不用 `transform`（会被入场动画覆盖）
- 组内节点屏幕定位必须过 `absolutePosition(node, nodes)`
- 可滚动浮层需在 wheel 捕获阶段 `stopPropagation`，避免带动画布
- 素材节点写 `assetOnly: true`，不显示 prompt bar

## 验证

`corepack pnpm typecheck` → `corepack pnpm dev:isolated`（CDP 9222，自动隔离 userData）
