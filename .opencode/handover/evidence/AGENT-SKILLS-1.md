# AGENT-SKILLS-1 · 技能目录骨架

日期：2026-11-08
状态：完成
范围：三级技能目录、SKILL.md 解析、skill.list / skill.read、主进程技能工具
关联：`docs/agent-full-scope.md` E 域、`docs/agent-architecture-plan.md` 第 8 章

## 1. 目标

让 Agent 能读取内置、全局和项目技能，并支持用户自己的 `SKILL.md`。

- 三级目录：内置 / 全局 / 项目
- 解析 frontmatter：`name`、`description`、`version`、`disableModelInvocation`
- 工具：`skill_list`、`skill_read`
- 项目技能覆盖全局，全局覆盖内置
- 路径穿越、绝对路径、符号链接逃逸和大小限制

## 2. 实现

### 2.1 目录

| 作用域 | 路径 |
|---|---|
| 内置 | 开发：`resources/skills`；打包：`process.resourcesPath/skills` |
| 全局 | `<userData>/skills` |
| 项目 | `<project>/.cinelab/skills` |

`electron-builder.yml` 已增加：

```yaml
extraResources:
  - from: resources/skills
    to: skills
```

### 2.2 SKILL.md 解析

新增 `src/shared/skills.ts`：

- 轻量 frontmatter 解析，不引入 YAML 依赖
- 名称规则：`^[a-z][a-zA-Z0-9-]{0,63}$`
- 描述最长 500 字符
- `disableModelInvocation` 支持 true/false
- `normalizeSkillPath()`：只允许 `SKILL.md`、`references/`、`assets/`，拒绝 `..`、绝对路径、盘符、反斜杠逃逸

### 2.3 主进程技能服务

新增 `src/main/agent/skills.ts`：

- `listSkills(root)`：扫描三级目录，同名按 project > global > builtin 覆盖
- `readSkill({ root, name, path, offset, limit })`：
  - 校验路径和 realpath，拒绝符号链接逃逸
  - 单文件大小限制：SKILL.md 256KB，references/assets 2MB
  - 返回正文分页，默认 8000 字符，最大 20000
- `skillCatalogPrompt(root)`：把技能目录注入系统提示，只给名称、作用域和描述

### 2.4 工具

`src/shared/agent-tools.ts` 增加 `executor: 'main' | 'renderer'`。

`src/main/agent/tools.ts` 增加：

| 工具 | 执行位置 | 说明 |
|---|---|---|
| `skill_list` | 主进程 | 列出可用技能 |
| `skill_read` | 主进程 | 读取技能正文或 references |

`src/main/agent/main-tools.ts` 执行主进程工具，`runtime.ts` 根据 `executor` 分流，不再需要渲染进程回传。

`disableModelInvocation: true` 的技能不能由模型直接读取，只能等后续用户显式选择。

## 3. 验证

### 3.1 单元测试

- `src/shared/__tests__/skills.test.ts`
  - 有效 frontmatter
  - 缺少字段/非法名称拒绝
  - 引号值处理
  - 路径允许 `SKILL.md` / `references/` / `assets/`
  - 路径拒绝 `../`、绝对路径、盘符、`scripts/`

结果：

```text
26 test files, 153 tests passed
```

### 3.2 端到端

创建项目技能：

```text
<project>/.cinelab/skills/test-director/SKILL.md
```

真实 Agnes 3.0 Flash：

```text
用户：列出当前可用技能，并读取 test-director 的正文
→ skill_list
   canvas-basics（builtin）
   test-director（project）
→ skill_read（name=test-director，path=SKILL.md）
→ 助手正确总结项目技能的三条要求
```

工具卡均显示完成，技能正文按需读取，没有整包注入。

### 3.3 构建

- `corepack pnpm typecheck` 通过
- `corepack pnpm test` 通过
- `corepack pnpm build` 通过
- 主进程产物约 407KB

## 4. 已知限制

- 没有技能管理 UI（新建、导入、启用/禁用、版本切换）。
- 没有用户显式选择技能的会话状态，`disableModelInvocation` 目前直接拒绝模型读取。
- 没有技能脚本执行。
- 没有技能导入 ZIP/文件夹。
- 全局技能目录只做了代码路径，未单独走一遍 UI 验证。

## 5. 下一步

1. 开放更多画布工具：建节点、连线、删除、分组。
2. `StageCommand` 骨架。
3. 生成提案 `propose/submit`。
4. 技能管理 UI 与用户显式选择。
