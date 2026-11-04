# M2-1 项目文件夹与自动保存验证

- 日期：2026-11-04
- 方式：实际运行 + Chrome DevTools Protocol 查询 + 文件内容核对

## 项目路径

`C:\Users\Administrator\Documents\CineLab\未命名项目.cinelab`

## 实际生成的结构

```
未命名项目.cinelab/
├─ project.json          schemaVersion 1，canvases 数组，activeCanvasId
├─ canvas-4db3246f.json  视口、nodes、edges
├─ assets/img/
├─ assets/vid/
├─ assets/aud/
├─ assets/thumb/
└─ exports/
```

## 验证结果

| 项 | 结果 |
|---|---|
| 首次启动自动创建项目 | 通过，bootstrap 在文档目录创建 `.cinelab` |
| 创建节点后自动保存 | 通过，点击生成图片节点 2 秒后文件内 `nodes=1` |
| 页面刷新后恢复 | 通过，`reload` 后 DOM 节点数为 1，项目名恢复「未命名项目」 |
| 顶栏保存状态 | 通过，显示「已自动保存」 |
| 项目名显示 | 通过，从 `project.json` 读取 |

## 修复的问题

React StrictMode 会双执行 `useEffect`，导致 bootstrap 并发调用创建出两个 canvas 文件。
在主进程增加 `bootstrapOnce` 互斥 Promise，第二次调用复用第一次结果。

## 待人工验证

- 顶栏项目名 → 「新建项目」保存对话框
- 「打开项目」文件夹选择对话框
- 「在文件夹中显示」是否正确打开资源管理器
