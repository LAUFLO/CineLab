# 项目与多画布管理验证

- 日期：2026-11-04
- 方式：CDP 点击 TopBar 菜单 + 检查 `project.json`

## 验证结果

| 项 | 结果 |
|---|---|
| 项目重命名 | 通过，未命名项目 → 演示项目 |
| 新建画布 | 通过，生成画布 2 并切换 |
| 画布重命名 | 通过，画布 2 → 分镜稿 |
| 画布切换 | 通过，切回画布 1 |
| 画布删除 | 通过，分镜稿删除后仅剩画布 1 |
| 项目名恢复 | 通过，演示项目 → 未命名项目 |
| 左上角菜单 | 全部项目 / 创建新项目 / 重命名项目 / 删除项目，无主页 |

## 实现要点

- `project/manager.ts` 新增 `renameProject`、`createCanvas`、`switchCanvas`、`renameCanvas`、`deleteCanvas`、`deleteProject`
- IPC / preload / `ProjectApi` 同步扩展
- `project` store 增加 `canvases` 与对应动作
- `TopBar` 重写：项目菜单、全部项目浮层、画布下拉、内联重命名
- 删除项目走主进程 `dialog.showMessageBox` 二次确认
- 修复并发保存：临时文件名加入随机后缀，避免 `.tmp` 互相覆盖

## 未验证

- 删除项目的完整确认流程（高风险，未自动触发）
- 全部项目列表目前只取最近项目，没有扫描默认目录
- 画布删除按钮的 UI 确认（API 已验证）
