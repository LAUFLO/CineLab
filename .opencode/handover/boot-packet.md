# CineLab · Boot Packet

> **下一会话优先**：整体验收与修复。K9/K11/K24 已完成，K2 文本流式按用户要求移除，K5 后续单独讨论。

## 状态

2026-11-07：剩余本地增强完成。项目导出会打包全局资产，资产库有缩略图缓存，视频合成支持原声/BGM/旁白三路音量。文本节点保持一次性返回，不做流式/多轮；等 Agent 阶段统一实现。工作区待提交。

## Frontier

1. 整体验收与修复
2. K5 / Agent 后续单独讨论
3. P4 大功能立项（剪辑台 / Agent 集成 / 智能剪辑 / 超分）

## 缺口

K5 / AGENT-1 未实施；K10 旧库迁移暂不处理；K22 已过时；K25 专用视频 multipart 未联调；K18 自动更新未验；K21 音频波形未实测；K23 合成对话框未人工走通。

## 关键约定

- 文本节点不做流式/多轮，Agent 阶段再做。
- 项目导出先 staging 复制全局资产并改写路径。
- 资产缩略图缓存到库根 `.thumbs/`。
- 视频多轨音频三路独立 volume 后 amix。

## 验证

`corepack pnpm typecheck && corepack pnpm test && corepack pnpm build`
