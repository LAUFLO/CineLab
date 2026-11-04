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
D:\CineLab
├─ docs/                    ui-spec.md、architecture.md
├─ scripts/                 cdp-shot / cdp-eval / cdp-drag（开发期自动化验证）
├─ src/
│  ├─ main/                 主进程：窗口、IPC、项目读写（待建）、Provider（待建）
│  ├─ preload/              contextBridge 白名单
│  ├─ shared/               canvas-schema、ipc-contract
│  └─ renderer/src/
│     ├─ canvas/            Canvas、TopBar、BottomBar、StatusBar、PromptBar、AddNodeMenu、nodes、edges
│     ├─ stores/            canvas（节点/边）、ui（菜单）
│     ├─ components/        Icon
│     ├─ theme/             useTheme
│     └─ styles/            tokens.css、global.css
├─ .opencode/handover/      交接状态与文档
└─ AGENTS.md                接续指引
```

## 当前进度

| 阶段 | 状态 | 说明 |
|---|---|---|
| M0 | ✅ 完成 | 脚手架、三进程、主题、空画布 |
| M1 | ✅ 完成 | 四类节点、拖拽、连线、菜单、prompt bar、持久化 |
| M2 | ⏳ 下一个 | 项目文件夹、模型配置、真实出图 |
| M3 | 待开始 | 视频生成 |
| M4 | 待开始 | 音频、角色库 |
| M5 | 待开始 | 打包、性能、导入导出 |

## 已完成的关键工件

- `docs/ui-spec.md`：13 章界面规格，含精确尺寸与两套色板
- `docs/architecture.md`：14 章技术架构，含 `.cinelab` 格式、Provider 接口、执行引擎
- `src/shared/canvas-schema.ts`：四类节点元数据（尺寸、模板）
- `src/renderer/src/stores/canvas.ts`：节点/边状态 + localStorage 持久化
- `src/renderer/src/canvas/nodes/CineNodeView.tsx`：节点统一外壳（标题在卡片外、左右手柄）
- `src/renderer/src/canvas/AddNodeMenu.tsx`：「引用该节点生成」菜单
- `src/renderer/src/canvas/PromptBar.tsx`：三行 prompt bar（工具/输入/参数）

## 设计约定

1. 画布优先：除顶栏、底部工具条、左下状态区，无常驻面板
2. 节点轻、参数重：所有生成参数在 prompt bar
3. 创建即连接：拉线到空白直接建节点并连线
4. 默认安静：`+` 仅悬停出现，连线默认低透明度
5. 主题切换只换 CSS 变量

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
pnpm install
pnpm dev
pnpm typecheck
```
