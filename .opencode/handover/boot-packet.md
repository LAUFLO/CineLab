# CineLab · Boot Packet

> **下一会话优先**：整体打包与验收。批次 1-3 已完成，等待安装新包后完整验收并修 bug。

## 状态

2026-11-07：工具栏占位功能批次 1-3 完成；视觉组件 `vision-components-v1` 已发布（InSPyReNet MIT + LaMa Apache-2.0，527MB）。最后提交 `6dac740`，工作区干净。

## Frontier

1. 整体打包与验收
2. AGENT-1（明确延后）
3. P4 大功能（待单独立项）

## 缺口

K21 音频真实波形未测；K23 合成保存/字幕/音频对话框未人工走通；K24 多轨音轨未实现；K18 自动更新未验；K25 专用视频接口 multipart 未与真实 API 联调。

## 约定

models.json 唯一清单；请求头支持 `${ENV}`；参数合并为生成设置面板；派生操作先建 running 占位节点；资产标签存 `.tags.json`；视频合成 720/1080 + SRT + BGM；视频专用操作走 HTTP 模板 + 操作模型绑定，不做 i2v 近似。

## 验证

`corepack pnpm typecheck && corepack pnpm test && corepack pnpm build`
