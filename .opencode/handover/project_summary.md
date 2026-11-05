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
| 存储 | 项目文件夹 + JSON / JSONL（不引入 SQLite） |
| 打包 | 免安装绿色版 + zip（安装包已从计划移除） |

## 目录结构

```
D:\CineLab
├─ docs/                    ui-spec.md、architecture.md
├─ scripts/                 cdp-shot / cdp-eval / cdp-drag / cdp-connect、mock-openai
├─ src/
│  ├─ main/                 窗口、IPC、项目/多画布、Provider、队列、资产落盘、资产库、自定义协议
│  ├─ preload/              contextBridge 白名单
│  ├─ shared/               canvas、project、provider、generation、library、ipc-contract
│  └─ renderer/src/
│     ├─ canvas/            Canvas、TopBar、BottomBar、StatusBar、PromptBar、AddNodeMenu、nodes、edges
│     ├─ stores/            canvas、project、settings、generation、library、ui
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
| M3 | ✅ 完成 | 火山方舟、可灵、MiniMax、智谱、Vidu 视频适配器；可灵支持 API Key 与 JWT |
| M4 | ✅ 完成 | TTS、资产库（角色/素材/模板/一致性） |
| M5 | ✅ 已完成免安装版 | 绿色版与 zip 可用；安装包已从计划移除 |
| M6 | ✅ 完成 | 导出、画布参考、节点比例与工具栏、智能引用、AI 水印开关；图片标记取消 |

## 已完成的关键工件

- `docs/ui-spec.md`：13 章界面规格，含精确尺寸与两套色板
- `docs/architecture.md`：14 章技术架构，含 `.cinelab` 格式、Provider 接口、执行引擎
- `src/shared/`：画布、项目、Provider、生成事件、资产库、IPC 六套共享 schema
- `src/main/project/manager.ts`：`.cinelab` 创建/打开/保存、项目重命名、多画布管理
- `src/renderer/src/canvas/TopBar.tsx`：项目菜单、全部项目浮窗、画布下拉与内联重命名
- `src/renderer/src/canvas/StatusBar.tsx`：左下悬浮工具条（资产/整理/视图/连线/吸附/缩放）
- `src/renderer/src/panels/SettingsPanel.tsx`：居中设置浮窗，左侧导航（模型服务/外观/快捷键/关于）
- `src/main/settings/store.ts`：Provider 配置与 safeStorage 加密 Key
- `src/main/settings/models-config.ts`：`models.json` 读取、合并、预设解析与校验
- `src/main/providers/openai-compat.ts`：文生图/图生图、TTS、文本生成、音乐生成
- `src/main/providers/http-template.ts`：通用 HTTP 视频模板执行器
- `src/main/providers/agnes.ts`：Agnes 视频适配器
- `src/main/providers/kling.ts`：可灵视频适配器（API Key / JWT）
- `src/main/providers/minimax.ts`：MiniMax H3 与旧版 Hailuo 适配器
- `src/main/providers/volcengine.ts`：火山方舟视频异步轮询
- `src/main/engine/queue.ts`：并发 2 任务队列、取消、进度事件
- `src/main/assets/ingest.ts`：SHA-256 去重、缩略图、资产落盘、输出宽高记录
- `src/main/protocol.ts`：`cinelab-asset://` 本地资产协议（支持 Range）
- `src/renderer/src/stores/project.ts`：项目状态与 600ms 防抖自动保存
- `src/renderer/src/canvas/nodes/CineNodeView.tsx`：节点统一外壳、版本栈、选中工具栏、图片浮窗
- `src/renderer/src/canvas/AddNodeMenu.tsx`：「引用该节点生成」菜单
- `src/renderer/src/canvas/PromptBar.tsx`：三行 prompt bar、画布参考、智能引用、比例网格、展开编辑
- `src/renderer/src/canvas/MultiSelectBar.tsx`：多选工具栏（保存到资产 / 创建副本 / 导出 zip / 删除）
- `docs/models.md`：models.json 字段、适配器、Key 优先级与 http-template 说明
- `docs/group-nodes.md`：分组节点设计（10 色、三种排列、拖出脱离、删除语义）
- `src/main/library/store.ts`：角色卡、素材、模板存储与去重
- `src/main/library/config.ts`：全局资产库根目录与路径配置
- `src/renderer/src/panels/library/LibraryWindow.tsx`：全局资产库浮窗、文件夹树与资产网格
- `src/renderer/src/panels/LibraryPanel.tsx`：资产库面板（角色 / 素材 / 模板）
- `src/renderer/src/panels/ProjectCenter.tsx`：无项目启动页、最近项目
- `src/main/export/zip.ts`：store 模式 zip 打包（跳过 `.lock` / `.trash`）
- `src/main/ipc/export.ts`：项目 zip、画布 PNG、选中素材导出
- `src/renderer/src/components/WindowControls.tsx`：全局窗口三键
- `src/renderer/src/components/Toast.tsx`：全局导出结果提示
- `src/renderer/src/canvas/PromptBar.tsx`：画布参考拾取、自动连线、引用缩略图

## 设计约定

1. 画布优先：除顶栏、左下工具条、底部胶囊，无常驻面板
2. 节点轻、参数重：所有生成参数在 prompt bar
3. 创建即连接：拉线到空白直接建节点并连线
4. 弹窗与 topbar 平级，禁止渲染在 topbar 内部
5. 主题切换只换 CSS 变量
6. 有最近项目直接进画布；无项目进入项目中心，不自动创建
7. 节点按输出实际比例显示，工具栏随节点选中出现
8. prompt bar 参数选择用下拉/网格，可展开为居中编辑浮窗
9. 单选节点显示 prompt bar 与节点工具栏；多选隐藏单节点 UI，显示顶部多选工具栏
10. 模型配置走 models.json；非 OpenAI 协议优先 http-template，特殊鉴权才写专用适配器
11. 分组是持久父子节点关系，不是临时多选；设计见 docs/group-nodes.md

## 环境注意

- `typecheck` 自动探测：本地 TS 7 可用时直接使用，检测到加密导致的 `Invalid character` 时回退 `typescript@5.9.3`
- `pnpm` 不在 PATH 时用 `corepack pnpm`
- Electron 二进制缺失时用 `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/` 执行 `node node_modules/electron/install.js`
- 从 ZIP 解压的目录没有 `.git`，需要重新 init 并关联远程

## 运行

```bash
corepack pnpm install
corepack pnpm dev
corepack pnpm typecheck
corepack pnpm build
```
