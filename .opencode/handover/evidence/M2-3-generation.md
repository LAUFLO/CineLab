# M2-3 真实出图链路验证

- 日期：2026-11-04
- 方式：本地 mock OpenAI 服务 + CDP 操作 UI + 文件/DOM 核对

## 验证链路

```
prompt bar 输入提示词
  → renderer 调用 generate:run
  → 主进程按 modelKey 解析 provider 与模型
  → safeStorage 解密 Key
  → 队列调度
  → POST {baseUrl}/images/generations
  → 解析 b64_json / url
  → sha256 去重写入 assets/img/
  → nativeImage 生成 assets/thumb/ 缩略图
  → IPC 事件回推 done + assets
  → 节点显示图片，状态「已完成」
  → 自动保存写入 canvas-*.json
```

## 验证结果

| 项 | 结果 |
|---|---|
| mock 服务（GET /v1/models） | 通过 |
| 生成请求（POST /v1/images/generations） | 通过，1.4s 延迟 |
| 图片落盘 | 通过，`assets/img/c2e00720…png`，66 KB |
| 缩略图 | 通过，`assets/thumb/c2e00720….png`，2.2 KB |
| 节点状态 | 通过，`status=done`、`outputs=1` |
| 图片渲染 | 通过，`naturalWidth=640`、`naturalHeight=640` |
| 自动保存 | 通过，canvas 文件记录 outputs 与相对路径 |

## 修复的两个问题

1. **CSP 拦截自定义协议**：`img-src` 缺少 `cinelab-asset:`，图片请求被拒绝。已在 `index.html` 补上。
2. **`net.fetch(file://)` 不可靠**：改为 `fs.readFile` 直接返回 `Response`，并补 Content-Type。

## 未验证

- 真实 OpenAI / 中转站接口（需要有效 Key，mock 只验证协议与流程）
- 多图返回（n > 1）
- 网络失败重试与超时提示
