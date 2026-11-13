# P2 UI 基础设施验收记录

日期：2026-11-13
状态：历史（2026-11-13 验收）
适用版本：v0.1.0
最后核对：2026-11-13

## 完成范围

- Tailwind 4 主题基础层：`styles/tailwind.css`、`styles/base.css`
- `components/ui/` primitives：
  - Button / IconButton
  - Input / Textarea
  - Select
  - Switch
  - Field / SettingRow
  - Dialog
  - Menu / MenuItem / MenuSeparator
  - Toast
- 迁移页面：
  - 设置页
  - 资产库（工具栏、卡片操作、文件夹树、命名/模板/移动/合成/标签弹窗）
  - 剪辑室（顶栏、时间线工具栏、检查器主要控件）
  - 画布节点工具栏（操作按钮与菜单项）
  - Prompt Bar（上传/模型/提及菜单、开关、发送/停止）

## CSS 清理

| 指标 | 清理前 | 清理后 |
|---|---:|---:|
| `global.css` 行数 | 8,467 | 8,070 |
| 构建后 CSS | 299.7 KB | 291.3 KB |

已删除且确认 TSX 引用为 0 的类：

- `app-select*`
- `settings-row*`、`settings-toggle*`、`settings-input`
- `confirm-overlay`、`confirm-dialog*`
- `library-modal*`、`library-textarea`、`tag-input`
- `export-toast`
- `cnode__toolbar-menu__item*`
- `promptbar__upload-item`、`promptbar__switch`
- `mention-menu__item*`

## 视觉回归

环境：生产预览构建，临时 userData，打开本地 `AgentSpike.cinelab` 测试项目（4 个节点）。

检查结果：

- 顶栏、画布、节点、连线正常
- 节点工具栏「编辑 / 剪辑室」正常显示
- Prompt Bar 上传、画布参考、模型入口、参数提示、发送按钮布局正常
- 底部工具栏、资产管理入口、CineBot 悬浮按钮正常
- 未发现删除 CSS 导致的明显布局破损

截图保存在本机临时目录，未提交到仓库，避免把测试项目画面和本地路径带入公开仓库。

## 剩余事项

- 设置页、资产库、剪辑室的组合截图复核
- 未迁移页面仍在使用的 `.btn-*`、`.studio-*` 等类保留
- 下一阶段再处理画布/时间线的动态样式与更细粒度视觉回归
