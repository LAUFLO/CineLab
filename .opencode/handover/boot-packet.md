# CineLab · Boot Packet

> **下一会话优先**：实现分组节点 —— 按 `docs/group-nodes.md` 开 `feat/group-nodes` 分支。
> 唯一真相源是 `.opencode/handover/state.json`，本文件只是只读投影。

## 当前状态

- Phase：M6 completed；M3 已完成（火山、可灵、MiniMax、智谱、Vidu）
- 已完成：models.json、Agnes 图片/图生图/视频、audio.music、多选工具栏、画布右键/框选/中键平移
- 全局资产库已完成（T39/T40/T47）；K9–K11 为后续优化
- 节点工具栏 P0/P1/P2 已完成：ffmpeg 媒体、切分/裁剪/截取/拆轨/抽帧、AI 图像操作、自由裁剪/框选去字幕/3D 光位机位球
- 分组节点：设计完成，代码未开始
- 阻塞：无

## Frontier

1. **GROUP-1** 分组节点：打组 / 合并分组 / 重命名 / 10 色 / 横竖网格 / 拖出脱离（下一焦点）
2. **UI-1** 底部工具栏 P0+P1：添加入口、移动/抓手、快捷键面板、节点搜索、生成历史（分组之后；资产库保留左下 StatusBar）
3. **AGENT-1** Agent 与画布协作（pending，延后）
4. **NODE-TOOLBAR 收尾**（建议）：真实 i2i 验证、Windows 打包验证、智能去字幕

## 已知缺口

- K1：图生图真实 i2i provider 未验证
- K2：文本流式输出、多轮上下文未实现
- K7：素材导入 / 角色参考图人工验证
- K8：删除最后项目回欢迎页人工验证
- K9：项目 zip 未打包全局资产引用
- K10：旧项目 library 数据未迁移
- K11：资产网格未生成缩略图缓存
- K12：智谱 / Vidu / MiniMax / 可灵只经 mock 验证，真实 Key 待验证
- K13：Agnes 免费视频队列持续 503
- K14：多选导出 zip 未人工确认落盘
- K15：项目 assets 有测试孤儿素材
- K16：ffmpeg 打包后的 asarUnpack 路径未在正常环境验证
- K17：智能去字幕需视频修复模型，暂未接入

## 关键约定

- Electron 45 + React 19 + React Flow 12 + Zustand + TS 7
- 主进程即后端；JSON 存储；主题只走 CSS 变量
- 弹窗与 topbar 平级
- 单选节点显示 prompt bar + 节点工具栏；多选隐藏两者，显示顶部多选工具栏
- 分组用 `parentId`，子节点坐标相对组；拖出脱离按中心点判断
- `models.json` 优先级：内置预设 → 用户数据 → 开发仓库根
- 非 OpenAI 协议优先 `http-template`
- 派生新节点自动连源节点；版本回写不新建节点
- P1 AI 操作统一 `image.i2i` + 提示词模板 + 当前节点新版本
- 自由裁剪/字幕框选共用 `useBoxEditor`；打光/机位用 2D 投影球体

## 踩坑

- 多选时 `nodes.find(selected)` 会误显示一个 prompt bar，必须改成“恰好一个”
- 分组要实现拖出脱离就不能用 `extent: 'parent'`
- `models.json` 修改后点设置里的“重新加载”才生效，暂无 fs.watch
- 真实厂商适配器先用 `scripts/mock-video.mjs` 验证，再接 Key
- typecheck 前先停 dev，TS 7 可能内存不足
- worktree 与主仓库同时运行会抢单实例锁；worktree 用 `CINELAB_USER_DATA` + `CINELAB_DEBUG_PORT`
- `ffmpeg-static` 需加入 `pnpm-workspace.yaml` 的 `allowBuilds`
- electron-builder `--dir` 在当前环境报 `EXDEV`

## 验证

`corepack pnpm typecheck` → `corepack pnpm build`
`corepack pnpm dev`（9222 + `scripts/cdp-*.mjs`；worktree 用 9223 + `CDP_PORT`）
模型配置校验：`corepack pnpm models:check`
