# M3-1 视频生成链路验证

- 日期：2026-11-04
- 方式：mock 火山方舟任务接口 + CDP 操作 + DOM/文件核对

## 适配器

`src/main/providers/volcengine.ts`

```
POST {baseUrl}/contents/generations/tasks   提交任务
GET  {baseUrl}/contents/generations/tasks/{id}  轮询
```

- 鉴权：Bearer API Key
- 轮询间隔 5s，最长 180 次（15 分钟）
- 状态：queued / running / succeeded / failed / cancelled
- 成功后下载 `content.video_url` 并落盘

## 验证结果

| 项 | 结果 |
|---|---|
| 创建视频节点 | 通过 |
| 模型列表按节点类型过滤 | 通过，视频节点只显示 Seedance |
| 提交任务 | 通过，返回 task id |
| 轮询 running → succeeded | 通过，2 次轮询 |
| 下载并落盘 | 通过，`assets/vid/3bb938fb….mp4`，788 KB |
| 节点渲染 video | 通过，`readyState=4`、时长 10s、320×176 |

## 修复的关键问题

**自定义协议不支持 Range 请求**，导致 `<video>` 报 `MEDIA_ERR_SRC_NOT_SUPPORTED`。
在 `src/main/protocol.ts` 中补了 `Range` 解析，返回 206 + `Content-Range`，并加 `Accept-Ranges: bytes`。

## 已知限制

- 视频与图片共用同一个 Provider 配置时 Base URL 冲突，实际使用时建议分别建立「OpenAI 兼容（图片）」和「火山方舟（视频）」两个供应商。
- 可灵（Kling）需要 AccessKey/SecretKey 生成 JWT，尚未接入。
- 首尾帧素材注入未实现（M3-2）。
