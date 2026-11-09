# AGENT-FAB-1 · AI 入口位置与图标

日期：2026-11-09
状态：完成
范围：底部工具栏、画布 AI 悬浮按钮、图标资源
关联：`AGENT-PROPOSAL-1`、`SKILLS-UI-1`

## 1. 改动

- 删除画布底部工具栏最右侧的机器人按钮（`.bottombar__agent`）及其样式。
- 画布右下角 AI 悬浮按钮：
  - 位置从 `right: 16px / bottom: 48px` 调整为 `right: 26px / bottom: 32px`，向下、向左移动。
  - 直径从 42px 调整为 44px。
  - 图标替换为用户提供的 `人工智能.svg`，复制为 `src/renderer/src/assets/agent-icon.svg`。
  - 使用 SVG 而不是 PNG：矢量在 44px 与高分屏下更清晰，体积也更小。
  - 按钮背景改为透明，图片圆形填满按钮，保留悬浮阴影。
  - 保留 `aria-label="打开 CineLab 助手"` 与 `Ctrl+Shift+A` 提示。

## 2. 验证

```text
画布底部工具栏：不再有 robot 按钮
.agent-fab：right=26px, bottom=32px
.agent-fab img：存在，src=data:image/svg+xml
typecheck 通过
build 通过
```

截图：`.opencode/handover/evidence/AGENT-ICON-1.png`
