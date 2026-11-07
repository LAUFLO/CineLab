# 打包：提示词持久化与 @ 引用（2026-11-07）

## 范围

- 提示词按节点保存到 `node.data.prompt`，生成、切换节点、重开项目都保留
- `@` 引用菜单：已引用 / 画布 / 资产库 / 角色，支持过滤与键盘选择
- 输入框 token 高亮
- AutoLink 显示匹配数量，自动匹配缩略图虚线描边
- 删除 Prompt Bar 的角色下拉按钮
- 修复画布参考提示条取消按钮

## 构建

- 提交：`a26157d`
- CI：https://github.com/LAUFLO/CineLab/actions/runs/42385621365
- 结果：成功（3m15s）
- 步骤：typecheck → test（18 passed）→ check:encryption → build → electron-builder → artifact

## 产物

- `CineLab Setup 0.1.0.exe`：156.40 MB
- `CineLab-0.1.0-win.zip`：199.10 MB
- 下载目录：`C:\Users\LAUFLO\Downloads\cinelab-a26157d`

## 验收重点

1. 输入提示词后切换节点再切回，文本仍在
2. 生成完成、重新打开项目后提示词恢复
3. 输入 `@` 出现分组菜单，选择后输入框出现蓝色 `@名称` token
4. 引用缩略图增加，AutoLink 显示数量
5. Prompt Bar 不再出现「角色」按钮
6. 点击「画布参考」后点顶部提示条「取消」，提示条关闭

## 测试

- 6 个测试文件 / 18 用例通过
- 隔离实例实测 @ 菜单、token 高亮、切换保留、项目重开恢复、取消按钮
