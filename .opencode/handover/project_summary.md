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
| 打包 | electron-builder：NSIS 安装包 + zip（CI Windows 构建） |

## 目录结构

```
C:\Users\LAUFLO\Documents\CineLab
├─ docs/                    ui-spec.md、architecture.md、node-toolbar-plan.md、group-nodes.md
├─ scripts/                 cdp-shot / cdp-eval / cdp-drag / cdp-connect、mock-openai
├─ src/
│  ├─ main/                 窗口、IPC、项目/多画布、Provider、队列、资产落盘、media、资产库、自定义协议
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
| M3 | ✅ 完成 | 火山方舟、可灵、MiniMax、智谱、Vidu 视频适配器；可灵支持 API Key 与 JWT |
| M4 | ✅ 完成 | TTS、资产库（角色/素材/模板/一致性） |
| M5 | ✅ 完成 | NSIS 安装包 + zip；Windows CI 构建已跑通 |
| M6 | ✅ 完成 | 导出、画布参考、节点比例与工具栏、智能引用、AI 水印开关；图片标记取消 |
| NODE-TOOLBAR P0 | ✅ 完成 | 工具栏框架、ffmpeg、宫格切分、裁剪、截取、拆轨、画面裁切、首/尾/当前帧抽帧 |
| NODE-TOOLBAR P1 | ✅ 完成 | 九宫格、三视图、画面推演、光影校正、预设打光/多角度、人像、抠图 |
| NODE-TOOLBAR P2 | ✅ 完成 | 自由裁剪、框选去字幕、3D 光位/机位球 |
| GROUP-1 | ✅ 完成 | 分组节点：打组/合并/解组、10 色、排列、拖出脱离、复制、删除级联 |
| UI-1 | ✅ 完成 | 底部工具栏：绿加号、工具浮窗、历史、快捷键、Ctrl+F 搜索、模型列表获取 |
| STORYBOARD-1 | ✅ 完成 | 分镜组：2–25 张图片、比例/宫格、2K 拼接、序号、清空、转普通组 |
| P0-1 | ✅ 完成 | 安装包只保留 win32-x64 ffprobe，225.6MB → 154.2MB |
| P0-3 | ✅ 完成 | GitHub Actions Windows 打包，CI 全流程通过 |
| MODELS-CONFIG-UNIFY | ✅ 完成 | models.json 唯一供应商清单；settings.json 只存加密 Key；旧数据迁移 |
| UPDATE-1 | ✅ 完成 | electron-updater 检查/下载/重启安装入口；本地 mock 验证，暂不正式发包 |
| UI-POLISH-2 | 🚧 待提交 | 窗口 86%、节点工具栏固定、对齐同边/中心、视频预览、节点尺寸、自动成组、宫格显示 |
| RUNTIME-COMPONENTS-1 | ⏳ 下一焦点 | runtime 组件 CI 构建与 Release；模型已走官方 HF |

## 已完成的关键工件

- `docs/ui-spec.md`：13 章界面规格，含精确尺寸与两套色板
- `docs/architecture.md`：14 章技术架构，含 `.cinelab` 格式、Provider 接口、执行引擎
- `src/shared/`：画布、项目、Provider、生成事件、资产库、IPC 六套共享 schema
- `src/main/project/manager.ts`：`.cinelab` 创建/打开/保存、项目重命名、多画布管理
- `src/renderer/src/canvas/TopBar.tsx`：项目菜单、全部项目浮窗、画布下拉与内联重命名
- `src/renderer/src/canvas/StatusBar.tsx`：左下悬浮工具条（资产/整理/视图/连线/吸附/缩放）
- `src/renderer/src/panels/SettingsPanel.tsx`：居中设置浮窗，左侧导航（模型服务/外观/快捷键/关于）
- `src/main/settings/store.ts`：Provider Key 加密存储、providerKeys 迁移
- `src/main/settings/models-config.ts`：models.json 唯一读写、原子写、文件监听、预设解析与校验
- `src/main/providers/openai-compat.ts`：文生图/图生图、TTS、文本生成、音乐生成
- `src/main/providers/http-template.ts`：通用 HTTP 视频模板执行器
- `src/main/providers/agnes.ts`：Agnes 视频适配器
- `src/main/providers/kling.ts`：可灵视频适配器（API Key / JWT）
- `src/main/providers/minimax.ts`：MiniMax H3 与旧版 Hailuo 适配器
- `src/main/providers/volcengine.ts`：火山方舟视频异步轮询
- `src/main/engine/queue.ts`：并发 2 任务队列、取消、进度事件
- `src/main/assets/ingest.ts`：SHA-256 去重、缩略图、资产落盘、输出宽高记录
- `src/main/protocol.ts`：`cinelab-asset://` 本地资产协议（支持 Range）
- `docs/node-toolbar-plan.md`：节点工具栏范围、决策与 P0/P1/P2 技术要点
- `src/main/media/`：ffmpeg/ffprobe、宫格切分、裁剪、抽帧、拆轨、delogo
- `src/main/ipc/media.ts`：媒体 IPC
- `src/renderer/src/canvas/nodes/NodeToolbar.tsx`：节点工具栏、更多菜单、禁用态
- `src/renderer/src/canvas/nodes/node-operations.ts`：操作注册表与提示词模板
- `src/renderer/src/canvas/nodes/`：AiOperationDialog、CropDialog、SubtitleDialog、SphereDialog、TrimDialog、useBoxEditor
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
- `src/renderer/src/canvas/PromptBar.tsx`：画布参考拾取、自动连线、引用缩略图预览与双击聚焦
- `src/renderer/src/canvas/GroupToolbar.tsx`、`nodes/GroupNodeView.tsx`：分组工具栏、组框与左右引用 handle
- `src/renderer/src/canvas/StoryboardToolbar.tsx`、`src/main/media/stitch.ts`：分镜组工具栏与 2K 宫格拼接
- `src/main/ipc/media.ts`：新增 `media:stitch` 拼接 IPC
- `src/renderer/src/canvas/BottomBar.tsx`、`panels/HistoryPanel.tsx`、`NodeSearch.tsx`、`ShortcutPanel.tsx`：底部工具栏与三个浮窗
- `src/renderer/src/components/AppTooltip.tsx`：统一悬浮提示（title → data-tip）
- `src/main/settings/store.ts`：`fetchModels` 获取供应商模型列表
- `src/main/settings/models-config.ts`：models.json 唯一读写、原子写、文件监听
- `src/main/settings/store.ts`：providerKeys 加密 Key、旧 providers 迁移
- `docs/models-config-unify-plan.md`：模型配置统一方案
- `src/main/update/service.ts`、`src/main/ipc/update.ts`：electron-updater 状态机与 IPC
- `docs/update-plan.md`：自动更新方案（暂不正式发包）
- `src/main/components/manifest.ts`：depth-model 官方 HF + hf-mirror 源
- `docs/beef-tv-depth-research.md`：BeefTV runtime 分发调研
- `docs/derived-nodes-group-plan.md`：派生节点自动成组与尺寸规范
- `.opencode/handover/evidence/UI-POLISH-2026-11-07.md`：节点尺寸/自动成组/对齐/预览验证
- `.opencode/handover/evidence/MODELS-OFFICIAL-SOURCE.md`：模型官方源下载验证

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
12. 新建派生节点必须自动连源节点；版本回写不新建节点
13. P1 AI 操作统一走 `image.i2i` + 提示词模板 + 当前节点新版本
14. 自由裁剪/字幕框选共用 `useBoxEditor`；打光/机位用 2D 投影球体
15. 按钮强调色统一 `--pick-bar`（主题绿）；浮层居中用独立 `translate` 属性
16. 可滚动浮层拦截 wheel，不带动画布；上传素材节点标记 `assetOnly`，不显示 prompt bar
17. 组可作为引用源：连线到组时展开组内所有子节点输出
18. 模型配置：models.json 唯一元数据清单，settings.json 只存加密 Key；明文 apiKey 忽略并警告
19. 派生多节点自动成组：宫格切分 → 宫格组，分离音视频 → 音视频组，多文件上传 ≥2 → 素材组
20. 节点默认尺寸：图片 360、视频 480、宫格 240、分镜组 480、文本/音频 348
21. 对齐线只保留同侧边与中心线，不做边对中心
22. 节点卡片不设固定 minHeight；图片/视频预览用 object-fit: contain，宫格每格按自身比例

## 环境注意

- `typecheck` 自动探测：本地 TS 7 可用时直接使用，检测到加密导致的 `Invalid character` 时回退 `typescript@5.9.3`
- `pnpm` 不在 PATH 时用 `corepack pnpm`
- Electron 二进制缺失时用 `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/` 执行 `node node_modules/electron/install.js`
- `ffmpeg-static` 需加入 `pnpm-workspace.yaml` 的 `allowBuilds`，否则二进制不下载
- `ffmpeg-static` 安装报连接超时时，设置 `FFMPEG_BINARIES_URL=https://registry.npmmirror.com/-/binary/ffmpeg-static` 重跑
- `corepack pnpm dev:isolated` 自动分配 CDP 端口与临时 userData，可与其它会话并行；重启会重置临时 userData
- worktree 与主仓库同时运行会抢单实例锁；worktree 用 `CINELAB_USER_DATA` 独立目录，调试端口用 `CINELAB_DEBUG_PORT`
- electron-builder `--dir` 在当前环境报 `EXDEV`，打包验证需在正常目录
- 从 ZIP 解压的目录没有 `.git`，需要重新 init 并关联远程
- runtime 组件本地测试：`node scripts/mock-component-server.mjs`（默认 8899）+ 设置 `CINELAB_COMPONENT_BASE_URL=http://127.0.0.1:8899`
- 自动更新本地测试：`node scripts/mock-update-server.mjs`（8788）+ 设置 `CINELAB_UPDATE_URL=http://127.0.0.1:8788`
- CI：`.github/workflows/build-win.yml` 已跑通；自动更新暂用 `--publish never`，不创建 Release

## 运行

```bash
corepack pnpm install
corepack pnpm dev
corepack pnpm typecheck
corepack pnpm build
corepack pnpm dist:win
```
