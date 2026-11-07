# CineLab · Boot Packet

> **下一会话优先**：P3-2 项目模板。新建项目可选空白 / 分镜 / 产品广告 / 角色短片，模板包含画布结构与提示词节点。

## 状态

2026-11-07：P1-1、P1-2、P2-1、P2-2 完成；模型自定义请求头、参数编辑器、合并生成设置面板完成。本地提交领先远端多个，尚未打包。最后提交 `f6debd8`。

## Frontier

1. P3-2 项目模板
2. P3-3 资产库与导出增强
3. AGENT-1（延后）

## 缺口

K21 音频真实波形未测；K22 未推送未打包；K18 自动更新未验；P3-2/P3-3 未开始。

## 约定

models.json 唯一清单；请求头支持 `${ENV}`；参数合并为生成设置面板；派生操作先建 running 占位节点；深度 fast/long 238、standard 280。

## 验证

`corepack pnpm typecheck && corepack pnpm test && corepack pnpm build`
