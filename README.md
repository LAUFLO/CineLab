<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/brand/readme-wordmark-dark.png">
    <img src="docs/brand/readme-wordmark-light.png" alt="CineLab" width="360">
  </picture>
</p>

<p align="center">
  本地运行的 AI 创作工作台 · 无限画布 + CineBot + MCP + 剪辑室 + 导演台 + 逐帧拉片
</p>

<p align="center">
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/badge/license-MIT-black.svg"></a>
  <img alt="Platform" src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS-1f1f1f.svg">
  <a href="https://github.com/LAUFLO/CineLab/releases/latest"><img alt="Version" src="https://img.shields.io/github/v/release/LAUFLO/CineLab?label=version&color=1f1f1f"></a>
</p>

<p align="center">
  简体中文 | <a href="README.en.md">English</a>
</p>

<p align="center">
  <a href="https://github.com/LAUFLO/CineLab/releases/latest">下载</a>
  ·
  <a href="docs/README.md">文档</a>
  ·
  <a href="https://applink.feishu.cn/client/chat/chatter/add_by_link?link_token=ee4gcf5b-e0c4-4ede-b6e8-524abb223c01">飞书交流群</a>
  ·
  <a href="https://qun.qq.com/universal-share/share?ac=1&authKey=Q9ARD0p6c%2BkqnN5F4k%2BMysAX18yETDp%2F9OGNOL%2F%2FVL8eXMcotGtyMs26DyaLTKXH&busi_data=eyJncm91cENvZGUiOiIxMTM2NDMzODU4IiwidG9rZW4iOiJ2Q2ViQmtJSHBQSzh6UlFXVWI2QmtxMUlIZDFzaC95VlFoY05IRXc3Z00rcWFRMjhjZndFMnduTWNPVzBxc1JOIiwidWluIjoiMTE3NTA4MjQyNCJ9&data=-6tZHhq9ZGRpIjIU2f63RJcsU31U4SfF5aNtH5G0T6Cc2rjp_X9mzFu4KQuIToGQb2ODE5RhHgQRjsTnXVDycA&svctype=4&tempid=h5_group_info">QQ群：1136433858</a>
</p>

## CineLab 是什么

CineLab 是一个本地优先的 AI 创作工作台。图片、视频、音频和文本生成都在同一张无限画布上完成，节点、连线、素材、时间线、3D 预演、生成历史和 Agent 会话都保存在你自己的 `.cinelab` 项目文件夹里。

它把创作过程拆成四个工作台：无限画布负责素材和生成，剪辑室负责时间线，导演台负责 3D 预演，逐帧拉片把参考片拆成可生成的分镜和复刻工作流。CineBot 用自然语言操作这四个空间；外部 Agent 也可以通过 MCP 接入，和 CineBot 使用同一套工具。

模型层完全开放：供应商、模型、Base URL、API Key、请求头和参数都由你自己配置。可以直接接任意 OpenAI 兼容接口、自建服务和中转站，也可以用自定义 HTTP 模板适配其他协议；内置预设只是可选快捷方式，不限制你接入任何模型。

## 核心能力

### 无限画布

- 节点自由摆放，拖线连接上下游，右侧 `+` 发起生成
- 多项目、多画布、自动保存、崩溃恢复、项目封面
- 分组、分镜组、2K 拼接、版本栈
- 节点工具栏：九宫格、多角度、打光、人像、抠图、自由裁剪、3D 光位
- 文本节点支持 Markdown 所见即所得，输入 `#`、`-`、`>`、`**` 等即时格式化
- 参考槽位支持图片、视频、音频和文本，`@` 提及文本节点
- 结果节点只保留工具栏，不显示 PromptBar

### CineBot 与 MCP

**CineBot** 是应用内 Agent，当前开放 93 个工具：

- 覆盖画布、剪辑室、导演台、逐帧拉片、生成、资产库、提示词、风格、技能和项目
- 生成提案确认后才提交，不会先扣费
- 权限模式、回合撤销、项目内会话、三级技能目录
- 支持从文件夹或 ZIP 导入技能，按全局 / 项目范围启用

**MCP** 让外部 Agent 接入同一套能力，当前开放 100 个工具：

- 内置 MCP server，支持 HTTP 与 stdio，仅监听本机，使用 Bearer token 鉴权
- 工具名与 CineBot 一致，能力覆盖项目、画布、剪辑室、导演台、拉片、资产、提示词、风格、技能、素材入库和人声分离
- 写操作直接执行，不需要在 CineLab 窗口逐次确认
- 「只读模式」是安全阀：开启后所有写工具直接拒绝
- 删除类工具在设置页标记为红色危险操作
- 设置页可按名称搜索，并筛选只读 / 写 / 危险工具

### 资产库与提示词

- 预设提示词：创建、编辑、删除、全文预览，名称胶囊可插入输入框任意位置，发送时原位展开
- 风格库：官方只读 + 自定义风格，按分类浏览，一行 8 列小封面，单击即应用
- 资产库：全局 / 项目素材、提示词模板、角色卡和风格同源展示
- 工作流模板：把画布流程保存到资产库「工作流」，新建项目时直接选择；上传、生成、拉片和剪辑室节点会转为占位，替换素材后重新生成
- 预设、风格和提示词模板也开放给 CineBot 与 MCP，Agent 可以搜索、读取和管理

### 剪辑室

- 视频、音频、字幕、图片多轨时间线
- 裁剪、切分、吸附、速度、音量、淡入淡出、转场
- 自动粗剪：删静音、按镜头切分、节拍标记、节拍切分
- 本地 Whisper 字幕，ffmpeg 导出成片并写回画布
- 字幕可单独导出为 WebVTT
- 画布节点实时预览时间线，无需先导出成片；节点内可直接播放
- 导出版本可删除，并同步清理文件与失效连线

### 导演台

- three.js 3D 场景：人物素模、基础几何体、平面、群众阵列、本地 glTF
- 多机位、机位关键帧运镜、镜头时长和画幅
- 语义镜头：用「过肩拍 A 看 B」「双人中景」描述构图，自动解算机位并处理不越轴
- 场景图白膜：拖入一张概念图，自动生成可开拍的 3D 场景
- 对象位置、旋转、缩放、姿势、颜色、可见性、背景
- 白模预演导出为视频并回到画布；视口截图可直接变成画布图片节点

### 逐帧拉片

- 视频节点 → 拉片节点，自动切镜并抽首/中/尾帧
- 逐镜理解景别、机位、运镜、光线、画面、台词和提示词
- 确定性取证：静帧、静态图推拉、代码渲染、录屏、实拍、AI、3D，并给出证据
- 自动分场，按场生成镜头三节点（首帧、尾帧、文本）
- 角色表、风格档案、场景与音频组，可直接沉淀到资产库
- 选角/选景后一键复刻：为每个镜头建生成节点并连好首尾帧与提示词，只建图、不自动扣费
- 单镜重跑，只更新该镜的帧、描述和提示词

### 本地媒体

- 人声提取 / 背景音提取：视频源输出无声视频 + 对应音频，音频源只输出音频
- 深度动作捕捉（VDA Small），输出比例跟随输入
- 抽帧、裁切、分离音视频、去字幕、片段重拍
- 画面裁切支持 16:9 / 9:16 / 1:1 / 4:3 / 3:4 / 21:9 与自定义宽高比
- 抠图、扩图（配置图片模型图生图）、图层分离、宫格切分、分镜拼接
- 模型和运行时按需下载，不随安装包分发

### 完全开放的模型配置

- 供应商、模型、Base URL、API Key、请求头和参数全部本地可配，不依赖内置列表
- 任意 OpenAI 兼容接口、自建服务和中转站；内置预设（可灵、火山方舟、MiniMax、Vidu 等）可自由增删改，不锁定供应商
- 自定义 HTTP 模板，适配非 OpenAI 协议的模型服务
- 模型级能力配置：输入媒体（文本 / 图片 / 音频 / 视频）、生成模式、参考音频 / 参考视频、参数面板和输出特性，全部按模型声明
- 配置保存在本地 `models.json`，可备份、迁移和版本管理
- 能力一致性校验：声明与适配器实际执行对齐，不支持的输入在生成入口直接报错

### 本地适配器

- 在独立 utilityProcess 中运行，支持健康检查、版本、日志和热重载
- 支持同名模型覆盖和 `http-template` 扩展
- MCP 工具可以查询、重载和读取适配器日志

## 下载与安装

从 [GitHub Releases](https://github.com/LAUFLO/CineLab/releases/latest) 下载最新版：

当前版本 **v0.5.3**，完整变更见 [CHANGELOG.md](CHANGELOG.md)。

| 平台 | 推荐文件 | 系统要求 |
|---|---|---|
| Windows | `CineLab-0.5.3-x64.exe` | Windows 10 / 11 x64 |
| macOS | `CineLab-0.5.3-arm64.dmg` | macOS 12+，Apple Silicon |

### Windows

- 安装包未做代码签名，SmartScreen 提示时选择「更多信息 → 仍要运行」
- 项目数据保存在你选择的项目文件夹，配置保存在 `%APPDATA%\CineLab`
- 卸载：Windows 设置 → 应用 → CineLab

### macOS

- 安装包未签名、未公证，首次打开需右键 → 打开，或在「系统设置 → 隐私与安全性」放行
- 深度捕捉、视觉增强和本地字幕组件会按平台自动下载；视觉增强依赖「深度动作捕捉运行时」
- macOS 首版暂不支持自动更新，需要手动下载新版本
- 配置保存在 `~/Library/Application Support/CineLab`

下载后可对照 Release 页的 `SHA256SUMS.txt` 校验安装包。

检查或下载更新失败时，应用会提供「打开发布页」和「浏览器下载」入口，并按镜像代理 → GitHub 原始链接的顺序兜底。

## 第一次使用

1. 打开 CineLab，在项目中心新建项目
2. 进入设置 → 模型供应商，选择预设或手动填写 Base URL / API Key
3. 回到画布，双击空白处或点击右侧 `+` 创建第一个节点
4. 需要本地字幕、深度捕捉、人声分离或视觉增强时，按提示下载对应组件
5. 想让外部 Agent 接入时，打开设置 → MCP，复制 HTTP 或 stdio 配置到客户端

## 数据与备份

- 项目保存在你选择的 `.cinelab` 文件夹，包含画布、时间线、导演台、拉片、素材、Agent 会话和生成提案
- 模型配置、设置和 MCP token 保存在用户数据目录：Windows 为 `%APPDATA%\CineLab`，macOS 为 `~/Library/Application Support/CineLab`
- `models.json` 可以单独备份、迁移到另一台机器
- 项目可通过界面导出为压缩包，也可以调用 MCP `project_export`
- 所有数据默认留在本机，CineLab 不上传项目内容

## 反馈

Bug 和功能建议请提到 [GitHub Issues](https://github.com/LAUFLO/CineLab/issues)。提交前可以先搜索是否已有相同问题。

安全漏洞请不要公开提 Issue，按照 [SECURITY.md](SECURITY.md) 的方式私下报告。

## 文档

- [文档索引](docs/README.md)：现行文档、已实施方案和历史归档
- [代码地图](docs/code-map/README.md)：按模块查现状、入口和已有实现
- [更新日志](CHANGELOG.md)：每个版本的变更记录
- [技术架构](docs/architecture.md)：主进程架构、项目文件格式、Provider 接口、任务系统
- [模型配置](docs/models.md)：`models.json` 格式与 Provider 配置
- [界面规格](docs/ui-spec.md)：布局尺寸、节点结构、Prompt Bar、工具栏清单
- [CineBot 能力清单](docs/agent-capabilities.md)：当前工具、参数校验、确认规则和回合撤销
- [MCP](docs/mcp.md)：HTTP / stdio 配置、100 个工具、只读模式和排查
- [剪辑室](docs/code-map/03-clip-studio.md)
- [导演台](docs/code-map/04-director-stage.md)
- [逐帧拉片](docs/code-map/05-film-study.md)

## 开发

环境要求、常用命令、项目结构、分支规范和 PR 检查见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 贡献

项目仍在快速迭代中，欢迎提 Issue 和 PR。较大的改动建议先开 Issue 对齐方案，提交前请阅读 [CONTRIBUTING.md](CONTRIBUTING.md) 和 [分支规范](docs/branch-policy.md)。

## 协议

[MIT](LICENSE)
