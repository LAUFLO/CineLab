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
| 状态 | Zustand 5 + persist |
| 样式 | Tailwind 4 + CSS 变量（深浅双主题） |
| 校验 | Zod 4 |
| 存储 | 项目文件夹 + JSON / JSONL（暂不用 SQLite） |
| 打包 | electron-builder 26 |

## 目录结构

```
C:\Users\LAUFLO\Documents\CineLab
├─ docs/                    ui-spec.md、architecture.md
├─ scripts/                 cdp-shot / cdp-eval / cdp-drag（开发期自动化验证）
├─ src/
│  ├─ main/                 窗口、IPC、项目/多画布、Provider、队列、资产落盘、资产库、自定义协议
│  ├─ preload/              contextBridge 白名单
│  ├─ shared/               canvas、project、provider、generation、library、ipc-contract
│  └─ renderer/src/
│     ├─ canvas/            Canvas、TopBar、BottomBar、StatusBar、PromptBar、AddNodeMenu、nodes、edges
│     ├─ stores/            canvas、project、settings、generation、library、ui
│     ├─ panels/            SettingsPanel、LibraryPanel、ProjectCenter、ConfirmDialog
│     ├─ components/        Icon
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
| M2 | ✅ 完成 | 项目文件夹、模型配置、文生图/图生图、文本生成、队列、版本栈已通 |
| M3 | ⚠️ 部分完成 | 火山方舟视频、首尾帧已通；可灵 JWT 待接 |
| M4 | ✅ 完成 | TTS、资产库（角色/素材/模板/一致性）已通 |
| M5 | ⏳ 下一步 | 打包、性能、导入导出 |

## 已完成的关键工件

- `docs/ui-spec.md`：13 章界面规格，含精确尺寸与两套色板
- `docs/architecture.md`：14 章技术架构，含 `.cinelab` 格式、Provider 接口、执行引擎
- `src/shared/`：画布、项目、Provider、生成事件、IPC 五套共享 schema
- `src/main/project/manager.ts`：`.cinelab` 创建/打开/保存、项目重命名、多画布管理
- `src/renderer/src/canvas/TopBar.tsx`：项目菜单、全部项目、画布下拉与内联重命名
- `src/renderer/src/canvas/StatusBar.tsx`：左下悬浮工具条（资产/整理/视图/连线/吸附/缩放）
- `src/main/settings/store.ts`：Provider 配置与 safeStorage 加密 Key
- `src/main/providers/openai-compat.ts`：文生图/图生图、TTS 与文本生成适配器
- `src/main/providers/volcengine.ts`：火山方舟视频异步轮询
- `src/main/engine/queue.ts`：并发 2 任务队列、取消、进度事件
- `src/main/assets/ingest.ts`：SHA-256 去重、缩略图、资产落盘
- `src/main/protocol.ts`：`cinelab-asset://` 本地资产协议
- `src/renderer/src/stores/project.ts`：项目状态与 600ms 防抖自动保存
- `src/renderer/src/canvas/nodes/CineNodeView.tsx`：节点统一外壳（标题在卡片外、左右手柄）
- `src/renderer/src/canvas/AddNodeMenu.tsx`：「引用该节点生成」菜单
- `src/renderer/src/canvas/PromptBar.tsx`：三行 prompt bar（工具/输入/参数/角色选择）
- `src/renderer/src/panels/SettingsPanel.tsx`：Provider 配置抽屉
- `src/main/library/store.ts`：角色卡、素材、模板存储与 SHA-256 去重
- `src/main/ipc/library.ts`：资产库 IPC
- `src/shared/library-schema.ts`：角色卡、素材、模板共享类型
- `src/renderer/src/stores/library.ts`：资产库状态与 CRUD
- `src/renderer/src/panels/LibraryPanel.tsx`：资产库面板（角色 / 素材 / 模板）
- `src/renderer/src/panels/ProjectCenter.tsx`：无项目启动页、最近项目、新建/打开入口
- `src/renderer/src/panels/ConfirmDialog.tsx`：应用内确认弹窗（删除项目等高风险操作）

## 设计约定

1. 画布优先：除顶栏、底部工具条、左下状态区，无常驻面板
2. 节点轻、参数重：所有生成参数在 prompt bar
3. 创建即连接：拉线到空白直接建节点并连线
4. 默认安静：`+` 仅悬停出现，连线默认低透明度
5. 主题切换只换 CSS 变量
6. 左下工具条悬浮，资产库为左侧浮层，不使用全屏遮罩；节点加号在边线外侧，连线贴边
7. 有最近项目时启动直接进画布；无项目时进入项目中心欢迎页，不自动创建项目

## 主要决策

| 决策 | 选择 | 放弃 |
|---|---|---|
| 桌面壳 | Electron | Tauri |
| 画布 | React Flow | tldraw |
| 存储 | JSON/JSONL | SQLite |
| 后端 | 主进程 | Hono / Express |
| 画布组织 | 纯自由画布 | 分镜 / 场次 / 网格 |
| 参数入口 | 仅 prompt bar | 节点内参数面板 |

## 运行

```bash
corepack pnpm install
corepack pnpm dev
corepack pnpm typecheck
corepack pnpm build
```

> 当前环境依赖已安装；pnpm 通过 `corepack pnpm` 调用，Electron 二进制已用 npmmirror 安装。
