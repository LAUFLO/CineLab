# 技能导入与启用方案

日期：2026-11-22
状态：已实施
关联：[agent-architecture-plan.md](agent-architecture-plan.md)、[agent-full-scope.md](agent-full-scope.md)、[code-map/06-agent.md](code-map/06-agent.md)

## 1. 背景

设置页技能区当前默认隐藏 `canvas-basics`，提供「显示内置技能」开关；「新建技能」是内联表单。用户需要：

- 默认显示全部技能，包括内置技能；
- 删除「显示内置技能」开关；
- 把「新建技能」改为「导入技能」，支持选择文件夹或 ZIP；
- 导入前校验 `SKILL.md` 是标准技能格式；
- 技能卡片增加启用开关，只有启用的技能才能被 CineBot 引用。

## 2. 现状与复用

- 后端已有 `listSkills`，会过滤 `enabled: false`；`skill_read`、技能目录注入、Agent 面板技能选择都基于该列表。
- `listSkillAdmin` 已返回 `enabled`，`setSkillOverride` 已能写入启用状态。
- `parseSkillMarkdown` 已解析 frontmatter，`normalizeSkillPath` 已限制路径。
- `extractZipSafely` 已支持 ZIP 路径穿越、符号链接和大小限制。
- 现有 `importSkillFiles` 只负责向 `references/`、`assets/` 上传单文件，不导入整个技能。

## 3. 规则

### 3.1 显示与启用

- 内置、全局、项目技能全部默认显示。
- 每张卡片提供「启用」开关；关闭后：
  - 设置页保留卡片并显示「已禁用」；
  - CineBot 技能目录、`skill_list`、`skill_read` 和 Agent 面板技能选择都不再出现；
  - 再次开启后恢复。
- 被同名高优先级技能覆盖时，卡片继续显示覆盖提示；开关只控制该作用域自身状态。

### 3.2 导入

- 入口：设置 → 技能 → 导入技能。
- 来源：文件夹或 ZIP；一次只导入一个技能。
- 目标作用域：全局或项目；未打开项目时不能选项目。
- 根目录或唯一一层包装目录中必须存在 `SKILL.md`。
- 预览展示 name、description、version、文件列表、总大小和同名冲突。
- 同名同作用域默认拒绝；勾选「覆盖同名技能」后才替换。
- 导入完成后默认启用。

### 3.3 格式校验

- `SKILL.md` 为 UTF-8，最大 256KB。
- frontmatter 以 `---` 开始，包含合法 `name` 和 `description`。
- `name` 符合 `^[a-z][a-zA-Z0-9-]{0,63}$`。
- `description` 非空、不换行、最多 500 字。
- 正文不能为空。
- 允许 `SKILL.md`、`references/**`、`assets/**`。
- 忽略 `.DS_Store`、`Thumbs.db`、`__MACOSX`、`.git` 等系统垃圾。
- 当前版本不执行 `scripts/`；检测到 `scripts/` 或其他未知目录时明确拒绝。
- 最多 200 个文件、总计 50MB、单文件 20MB。
- 拒绝绝对路径、`..`、符号链接、控制字符和 Windows 保留文件名。

### 3.4 安装

- 主进程先把来源复制/解压到临时目录并校验。
- 预览返回一次性 token；安装必须使用该 token。
- 安装写入暂存目录，必要时备份旧技能，再原子替换；失败回滚。
- 取消、安装成功或应用下次启动时清理临时目录。

## 4. 改动点

| 文件 | 改动 |
|---|---|
| `src/shared/skills.ts` | 导入类型、限制常量、带错误信息的 SKILL.md 校验；移除默认隐藏内置技能 |
| `src/shared/ipc-contract.ts` | `SkillsApi` 增加导入接口 |
| `src/preload/index.ts` | 暴露导入接口 |
| `src/main/agent/skills-import.ts`（新） | 来源检查、格式校验、文件收集、冲突检测、原子安装、临时目录清理 |
| `src/main/ipc/skills.ts` | 原生文件夹/ZIP 选择与导入 IPC |
| `src/renderer/src/panels/SkillsSection.tsx` | 全部显示、移除显示开关、移除内联新建、卡片启用开关 |
| `src/renderer/src/panels/skills/SkillImportDialog.tsx`（新） | 导入弹窗与预览 |
| `src/shared/__tests__/skills.test.ts` | 更新格式校验测试 |
| `src/main/agent/__tests__/skills-import.test.ts`（新） | 文件夹/ZIP 导入、格式、安全、覆盖、清理 |

## 5. 验收

- 技能页默认显示 `canvas-basics`，无「显示内置技能」开关。
- 卡片开关关闭后，Agent 面板和 CineBot 工具都不再出现该技能；开启后恢复。
- 导入合法文件夹、ZIP（含单层包装目录）成功。
- 缺失/非法 `SKILL.md`、空正文、`scripts/`、路径穿越、符号链接、超大文件被拒绝并显示具体错误。
- 同名同作用域必须确认覆盖；导入后立即可用。
- `typecheck`、`test`、`check:ui`、`check:docs`、`build` 通过。

## 6. 验收记录

- `corepack pnpm typecheck`：通过。
- `corepack pnpm test`：101 个文件、713 个用例通过。
- `corepack pnpm check:ui`：96 个业务 tsx，无违规。
- `corepack pnpm check:docs`：路径、数字、链接、代码地图与模型 Skill 一致。
- `corepack pnpm build`：主进程、preload、渲染进程构建通过。
- 隔离实例手工验证：
  - 技能页默认显示 `canvas-basics`，无「显示内置技能」开关。
  - 卡片开关关闭后 CineBot 技能选择显示「没有可用技能」，重新开启恢复。
  - 文件夹导入 `demo-import` 成功，预览显示 3 个文件，安装后可打开 SKILL.md。
  - ZIP 导入 `zip-import` 成功，支持单层包装目录与 `__MACOSX` 垃圾过滤。
  - 同名再次导入显示覆盖警告，未勾选「覆盖同名技能」时导入按钮禁用；勾选后覆盖成功。
  - 导入后技能默认启用并出现在 CineBot 技能选择中。

