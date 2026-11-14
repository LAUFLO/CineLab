<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/brand/readme-wordmark-dark.png">
    <img src="docs/brand/readme-wordmark-light.png" alt="CineLab" width="360">
  </picture>
</p>

<p align="center">
  本地运行的 AI 创作工作台 · 无限画布 + CineBot + 剪辑室 + 导演台 + 逐帧拉片
</p>

<p align="center">
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/badge/license-MIT-black.svg"></a>
  <img alt="Platform" src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS-1f1f1f.svg">
  <img alt="Version" src="https://img.shields.io/badge/version-0.1.1-1f1f1f.svg">
</p>

<p align="center">
  简体中文 | <a href="README.en.md">English</a>
</p>

<p align="center">
  <a href="https://github.com/LAUFLO/CineLab/releases/latest">下载</a>
  ·
  <a href="docs/README.md">文档</a>
</p>

## CineLab 是什么

CineLab 是一个本地优先的 AI 创作工作台。图片、视频、音频和文本生成都在同一张无限画布上完成，节点、连线、素材、生成历史和 Agent 会话都保存在你自己的 `.cinelab` 项目文件夹里。

它把创作过程拆成四个工作台：无限画布负责素材和生成，剪辑室负责时间线，导演台负责 3D 预演，逐帧拉片负责分镜拆解。CineBot 用自然语言操作这四个空间，也可以把模型类操作登记成生成提案，等你确认后再提交。

CineLab 不绑定模型供应商。可以接入任意 OpenAI 兼容接口、自建服务和中转站，也支持可灵、火山方舟、MiniMax、Vidu 等视频服务，以及自定义 HTTP 模板。

画布交互参考 LibTV 的无限画布产品，目标是体验一致、模型层开放。

## 核心能力

### 无限画布

- 节点自由摆放，拖线连接上下游，右侧 `+` 发起生成
- 多项目、多画布、自动保存、崩溃恢复、项目封面
- 分组、分镜组、2K 拼接、版本栈
- 节点工具栏：九宫格、多角度、打光、人像、抠图、自由裁剪、3D 光位

### CineBot

- 用自然语言创建、移动、连接、删除节点，修改标题和文本
- 覆盖画布、剪辑室、导演台和拉片四个空间
- 生成提案确认后才提交，不会先扣费
- 权限模式、回合撤销、项目内会话和三级技能目录

### 剪辑室

- 视频、音频、字幕、图片多轨时间线
- 裁剪、切分、吸附、速度、音量、淡入淡出、转场
- 自动粗剪：删静音、按镜头切分、节拍标记、节拍切分
- 本地 Whisper 字幕，ffmpeg 导出成片并写回画布

### 导演台

- three.js 3D 场景：人物素模、基础几何体、平面、群众阵列、本地 glTF
- 多机位、机位关键帧运镜、镜头时长和画幅
- 对象位置、旋转、缩放、姿势、颜色、可见性、背景
- 白模预演导出为视频并回到画布

### 逐帧拉片

- 视频节点 → 拉片节点 → 自动生成分镜组和分镜表
- 镜头检测或固定间隔拆分
- AI 描述景别、机位、运镜、光线、画面和提示词
- 段落编辑、内嵌字幕提取、Markdown 和拉片包导出

### 本地媒体

- 深度动作捕捉（VDA Small），输出比例跟随输入
- 抽帧、裁切、分离音视频、去字幕、片段重拍
- 抠图、扩图、图层分离、宫格切分、分镜拼接
- 模型和运行时按需下载，不随安装包分发

## 下载与安装

从 [GitHub Releases](https://github.com/LAUFLO/CineLab/releases/latest) 下载最新版：

| 平台 | 推荐文件 | 系统要求 |
|---|---|---|
| Windows | `CineLab-0.1.1-x64.exe` | Windows 10 / 11 x64 |
| macOS | `CineLab-0.1.1-arm64.dmg` | macOS 12+，Apple Silicon |

### Windows

- 安装包未做代码签名，SmartScreen 提示时选择「更多信息 → 仍要运行」
- 项目数据保存在你选择的项目文件夹，配置保存在 `%APPDATA%\CineLab`
- 卸载：Windows 设置 → 应用 → CineLab

### macOS

- 安装包未签名、未公证，首次打开需右键 → 打开，或在「系统设置 → 隐私与安全性」放行
- 深度捕捉、视觉增强和本地字幕组件会按平台自动下载
- macOS 首版暂不支持自动更新，需要手动下载新版本
- 配置保存在 `~/Library/Application Support/CineLab`

下载后可对照 Release 页的 `SHA256SUMS.txt` 校验安装包。

## 第一次使用

1. 打开 CineLab，在项目中心新建项目
2. 进入设置 → 模型供应商，选择预设或手动填写 Base URL / API Key
3. 回到画布，双击空白处或点击右侧 `+` 创建第一个节点
4. 需要本地字幕、深度捕捉或视觉增强时，按提示下载对应组件

## 反馈

Bug 和功能建议请提到 [GitHub Issues](https://github.com/LAUFLO/CineLab/issues)。提交前可以先搜索是否已有相同问题。

安全漏洞请不要公开提 Issue，按照 [SECURITY.md](SECURITY.md) 的方式私下报告。

## 文档

- [文档索引](docs/README.md)：现行文档、已实施方案和历史归档
- [技术架构](docs/architecture.md)：主进程架构、项目文件格式、Provider 接口、任务系统
- [模型配置](docs/models.md)：`models.json` 格式与 Provider 配置
- [界面规格](docs/ui-spec.md)：布局尺寸、节点结构、prompt bar、工具栏清单
- [CineBot 能力清单](docs/agent-capabilities.md)：当前工具、参数校验、确认规则和回合撤销
- [剪辑室](docs/clip-studio-plan.md) · [导演台](docs/director-stage-plan.md) · [逐帧拉片](docs/film-study-plan.md)

## 开发

环境要求、常用命令、项目结构、分支规范和 PR 检查见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 贡献

项目仍在快速迭代中，欢迎提 Issue 和 PR。较大的改动建议先开 Issue 对齐方案，提交前请阅读 [CONTRIBUTING.md](CONTRIBUTING.md) 和 [分支规范](docs/branch-policy.md)。

## 协议

[MIT](LICENSE)
