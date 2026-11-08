# Prompt Bar：@ 引用、提示词持久化与工具修复

日期：2026-11-07
关联：`docs/prompt-mention-plan.md`

## 需求

1. 生成后提示词不应消失
2. AutoLink 开启后要有可见反馈
3. 输入 `@` 出现引用菜单，可引用画布连线、资产库、角色
4. 删除 Prompt Bar 的「角色」按钮
5. 画布参考提示条的「取消」按钮要能点击

## 实现

### 提示词持久化

- `CineNodeData` 与 `cineNodeSchema` 增加 `prompt?: string`
- Prompt Bar 切换节点时从 `node.data.prompt` 读取
- 输入 350ms 防抖写回节点；切换节点 / 卸载时立即写回
- 生成完成不修改 `prompt`
- 项目保存后重新打开仍能恢复

### `@` 引用菜单

- 输入 `@` 或 `@关键词` 弹出
- 分组：已引用、画布、资产库、角色
- 键盘 ↑/↓、Enter、Esc
- 选择后插入 `@名称` 并加入引用
- 输入框使用 textarea + 镜像层，`@名称` 显示为蓝色 token
- AutoLink 自动匹配的缩略图使用虚线描边，并显示 `AutoLink N`

### 删除角色按钮

- 移除 Prompt Bar 的「角色」下拉、角色选择状态和角色引用拼接
- 角色卡保留在 `@` 菜单

### 画布参考取消按钮

- pointerdown 捕获逻辑跳过 `.canvas-pick-bar`
- 取消按钮点击不再被拦截

## 实测

隔离实例 `dev:isolated`，测试项目 `mention-test.cinelab`：

- 输入 `测试提示词 @` 后菜单出现
- 分组显示「已引用」「画布」「资产库」
- 选择资产后：
  - 输入框值为 `测试提示词 @深色背景上的紫白无限循环标志 `
  - token 高亮 1 个
  - 引用缩略图 1 个
  - 显示 `AutoLink 1`
- 切换节点再切回，提示词和高亮保留
- 重新加载项目后提示词恢复
- Prompt Bar 底部按钮只剩「未配置模型」，无「角色」
- 点击「画布参考」再点「取消」：提示条消失，`is-picking` 移除
- 构造带图片输出的画布节点后，`@` 菜单出现「画布」分组

## 验证

```text
corepack pnpm typecheck  通过
corepack pnpm test       6 files / 18 tests 通过
corepack pnpm build      通过
```
