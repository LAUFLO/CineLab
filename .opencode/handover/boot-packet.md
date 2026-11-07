# CineLab · Boot Packet

> **下一会话优先**：整体验收与修复。安装 `2deea46` 包后完整使用，收集问题并逐项修复。

## 状态

2026-11-07：P1-P3 全部完成并打包。CI 42348036406 成功（typecheck/test/build），安装包在 `Downloads\cinelab-2deea46`（162MB）。工作区干净。

## Frontier

1. 整体验收与修复
2. AGENT-1（明确延后）
3. P4 大功能（待单独立项）

## 缺口

K21 音频真实波形未测；K23 合成保存/字幕/音频对话框未人工走通；K24 多轨音轨未实现；K18 自动更新未验。

## 约定

models.json 唯一清单；请求头支持 `${ENV}`；参数合并为生成设置面板；派生操作先建 running 占位节点；资产标签存 `.tags.json`；视频合成 720/1080 + SRT + BGM。

## 验证

`corepack pnpm typecheck && corepack pnpm test && corepack pnpm build`
