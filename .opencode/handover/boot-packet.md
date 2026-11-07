# CineLab · Boot Packet

> **下一会话优先**：整体验收与打包。先 typecheck / test / build，再推送 main 触发 build-win，安装后完整验收 P3-2、P3-3 与既有功能。

## 状态

2026-11-07：清单 P1-P3 开发完成。模型引导、错误反馈、请求头、参数面板、测试、日志、项目模板、资产批量/标签、视频合成（字幕/BGM）均已实现并本地提交；未推送、未打包。最后提交 `3ce9996`。

## Frontier

1. 整体验收与打包
2. AGENT-1（明确延后）
3. P4 大功能（待单独立项）

## 缺口

K21 音频真实波形未测；K22 未推送未打包；K18 自动更新未验；K23 合成对话框未人工走通；K24 多轨音轨未实现。

## 约定

models.json 唯一清单；请求头支持 `${ENV}`；参数合并为生成设置面板；派生操作先建 running 占位节点；资产标签存 `.tags.json`；视频合成 720/1080 + SRT + BGM。

## 验证

`corepack pnpm typecheck && corepack pnpm test && corepack pnpm build`
