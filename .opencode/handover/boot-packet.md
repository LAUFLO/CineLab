# CineLab · Boot Packet

> **下一会话**：runtime CI 构建发布。仿 BeefTV 用 GitHub Actions 构建 Windows CPU runtime（固定 Python/torch/VDA），产出 zip + manifest 发 Release；模型走官方 HF。之后验证组件下载与 DEPTH-CAPTURE-1。

## 状态

M7 完成；P0-1/P0-3 已提交。未提交：节点尺寸、自动成组、对齐、视频预览、模型源、窗口/工具栏；media 改动属另一路。

## Frontier

1. RUNTIME-COMPONENTS-1
2. DEPTH-CAPTURE-1 验收
3. 提交工作区
4. AGENT-1

## 缺口

runtime Release 404；真实 Key/i2i、自动更新安装未验；旧宫格组不重排。

## 约定

models.json 唯一清单 + settings.json 密钥；节点 360/480/240/480；派生多节点自动成组；对齐只同边/中心。

## 验证

`corepack pnpm typecheck && corepack pnpm build`
