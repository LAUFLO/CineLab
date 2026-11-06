<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/brand/readme-wordmark-dark.png">
    <img src="docs/brand/readme-wordmark-light.png" alt="CineLab" width="360">
  </picture>
</p>

<p align="center">
  本地运行的 AI 创作无限画布 · 模型接入完全开放 · 数据存在你自己的硬盘上
</p>

<p align="center">
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/badge/license-MIT-black.svg"></a>
  <img alt="Electron" src="https://img.shields.io/badge/Electron-45-1f1f1f.svg">
  <img alt="React" src="https://img.shields.io/badge/React-19-1f1f1f.svg">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-7-1f1f1f.svg">
</p>

## 简介

CineLab 是一个面向 AIGC 创作者的桌面创作工具。图片生成、视频生成、音频生成、剧本生成都在同一张无限画布上完成，素材、节点、连线、生成历史和版本栈都保存在本地 `.cinelab` 项目文件夹里。

与常见的云端创作工具不同，CineLab 不绑定模型供应商：可以接入任意 OpenAI 兼容接口、自建服务、中转站，也支持可灵、火山方舟、MiniMax、Vidu 等视频服务，以及自定义 HTTP 模板。

画布交互参考 LibTV 的无限画布产品，目标是做到体验一致、能力更开放。

## 功能

### 画布与项目

- **无限画布**：节点自由摆放，拖线连接上下游，右侧 `+` 发起生成
- **多项目 / 多画布**：一个项目包含多个画布，支持创建、切换、重命名、删除
- **自动保存**：画布与项目元数据自动落盘，崩溃后可恢复
- **项目中心**：欢迎页展示最近项目，支持项目封面（本地图片或画布图片，1:1）
- **分组与分镜**：普通分组、分镜组、宫格排列、2K 拼接、转普通组
- **版本栈**：同一节点的多次生成可对比、回滚、继续基于历史结果生成

### 生成能力

- **图片**：文生图、图生图、九宫格、多角度、打光、人像、抠图
- **视频**：文生视频、图生视频、首尾帧、可灵 / 火山方舟 / MiniMax / Vidu 等适配器
- **音频**：TTS 语音合成、音乐生成
- **文本**：LLM 节点、剧本生成、提示词改写
- **任务队列**：并发限制、进度事件、取消、失败重试

### 本地媒体处理

- **深度动作捕捉**：VDA Small 视频深度图，输出比例跟随输入，组件按需下载
- **视频工具**：截取、裁切、分离音视频、抽帧
- **图片工具**：自由裁剪、宫格切分、分镜拼接、框选去字幕
- **文件与导出**：项目打包、当前画布 PNG、选中素材 ZIP 导出

### 创作体验

- **节点工具栏**：一级操作 + 更多菜单，支持自定义常用操作
- **命令面板 / 快捷键 / 生成历史**：底部工具栏统一入口
- **深浅双主题**：黑白灰视觉体系，只通过 CSS 变量切换
- **统一 tooltip**：超出可视区域的提示会自动避让

## 技术栈

| 层 | 选择 |
|---|---|
| 桌面端 | Electron 45，无边框窗口，主进程隔离 |
| 前端 | React 19 + TypeScript 7 + Vite 8 |
| 画布 | React Flow 12（`@xyflow/react`） |
| 状态 | Zustand 5 |
| 样式 | Tailwind CSS 4 + CSS 变量（深浅双主题） |
| 校验 | Zod 4 |
| 媒体 | ffmpeg-static + ffprobe-static |
| 存储 | 项目文件夹 + JSON / JSONL，不使用 SQLite |

## 快速开始

需要 Node.js 22+ 和 pnpm 10+。如果 `pnpm` 不在 PATH 中，先执行 `corepack enable`。

```bash
corepack pnpm install
corepack pnpm dev
```

Windows 下如果 Electron 二进制下载失败：

```powershell
$env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
node node_modules/electron/install.js
```

## 开发命令

```bash
corepack pnpm dev            # 启动 Electron + Vite
corepack pnpm dev:isolated   # 独立测试实例：独立 userData + 自动分配 CDP 端口
corepack pnpm typecheck      # 主进程 + 渲染进程类型检查
corepack pnpm build          # 生产构建
corepack pnpm dist:win       # 打包 Windows 安装包
corepack pnpm check:encryption  # 检查透明加密文件与 Git blob 是否为明文
```

## 项目结构

```text
src/
├─ main/       主进程：窗口、IPC、项目读写、Provider、任务队列、组件下载
├─ preload/    contextBridge 桥接
├─ shared/     节点 / 项目 / Provider / 媒体 schema 与 IPC 契约
└─ renderer/
   └─ src/
      ├─ canvas/      画布、节点、连线、工具栏、prompt bar
      ├─ stores/      Zustand 状态
      ├─ panels/      设置、资产库、项目中心
      ├─ components/  通用组件与品牌组件
      ├─ theme/       主题切换
      └─ styles/      CSS 变量与全局样式
```

## 文档

- [界面规格](docs/ui-spec.md)：布局尺寸、深浅色、节点结构、prompt bar、工具栏清单
- [技术架构](docs/architecture.md)：主进程架构、项目文件格式、Provider 接口、任务系统
- [模型配置](docs/models.md)：`models.json` 格式与 Provider 配置
- [深度动作捕捉](docs/depth-capture-plan.md)：VDA Small、组件下载、编码参数
- [项目封面](docs/project-cover-plan.md)：封面存储、裁切、画布图片选择
- [后续路线图](docs/roadmap-plan.md)：发布准备、体验优化、工程质量与大功能规划

## 路线图

已完成：

- [x] 无限画布、节点连线、自动保存
- [x] 多项目 / 多画布、项目中心、项目封面
- [x] OpenAI 兼容文生图 / 图生图 / 文本 / TTS
- [x] 可灵、火山方舟、MiniMax、Vidu 视频适配器
- [x] 分组节点、分镜组、2K 拼接
- [x] 节点工具栏：九宫格、多角度、打光、人像、抠图、自由裁剪、3D 光位
- [x] 深度动作捕捉（VDA Small，组件按需下载）
- [x] 品牌资源、深浅主题、统一 tooltip

计划中：

- [ ] 安装包瘦身（ffprobe 仅保留目标平台）
- [ ] GitHub Actions Windows 打包
- [ ] 深度动作捕捉真实素材验收
- [ ] 模型配置引导
- [ ] 统一错误与任务反馈
- [ ] 最小测试与 CI
- [ ] 本地日志与崩溃报告
- [ ] Agent 集成
- [ ] 剪辑台
- [ ] 智能剪辑
- [ ] 超分

## 贡献

项目仍在快速迭代中，欢迎提 Issue 和 PR。提交 PR 前建议先开 Issue 对齐方案。

## 协议

[MIT](LICENSE)
