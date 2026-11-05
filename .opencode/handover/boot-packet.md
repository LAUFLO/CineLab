# CineLab · Boot Packet

> 唯一真相源是 `.opencode/handover/state.json`，本文件只是只读投影。
> **下一会话焦点未指定**：从 frontier 自选，或先与用户确认。

## 当前状态

- Phase：M6 completed
- 本轮完成：NODE-TOOLBAR P0 / P1 / P2
- 打包：绿色版与 zip 历史可用；新增 ffmpeg 后尚未重新打包验证
- 阻塞：无

## Frontier

1. **NODE-TOOLBAR 收尾**（建议）：真实 i2i 效果验证、Windows 打包验证、智能去字幕
2. **K3-1** 音频音乐生成（pending，延后）
3. **AGENT-1** Agent 与画布协作（pending，延后）
4. **M3-1** 可灵 JWT 鉴权（partial，可选）

## 本轮完成

- 节点工具栏：操作注册表、一级 / 更多、自定义工具栏、禁用态
- 本地媒体：ffmpeg / ffprobe、宫格切分、比例 + 自由裁剪、片段截取、分离音视频、画面裁切、首 / 尾 / 当前帧抽帧
- P1 AI 图像：九宫格、角色三视图、画面推演、光影校正、预设打光、预设多角度、人像三档、抠图
- P2 交互：3D 光位 / 机位球、框选去字幕
- 派生节点自动连线源节点

## 证据

- `docs/node-toolbar-plan.md`
- `evidence/NODE-TOOLBAR-framework.md`
- `evidence/NODE-TOOLBAR-media.md`
- `evidence/NODE-TOOLBAR-p1.md`
- `evidence/NODE-TOOLBAR-p2.md`

## 关键约定

- 主进程即后端；JSON / JSONL；不引入 SQLite
- 主题只走 CSS 变量；弹窗与 topbar 平级
- 新建派生节点必须自动连源节点；版本回写不新建节点
- P1 AI 操作统一走 `image.i2i` + 提示词模板 + 当前节点新版本
- 测试应用保持运行：`CINELAB_DEBUG_PORT=9223` + 独立 userData

## 踩坑

- PowerShell 改 TS 时 `$nlif` 会被当变量插值，拼接换行要用字符串加法
- D:\CineLab 与 worktree 同时运行会抢单实例锁；worktree 用独立 userData
- `ffmpeg-static` 需在 `pnpm-workspace.yaml` 的 allowBuilds 白名单
- electron-builder `--dir` 在本机报 EXDEV，打包验证待正常环境
- typecheck 前先停 dev；HMR 多次编辑会缓存混合版本

## 验证

`corepack pnpm typecheck` → `corepack pnpm build`
