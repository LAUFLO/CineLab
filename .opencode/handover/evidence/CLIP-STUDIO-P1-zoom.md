# CLIP-STUDIO P1：缩放与横向滚动

日期：2026-11-07
状态：完成
验证：typecheck、57 个测试、build 通过；CDP 实测缩放与缩放后拖拽

## 交付

| 文件 | 内容 |
|---|---|
| `src/renderer/src/studio/TimelinePane.tsx` | 横向滚动容器、缩放按钮、Ctrl+滚轮锚点缩放、Shift+滚轮横滚 |
| `src/renderer/src/styles/studio.css` | 时间线 body 从 grid 改为 flex + scroll，轨道头固定 |

## 布局调整

```
.studio-timeline__body      flex
├── .studio-track-heads     固定 140px，不随横向滚动
└── .studio-tracks-scroll   横向滚动
    └── .studio-tracks-content  宽度 = totalMs × pxPerMs
        ├── .studio-ruler
        ├── .studio-lanes
        └── .studio-playhead
```

轨道头在滚动容器外，天然固定；标尺、轨道、播放头共享同一个 `scrollLeft`。

## 已验证

| 操作 | 实测 |
|---|---|
| 放大按钮两次 | 100% → 160% |
| 内容宽度 | 1046 → 1674px |
| 缩放锚点 | 以视口中心为锚，scrollLeft 自动调整为 313px |
| 横向滚动条 | 160% 时出现，可拖动 |
| 缩放后拖拽 | 片段 +120px，宽度不变，片段数 7 → 8，换算正确 |

## 交互

| 操作 | 行为 |
|---|---|
| 工具栏 − / ＋ | 缩放，步长 1.6，范围 50%–400% |
| `Ctrl + 滚轮` | 以鼠标位置为锚点缩放 |
| `Shift + 滚轮` | 横向滚动 |
| 底部滚动条 | 横向滚动 |

## 修复的问题

- `scrollRef` 在文档加载前不存在，`ResizeObserver` 首次运行拿不到元素，宽度一直停在 900。改为依赖 `doc?.id`，文档加载后重新观察。
- CSS 中 `.studio-track-heads` / `.studio-tracks-scroll` / `.studio-tracks-content` 曾被重复定义，已清理。

## 已知限制

- 纵向滚动未与轨道头同步，轨道多于视口时会出现错位。
- 拖拽到边缘的自动滚动未做。
- 播放时播放头自动跟随未做，留到 P2。
- 快捷键作用域、检查器联动、节点工具栏瘦身仍未做。

## 下一步

P1 剩余：快捷键作用域、检查器联动、节点工具栏瘦身。之后进入 P2 渲染。
