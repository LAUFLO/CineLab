# CineLab

> 本地运行的 AI 创作无限画布。模型完全自定义，数据存在你自己的硬盘上。

CineLab 是一个面向 AIGC 创作者的桌面创作工具。文生图、图生图、视频生成、LLM 节点都在一张无限画布上，拉线即工作流，结果自动落盘到本地项目文件夹。

与市面上的画布工具不同，CineLab 不绑定模型供应商：你可以接入任意 OpenAI 兼容接口、自建网关、中转站，后续还会支持可灵、火山方舟和通用 HTTP 模板。

界面交互参考了 LibTV 等无限画布产品，但代码完全独立。

## 特性

- **模型完全开放** — 统一的 Provider 适配器，新增模型只需加一个文件，不改画布代码
- **无限画布** — 节点自由摆放，从右侧 `+` 拉线到空白处即可创建下游节点并自动连接
- **本地优先** — 每个项目是一个 `.cinelab` 文件夹，可整包备份、拷贝、归档
- **深浅双主题** — 深色为默认，浅色完整适配，只通过 CSS 变量切换
- **版本栈** — 同一节点的多次生成独立保存，可对比、回滚、继续喂给下游
- **多画布** — 一个项目可创建多个画布，支持重命名、切换与删除
- **项目中心** — 无项目时进入启动页，新建或打开最近项目；有项目时直接回到画布

## 当前状态

项目处于早期开发阶段，接口和数据结构仍可能调整。

| 阶段 | 内容 | 状态 |
|---|---|---|
| M0 | 脚手架、Electron 三进程、主题系统 | ✅ |
| M1 | 画布核心：节点、连线、菜单、prompt bar、持久化 | ✅ |
| M2 | 项目文件夹、模型配置、真实出图、任务队列 | ✅ |
| M3 | 视频生成、首尾帧 | ⚠️ 部分完成：火山方舟已通，可灵待接 |
| M4 | 音频节点、角色库、模板系统 | ✅ |
| M5 | 打包、性能打磨、导入导出 | ⏳ 下一步 |

## 技术栈

| 层 | 选择 |
|---|---|
| 桌面壳 | Electron（主进程即后端，无独立服务） |
| 前端 | React 19 + TypeScript + Vite |
| 画布 | React Flow 12 |
| 状态 | Zustand + persist |
| 样式 | Tailwind CSS 4 + CSS 变量 |
| 校验 | Zod |
| 存储 | 项目文件夹 + JSON / JSONL（零原生依赖） |

## 快速开始

环境要求：Node.js 22+、pnpm 10+（若 `pnpm` 不可用，先执行 `corepack enable`）

```bash
pnpm install
pnpm dev
```

Windows 上如果 Electron 二进制下载失败：

```powershell
$env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
node node_modules/electron/install.js
```

其他命令：

```bash
pnpm typecheck   # 类型检查
pnpm build       # 构建
pnpm dist:win    # 打包 Windows 安装包
```

## 项目结构

```
src/
├─ main/        主进程：窗口、IPC、项目读写、Provider、任务队列
├─ preload/     contextBridge 白名单
├─ shared/      节点 schema、IPC 契约
└─ renderer/
   └─ src/
      ├─ canvas/      画布、节点、连线、菜单、prompt bar
      ├─ stores/      Zustand 状态
      ├─ components/  基础组件
      ├─ theme/       主题切换
      └─ styles/      CSS 变量与全局样式
```

## 文档

- [界面规格](docs/ui-spec.md) — 区域尺寸、深浅色板、节点结构、prompt bar、交互清单
- [技术架构](docs/architecture.md) — 进程架构、项目文件格式、Provider 接口、执行引擎、IPC 协议

## 路线图

- [x] 无限画布与四类节点
- [x] 拉线创建节点与自动连接
- [x] 深浅主题
- [x] 本地项目文件夹与自动保存
- [x] 多画布与项目/画布重命名
- [x] 项目中心与无项目欢迎页
- [x] OpenAI 兼容文生图
- [x] OpenAI 兼容图生图
- [x] OpenAI 兼容文本生成
- [x] 火山方舟视频生成
- [ ] 可灵视频生成
- [x] OpenAI 兼容 TTS
- [x] 角色卡与素材库
- [x] 角色一致性生成
- [x] 提示词模板
- [ ] 桌面安装包

## 贡献

项目仍在快速迭代中，欢迎提 Issue 讨论需求。提交 PR 前建议先开 Issue 对齐方向。

## 协议

[MIT](LICENSE)
