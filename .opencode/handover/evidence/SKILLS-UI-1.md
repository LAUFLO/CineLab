# SKILLS-UI-1 · 技能管理 UI

日期：2026-11-09
状态：完成
范围：三级技能列表、覆盖配置、创建/编辑/删除、启用/禁用、文件浏览、设置页
关联：`AGENT-SKILLS-1`、`docs/agent-architecture-plan.md`

## 1. 目标

让用户不直接编辑文件也能管理内置 / 全局 / 项目三级技能：

- 查看技能列表与来源
- 查看 `SKILL.md`、references、assets
- 创建、编辑、删除全局或项目技能
- 启用/禁用技能
- 禁止/允许模型自动调用技能
- 打开技能目录或文件

## 2. 主进程

### 2.1 覆盖配置

新增 `src/main/agent/skills-config.ts`：

- 全局配置：`<userData>/skills-config.json`
- 项目配置：`<project>/.cinelab/skills-config.json`
- key：`scope:name`
- 字段：`enabled`、`disableModelInvocation`
- 项目配置覆盖全局配置。
- 禁用高层同名技能时，会遮蔽低层同名技能，避免意外回退到内置版本。

### 2.2 技能扫描

`src/main/agent/skills.ts`：

- `listSkills` 应用覆盖配置：
  - `enabled === false` 的技能不出现在 Agent 列表中。
  - `disableModelInvocation` 覆盖 frontmatter。
- 保留 `project > global > builtin` 优先级。
- 导出路径与 manifest 读取函数供管理 API 使用。
- 未打开项目时只扫描内置和全局技能。

### 2.3 管理 API

新增 `src/main/agent/skills-admin.ts`：

| 功能 | 说明 |
|---|---|
| `listSkillAdmin` | 返回三级技能，含 `enabled`、`editable`、`shadowedBy` |
| `readSkillFile` | 读取 SKILL.md / references / assets；SKILL.md 返回正文 |
| `listSkillFiles` | 递归列出技能文件，上限 200 |
| `createSkill` | 创建全局/项目技能，自动建 references/assets |
| `saveSkill` | 更新 SKILL.md 描述、版本、正文 |
| `deleteSkill` | 删除全局/项目技能与覆盖配置 |
| `setSkillOverride` | 启用/禁用、禁止模型调用 |
| `skillDirectoryFor` / `skillFileFor` | 打开目录/文件 |

安全：

- 名称必须匹配 `SKILL_NAME_PATTERN`。
- 内置技能只读。
- 文件路径只允许 SKILL.md、references/、assets/。
- realpath 校验，阻止路径穿越与符号链接逃逸。
- 文本文件大小限制 2MB，SKILL.md 256KB。

### 2.4 IPC

新增 `skills:*`：

```text
skills:list / files / read-file
skills:create / save / remove
skills:set-override
skills:open-directory / open-file
```

`preload` 暴露 `window.api.skills`。

## 3. 设置页

新增「技能」分区：

- 左侧按内置 / 全局 / 项目分组。
- 显示启用状态、被更高作用域覆盖的标记。
- 每个作用域可打开目录。
- 右侧详情：
  - 作用域、版本、只读/覆盖标记。
  - 启用、禁止模型自动调用开关。
  - 描述、版本、SKILL.md 正文编辑与保存。
  - 内置技能只读提示。
  - 文件列表、文本预览、用系统打开。
  - 两步确认删除。
- 顶部「新建技能」：
  - 作用域（全局/项目）
  - 名称、版本、描述、正文
  - 项目作用域在未打开项目时禁用。

## 4. 验证

### 4.1 自动化

```text
34 test files, 242 tests passed
typecheck 通过
build 通过
```

新增 `src/main/agent/__tests__/skills-admin.test.ts`：

- 三级技能列表与可编辑状态。
- 覆盖配置控制 enabled / disableModelInvocation。
- 同名技能遮蔽标记。
- 创建、读取、保存、文件列表、删除。
- 删除后读取报错。

### 4.2 真实 UI

```text
设置 → 技能
→ 内置 1：canvas-basics
→ 项目 2：test-director、ui-test-skill

选中 test-director
→ 描述、正文、文件列表正常加载

新建 ui-test-skill（项目）
→ 列表出现，SKILL.md / references / assets 自动创建

编辑描述与正文 → 保存
→ SKILL.md 内容更新

切换「禁止模型自动调用」
→ .cinelab/skills-config.json 写入 project:ui-test-skill
切换「启用」→ 列表状态更新，再恢复

新增 references/notes.md
→ 重新选中技能后文件列表出现
→ 点击预览正文

删除 ui-test-skill
→ 两次确认
→ 列表恢复为 canvas-basics / test-director
→ 目录已删除
```

截图：`.opencode/handover/evidence/SKILLS-UI-1.png`

## 5. 已知限制

- 内置技能只读，需要修改时新建同名全局/项目技能覆盖。
- UI 暂不支持新建/删除 references/assets 文件，只能查看和用系统打开。
- 不支持拖拽上传技能文件。
- 覆盖状态存本机/项目配置，不写入 SKILL.md frontmatter。
- 编辑保存会重建标准 frontmatter，未知自定义字段会被丢弃。

## 6. 下一步

1. 删除 / 批量操作二次确认。
2. 剪辑高级工具：自动字幕、删静音、转场、导出。
3. 技能文件上传与覆盖快捷操作。
4. 整体验收；推送前同步 origin/main。
