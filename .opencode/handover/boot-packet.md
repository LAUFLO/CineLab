# CineLab · Boot Packet

> **下一会话优先**：整体验收与修复。剪辑台由其他会话开发中；导演台作为待调研大需求，先看 `docs/director-stage-plan.md`。

## 状态

2026-11-07：K9/K11/K24 已完成并打包（`144ac61`，CI 42368040739，安装包 156MB）。K2 文本流式按用户要求移除；K5/AGENT-1 后续讨论。新增待调研大需求「导演台」。

## Frontier

1. 整体验收与修复
2. 导演台调研与方案确认
3. 剪辑台（其他会话开发中，等待接入）
4. K5 / Agent 后续单独讨论
5. P4 大功能立项（智能剪辑 / 超分等）

## 缺口

K5 / AGENT-1 未实施；K10 旧库迁移暂不处理；K22 已过时；K25 专用视频 multipart 未联调；K18 自动更新未验；K21 音频波形未实测；K23 合成对话框未人工走通。

## 导演台

参考 LibTV 3D 导演台/3D-BOX、TapNow CineMap：轻量 3D 构图节点，素模/道具/多机位/截图回传/全景背景。方案：`docs/director-stage-plan.md`。待调研，不进入当前实现。

## 关键约定

- 剪辑台由其他会话负责，当前会话不要改相关文件。
- 文本节点不做流式/多轮，Agent 阶段再做。
- 项目导出先 staging 复制全局资产并改写路径。
- 资产缩略图缓存到库根 `.thumbs/`。
- 视频多轨音频三路独立 volume 后 amix。

## 验证

`corepack pnpm typecheck && corepack pnpm test && corepack pnpm build`
