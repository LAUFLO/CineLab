# SKILLS-FILES-1 · 技能文件上传、删除与同名覆盖

日期：2026-11-10
状态：完成
范围：技能 references/assets 文件上传、覆盖、删除；同名技能快速创建覆盖；Agent 技能弹窗管理入口
关联：`SKILLS-UI-1`

## 1. 目标

补齐技能管理的文件操作和覆盖快捷入口：

- 给全局/项目技能上传 `references/` 与 `assets/` 文件。
- 同名文件上传时覆盖旧文件，并提示覆盖数量。
- 删除技能内的参考/资产文件。
- 从内置/全局技能一键创建项目或全局同名覆盖，连同文件一起复制。
- 从 CineBot 技能弹窗直接进入技能管理。

## 2. 主进程

### 2.1 上传

`importSkillFiles(root, { scope, name, folder, files })`：

- 只允许可编辑作用域（global/project）。
- `folder` 只能是 `references` 或 `assets`。
- 单次最多 20 个文件；单文件最大 20MB，单次总大小最大 100MB。
- 文件名只取 basename，拒绝路径分隔符、控制字符和 `..`。
- 同名文件直接覆盖，返回 `uploaded` / `overwritten` 列表和最新文件列表。
- 上传通过系统原生多选对话框完成。

### 2.2 删除

`removeSkillFile(root, { scope, name, path })`：

- 只允许删除 `references/` 或 `assets/` 下的文件。
- 不允许删除 `SKILL.md`。
- 路径经过 `normalizeSkillPath` 和 `isWithin` 越界校验。
- 返回最新文件列表。

### 2.3 同名覆盖

`cloneSkill(root, { sourceScope, sourceName, targetScope })`：

- target 只能是 global/project。
- 源技能必须存在；目标作用域不能已有同名技能。
- 使用 `fs.cp` 递归复制 `SKILL.md`、`references/`、`assets/`。
- 清除目标作用域旧的覆盖配置，确保新技能默认启用。
- 返回目标作用域的技能条目。

### 2.4 IPC

新增：

- `skills:upload-files`
- `skills:remove-file`
- `skills:clone`

`skills:upload-files` 在主进程打开 `dialog.showOpenDialog`，取消时返回 `null`。

## 3. 界面

### 3.1 技能设置

- 文件区标题右侧新增 `references` / `assets` 上传按钮。
- 文件行改为「打开文件 + 删除按钮」结构。
- 只有可编辑技能显示上传和删除。
- `SKILL.md` 不显示删除按钮。
- 删除文件使用通用确认对话框。

### 3.2 覆盖快捷操作

技能详情操作区新增：

- `创建项目覆盖`：内置或全局技能 → 当前项目同名技能。
- `创建全局覆盖`：内置技能 → 全局同名技能。
- 已存在同名目标技能时隐藏对应按钮。
- 未打开项目时禁用项目覆盖。

### 3.3 Agent 技能弹窗

技能选择浮窗底部新增「管理技能」，点击关闭浮窗并打开设置 → 技能。

## 4. 验证

### 4.1 自动化

```text
37 test files, 260 tests passed
typecheck 通过
build 通过，主进程约 532KB
```

新增测试：

- 上传两个文件到 references。
- 同名文件再次上传，覆盖并写入新内容。
- 删除 references 文件。
- 从内置技能克隆到项目，references 文件一起复制。
- 重复克隆同名目标技能报错。

### 4.2 真实 UI（隔离实例）

```text
设置 → 技能 → canvas-basics（内置）
→ 操作区显示「创建项目覆盖」「创建全局覆盖」

点击「创建项目覆盖」
→ 技能列表出现项目作用域 canvas-basics
→ 自动选中项目技能
→ 文件区显示 references / assets 上传按钮
→ 文件列表显示 SKILL.md

手动写入 references/notes.md 后重新选中技能
→ 文件列表显示 references/notes.md
→ 只有该文件显示删除按钮，SKILL.md 不显示

点击删除 → 确认「删除技能文件」→ 文件从列表和磁盘移除

Agent 技能弹窗 → 底部「管理技能」→ 打开设置 → 技能
```

截图：

- `.opencode/handover/evidence/SKILLS-UPLOAD-1.png`

## 5. 已知限制

- 上传使用系统原生对话框，自动化测试覆盖了导入函数与 UI 按钮，未自动操作系统文件选择。
- 同名文件直接覆盖，没有逐文件二次确认；结果 toast 会显示覆盖数量。
- 单次上传最多 20 个文件，单文件 20MB，单次 100MB。
- 覆盖复制不做冲突合并；目标已有同名技能时必须先删除。
- 内置技能仍然只读，只能通过创建全局/项目覆盖修改。
- 文件预览仍受 `readSkillFile` 的 2MB 上限限制；更大的二进制资产可用系统打开。

## 6. 关键文件

- `src/shared/skills.ts`
- `src/shared/ipc-contract.ts`
- `src/main/agent/skills-admin.ts`
- `src/main/ipc/skills.ts`
- `src/preload/index.ts`
- `src/renderer/src/panels/SkillsSection.tsx`
- `src/renderer/src/agent/AgentPanel.tsx`
- `src/renderer/src/styles/skills.css`
- `src/renderer/src/styles/agent.css`
- `src/main/agent/__tests__/skills-admin.test.ts`
