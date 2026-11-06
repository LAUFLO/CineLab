# 项目封面：实现与验证

日期：2026-11-06
方案：`docs/project-cover-plan.md`

## 实现

| 层 | 改动 |
|---|---|
| 数据 | `ProjectMeta.cover?: string`、`RecentProject.cover?: string` |
| 主进程 | `readRecent` 检测 `cover.png`；新增读写/裁剪/删除封面 |
| IPC | `project:cover-read`、`cover-set-local`、`cover-set-asset`、`cover-remove` |
| 渲染 | 新增 `ProjectCard`，欢迎页与全部项目弹窗共用 |
| 画布选择 | 新增画布图片选择弹窗，只列项目内图片资产 |

封面文件固定为 `<project>.cinelab/cover.png`，中心裁切 1:1 后缩放到 512×512 PNG，不修改项目 `updatedAt`。

## 验证

- `pnpm typecheck` 通过
- `pnpm build` 通过
- 主进程 `setCoverFromAsset` 实测：生成 `cover.png`（55.8KB），`project.json` 写入 `cover` 字段
- 卡片封面读取/显示正常
- 「从画布选择」弹窗实测列出画布图片节点（1 张），点击后封面应用、弹窗关闭
- 欢迎页与全部项目弹窗封面统一 1:1

## 未自动化验证

- 「从本地选择」会打开系统文件对话框，无法用 CDP 自动操作；其写入路径复用已验证的 `writeProjectCover`
- 透明背景封面在深色卡片上的对比度取决于素材本身

## 备注

- 旧项目无 `cover.png` 时自动回退文件夹占位
- 封面读写失败不阻塞项目列表
