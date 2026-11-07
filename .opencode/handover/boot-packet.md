# CineLab · Boot Packet

> **下一会话优先**：P1-1 模型配置引导。做空配置入口、常见 Provider 预设、测试连接，让新用户从欢迎页走到首次成功生成。

## 状态

2026-11-07：runtime 已发布可下载；深度内存、media probe、抽帧、下拉框、占位节点、音频节点完成。已推送 4 个提交；`c9f9d9f` 音频样式未推送；用户安装包为 `9c35245`。

## Frontier

1. P1-1 模型配置引导
2. DEPTH-CAPTURE-1 验收
3. AGENT-1（延后）

## 缺口

K20 深度/占位节点未打包验收；K21 音频真实波形未测；K22 未推送；K18 更新未验。

## 约定

models.json 唯一清单；下拉用 Select；派生操作先建 running 占位节点并连线；深度 fast/long 238、standard 280；节点 360/480/240/480。

## 验证

`corepack pnpm typecheck && corepack pnpm build`
