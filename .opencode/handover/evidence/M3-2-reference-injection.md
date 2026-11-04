# M3-2 首尾帧素材注入验证

- 日期：2026-11-04
- 方式：mock 火山任务接口 + CDP 拖拽连线 + 查询 mock 收到的请求体

## 收集规则

从指向当前节点的边按顺序收集上游输出：

| 序号 | 角色 | 注入字段 |
|---|---|---|
| 第 1 张图片 | 首帧 | `role: "first_frame"` |
| 第 2 张图片 | 尾帧 | `role: "last_frame"` |
| 第 3 张起 | 参考 | `role: "reference"` |

最多 4 张，只取 image 类型的输出。

## 注入格式

主进程把项目内图片读成 data URL，拼进火山方舟的 `content`：

```json
{
  "model": "doubao-seedance-2-5-260628",
  "content": [
    { "type": "text", "text": "..." },
    {
      "type": "image_url",
      "image_url": { "url": "data:image/png;base64,..." },
      "role": "first_frame"
    }
  ],
  "resolution": "720p",
  "ratio": "16:9",
  "duration": 5
}
```

## 验证结果

| 项 | 结果 |
|---|---|
| 图片节点 → 视频节点拖拽连线 | 通过 |
| prompt bar 素材计数 | 通过，显示「素材 1」 |
| 请求体包含 image_url | 通过 |
| role 映射 | 通过，`first_frame` |
| data URL 前缀 | 通过，`data:image/png;base64,` |

## 未验证

- 尾帧（第二条连线）的端到端验证。映射逻辑与首帧相同（`imageIndex === 1 → last_frame`）。
- 三张以上参考图的注入。
- 图片节点作为「图生图」的素材输入（当前仅视频链路使用 refs）。
