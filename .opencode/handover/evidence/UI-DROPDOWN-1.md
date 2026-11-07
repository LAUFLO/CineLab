# 下拉框样式统一

日期：2026-11-07

## 问题

6 处原生 `<select>` 的展开列表使用系统白底蓝高亮，与应用深色主题不一致：

- `SettingsPanel.tsx` 供应商类型
- `TemplateDialog.tsx` 适用节点
- `DepthCaptureDialog.tsx` 档位、帧率
- `AiOperationDialog.tsx` 使用模型
- `SphereDialog.tsx` 使用模型

## 方案

新增 `src/renderer/src/components/Select.tsx`：

- 触发器 + portal 浮层（`position: fixed`，避免被对话框裁剪）
- 菜单样式复用应用菜单体系：`--surface` / `--border` / `--shadow-menu` / `menu-in`
- 自动上下翻转、Esc 关闭、外部点击关闭、滚动/resize 重新定位
- 支持 disabled、长文本 ellipsis、选中高亮

样式添加在 `global.css` 的 `.app-select` 系列，删除旧的 `.library-select` 和 `operation-dialog__field select` 规则。

## 替换

| 文件 | 下拉 |
|---|---|
| `SettingsPanel.tsx` | 类型 |
| `TemplateDialog.tsx` | 适用节点 |
| `DepthCaptureDialog.tsx` | 档位、帧率 |
| `AiOperationDialog.tsx` | 使用模型 |
| `SphereDialog.tsx` | 使用模型 |

提交：`9c35245 feat: unify dropdowns and show pending derived nodes`

## 验证

- `typecheck` / `build` 通过
- 独立实例打开模板对话框并展开「适用节点」，截图确认：深色菜单、圆角、选中项高亮，无原生白底蓝高亮
