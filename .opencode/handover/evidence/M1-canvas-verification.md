# M1 画布核心验证记录

- 日期：2026-11-04
- 方式：Chrome DevTools Protocol（127.0.0.1:9222）+ DOM / Zustand store 查询
- 工具：`scripts/cdp-shot.mjs`、`scripts/cdp-eval.mjs`、`scripts/cdp-drag.mjs`

## 已验证

| 项 | 结果 |
|---|---|
| 双击画布空白 → 添加节点菜单 | 通过，菜单位置等于双击点 |
| 点击空状态按钮 → 创建图片节点 + prompt bar | 通过 |
| 悬停节点 → 左右 `+` 淡入 | 通过 |
| 右侧 `+` 拖到空白 → 菜单在落点弹出 | 通过（Input.dispatchMouseEvent 模拟） |
| 菜单选文本 → 创建节点 + 自动连线 | 通过，store 中确认 `image_1 → text_1` |
| 刷新页面 → 节点与连线保留 | 通过（localStorage `cinelab.canvas.v1`） |
| 左侧 `+` 圆心偏移 | 0px |
| 右侧 `+` 圆心偏移 | 0px |
| 左侧 handle 不触发建节点菜单 | 通过（未绑定 onClick + onConnectEnd 拦截 target） |

## 未覆盖 / 待人工确认

- 从右侧拖线到已有节点时的吸附高亮视觉（逻辑已开 `connectionMode=loose` + `connectionRadius=60`）。
- 缩放后 prompt bar 与节点的间距（公式已改为乘 `viewport.zoom`，需人工在 40% / 200% 下确认）。
- 深色模式下节点与连线的完整视觉走查。
