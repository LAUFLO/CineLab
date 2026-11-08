# 批次 3：专用视频操作验证

日期：2026-11-07
关联：`docs/placeholder-operations-plan.md`、`docs/models.md`

## 实现

- `GenerateRequest.video`：视频输入，支持项目/全局资产。
- `http-template` 新增：
  - `HttpTemplateMode = 'video'`
  - `{{video.dataUrl}}` / `{{video.base64}}` / `{{video.mime}}`
  - `submit.contentType: 'json' | 'multipart'`
  - multipart 自动把 data URL 转成文件字段
- 设置 → 操作模型：为片段重拍、元素替换、智能续写、创意片头绑定视频模型。
- 未绑定或绑定非 http-template 模型时提示去设置，不执行 i2v 近似。
- 生成的视频写入当前节点新版本，`op` 记录操作来源。

## mock 端到端

本地 mock 专用接口：

- `POST /edit` 接收 JSON，`video` 为 `data:video/mp4;base64,...`
- 返回 `{ id: 'task-1' }`
- 轮询 `GET /tasks/task-1` 返回 `{ status: 'succeeded', result: { url: ... } }`
- 应用下载结果并写入节点

实测：

```json
{
  "bytes": 8033121,
  "model": "mock-video-edit",
  "videoPrefix": "data:video/mp4;base64,AAAAIGZ0eXBpc29tAA",
  "videoBytes": 8032858
}
```

- 节点状态：`已完成 2/2`
- 无错误，操作绑定 UI 正确回显模型
- 请求体约 8MB（4 秒 720P）

## 验证命令

```text
corepack pnpm typecheck  通过
corepack pnpm test       4 files / 15 tests 通过
corepack pnpm build      通过
```

## 限制

- 当前只验证 JSON 视频 data URL；multipart 代码已实现，待真实接口联调。
- 4 秒 720P 约 8MB，更长视频需要接口支持大请求或后续预上传。
- 真正的局部重拍/元素替换质量取决于所绑定的专用 API。
