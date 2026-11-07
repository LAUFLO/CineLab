# CineLab · Boot Packet

> **下一会话优先**：AGENT-1 / P4 立项。先讨论 AGENT-1 与剪辑台、Agent 集成、智能剪辑、超分的优先级和边界，落 `docs/<feature>-plan.md` 后再实施。

## 状态

2026-11-07：工具栏占位功能批次 1-3 完成并打包。安装包 `Downloads\cinelab-02d921b`（156MB），CI 42364183939 成功；视觉组件 `vision-components-v1` 已发布（527MB）。最后代码提交 `02d921b`，handover 文档 `a256578` 本地未推送。

## Frontier

1. AGENT-1 / P4 立项讨论与方案文档
2. 整体验收与修复（安装包已就绪）
3. AGENT-1 / P4 实施（需方案确认）

## 缺口

K21 音频真实波形未测；K23 合成保存/字幕/音频对话框未人工走通；K24 多轨音轨未实现；K18 自动更新未验；K25 专用视频接口 multipart 未联调。

## 关键约定

- 大功能先落 `docs/<feature>-plan.md` 再改代码。
- 视频专用操作走 http-template + 操作模型绑定，不做 i2v 近似。
- 视觉组件复用 depth-runtime Python 环境；InSPyReNet MIT + LaMa Apache-2.0。
- 组件 zip 用 Compress-Archive；不要用 tar 生成带 `./` 的包。

## 验证

`corepack pnpm typecheck && corepack pnpm test && corepack pnpm build`
