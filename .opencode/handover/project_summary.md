# CineLab 项目概览

## 是什么

一个本地运行的 AI 创作无限画布工具：1:1 复刻 LibTV 的画布体验，但模型接入完全开放，数据存在本地项目文件夹里。

面向个人 AIGC 创作者，解决市面工具「不能自定义模型、参数黑盒、结果不可复用」的问题。

## 技术栈

| 层 | 选择 |
|---|---|
| 桌面壳 | Electron 45（frameless，主进程即后端） |
| 前端 | React 19 + TypeScript 7 + Vite 8 |
| 画布 | React Flow 12（@xyflow/react） |
| 状态 | Zustand 5 |
| 样式 | Tailwind 4 + CSS 变量（深浅双主题） |
| 校验 | Zod 4 |
| 媒体 | ffmpeg-static 5.3 + ffprobe-static 3.1 |
| 存储 | 项目文件夹 + JSON / JSONL（不引入 SQLite） |
| 打包 | 免安装绿色版 + zip（安装包已从计划移除） |

## 目录结构

```
D:\CineLab
├─ docs/                    ui-spec.md、architecture.md、node-toolbar-plan.md
├─ scripts/                 cdp-shot / cdp-eval / cdp-drag / cdp-connect、mock-openai
├─ src/
│  ├─ main/                 窗口、IPC、项目/多画布、Provider、队列、资产落盘、media（ffmpeg/裁剪/抽帧/拆轨）、资产库、自定义协议
│  ├─ preload/              contextBridge 白名单
│  ├─ shared/               canvas、project、provider、generation、media、library、ipc-contract
│  └─ renderer/src/
│     ├─ canvas/            Canvas、TopBar、BottomBar、StatusBar、PromptBar、AddNodeMenu、nodes、edges
│     ├─ canvas/nodes/      CineNodeView、NodeToolbar、node-operations、各类操作 Dialog
│     ├─ stores/            canvas、project、settings、generation、library、toolbar、ui
│     ├─ panels/            SettingsPanel、LibraryPanel、ProjectCenter、ConfirmDialog
│     ├─ components/        Icon、WindowControls、Toast
│     ├─ theme/             useTheme
│     └─ styles/            tokens.css、global.css
├─ .opencode/handover/      交接状态与文档
└─ AGENTS.md                接续指引
```

## 当前进度

仓库：https://github.com/LAUFLO/CineLab（MIT，public）

| 阶段 | 状态 | 说明 |
|---|---|---|
| M0 | ✅ 完成 | 脚手架、三进程、主题、空画布 |
| M1 | ✅ 完成 | 四类节点、拖拽、连线、菜单、prompt bar、持久化 |
| M2 | ✅ 完成 | 项目文件夹、模型配置、文生图/图生图、文本生成、队列、版本栈 |
| M3 | ⚠️ 部分完成 | 火山方舟视频、首尾帧已通；可灵 JWT 待接 |
| M4 | ✅ 完成 | TTS、资产库（角色/素材/模板/一致性） |
| M5 | ✅ 完成 | 免安装绿色版与 zip 可用 |
| M6 | ✅ 完成 | 导出、画布参考、节点比例与工具栏、智能引用、AI 水印开关 |
| NODE-TOOLBAR P0 | ✅ 完成 | 操作注册表、一级/更多、自定义工具栏、ffmpeg、宫格切分、裁剪、截取、拆轨、画面裁切、抽帧 |
| NODE-TOOLBAR P1 | ✅ 完成 | 九宫格、三视图、画面推演、光影校正、预设打光/多角度、人像、抠图 |
| NODE-TOOLBAR P2 | ✅ 完成 | 自由裁剪、框选去字幕、3D 光位/机位球 |

## 已完成的关键工件

- `docs/ui-spec.md`：13 章界面规格，含精确尺寸与两套色板
- `docs/architecture.md`：14 章技术架构，含 `.cinelab` 格式、Provider 接口、执行引擎
- `docs/node-toolbar-plan.md`：节点工具栏完整范围、决策、P0/P1/P2 技术要点
- `src/shared/`：画布、项目、Provider、生成事件、媒体、资产库、IPC 七套共享 schema
- `src/main/project/manager.ts`：`.cinelab` 创建/打开/保存、多画布管理
- `src/main/media/`：ffmpeg/ffprobe 封装、宫格切分、裁剪、抽帧、拆轨、delogo
- `src/main/ipc/media.ts`：媒体 IPC
- `src/main/providers/openai-compat.ts`：文生图/图生图、TTS、文本生成
- `src/main/engine/queue.ts`：并发 2 任务队列、取消、进度事件
- `src/main/assets/ingest.ts`：SHA-256 去重、缩略图、视频 probe、输出宽高记录
- `src/renderer/src/canvas/nodes/NodeToolbar.tsx`：节点工具栏、更多菜单、禁用态
- `src/renderer/src/canvas/nodes/node-operations.ts`：操作注册表与提示词模板
- `src/renderer/src/canvas/nodes/`：AiOperationDialog、CropDialog、SubtitleDialog、SphereDialog、TrimDialog、useBoxEditor
- `src/renderer/src/stores/canvas.ts`：节点/边、版本栈、派生节点自动连线
- `src/renderer/src/canvas/PromptBar.tsx`：三行 prompt bar、画布参考、智能引用、比例网格
- `src/main/library/store.ts`：角色卡、素材、模板存储与去重
- `src/main/export/zip.ts` / `ipc/export.ts`：项目 zip、画布 PNG、素材导出

## 设计约定

1. 画布优先：除顶栏、左下工具条、底部胶囊，无常驻面板
2. 节点轻、参数重：所有生成参数在 prompt bar
3. 创建即连接：拉线到空白直接建节点并连线
4. 弹窗与 topbar 平级，禁止渲染在 topbar 内部
5. 主题切换只换 CSS 变量
6. 有最近项目直接进画布；无项目进入项目中心，不自动创建
7. 节点按输出实际比例显示，工具栏随节点选中出现
8. 新建派生节点必须自动连源节点；版本回写不新建节点
9. P1 AI 操作统一走 `image.i2i` + 提示词模板 + 当前节点新版本
10. 自由裁剪/字幕框选共用 `useBoxEditor`；打光/机位用 2D 投影球体

## 环境注意

- `typecheck` 自动探测：本地 TS 7 可用时直接使用，检测到加密导致的 `Invalid character` 时回退 `typescript@5.9.3`
- `pnpm` 不在 PATH 时用 `corepack pnpm`
- Electron 二进制缺失时用 `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/` 执行 `node node_modules/electron/install.js`
- `ffmpeg-static` 需加入 `pnpm-workspace.yaml` 的 `allowBuilds`，否则二进制不下载
- worktree 与主仓库同时运行会抢单实例锁；worktree 用 `CINELAB_USER_DATA` 独立目录，调试端口用 `CINELAB_DEBUG_PORT`
- electron-builder `--dir` 在当前环境报 `EXDEV`，打包验证需在正常目录
- 从 ZIP 解压的目录没有 `.git`，需要重新 init 并关联远程

## 运行

```bash
corepack pnpm install
corepack pnpm dev
corepack pnpm typecheck
corepack pnpm build
```
