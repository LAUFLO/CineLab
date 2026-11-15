# Tailwind 全量迁移方案（路线 A）

日期：2026-11-15
状态：待实施
适用版本：v0.2.0
关联：[engineering-quality-plan.md](engineering-quality-plan.md)、[p2-acceptance.md](p2-acceptance.md)、[ui-spec.md](ui-spec.md)

## 1. 背景

`engineering-quality-plan.md` 3.5 节选定「方案 B：分阶段全量迁移 Tailwind」，四阶段为：基础层 → 组件层 → 页面层 → 收尾。P2 完成了前两个阶段：

- 基础层：`tailwind.css` 用 `@theme` 映射 tokens，`base.css` 承载 base layer。
- 组件层：`components/ui` 的 8 个 primitives 用 Tailwind 实现；510 处原生控件替换为公共组件。

但页面层一直未开工。P2 的控件替换引入了 `unstyled` 逃生舱：调用方传 `unstyled` 时组件完全不应用 primitive 样式，继续吃 `global.css` 的旧类。结果是控件换了壳、样式一行没减。

2026-11-15 重新调研后的实测数据：

| 指标 | 数值 |
|---|---:|
| CSS 文件 | 8 个，14,366 行，270 KB 源码 |
| CSS 类选择器 | 1,276 个 |
| 非测试 tsx | 92 个 |
| 使用 Tailwind utility 的 tsx | 12 个（其中 8 个是 primitives） |
| 纯自定义类的 tsx | 79 个 |
| `unstyled` 调用点 | 581 处，71 个文件 |
| `inline style` | 47 处 |
| 构建后 CSS | 289 KB |
| `tokens.css` 变量 / `@theme` 映射 | 41 / 35，缺 6 个 |
| `!important` / `@media` / 嵌套 `&` | 7 / 5 / 0 |

结构上可迁移性较好：选择器全部扁平、无嵌套，React Flow 只覆盖 10 个类，主题体系已经是 Tailwind 4 期望的 CSS 变量形态。

## 2. 目标与边界

### 2.1 目标

选定 **路线 A：纯 utility 全量迁移**。除第 2.2 节白名单外，所有 UI 样式改为 Tailwind utility，语义类不再承载样式。

收尾后的目标状态：

| 文件 | 当前 | 目标 |
|---|---:|---:|
| `global.css` | 10,311 | < 1,000 |
| `agent.css` | 1,388 | 删除 |
| `studio.css` | 1,179 | 删除 |
| `stage.css` | 831 | 删除 |
| `skills.css` | 492 | 删除 |
| `tokens.css` | 97 | 保留（主题唯一色源） |
| `tailwind.css` | 53 | 保留并补齐映射 |
| `base.css` | 15 | 保留 |

### 2.2 不可迁移白名单

以下内容不进入 utility 化。这是物理边界，不是妥协：

| 项目 | 原因 | 归宿 |
|---|---|---|
| `tokens.css` 全部变量 | 明暗主题唯一色源 | 保留 |
| `::-webkit-scrollbar*` | Tailwind 无对应 utility | `global.css` 基础段 |
| `.react-flow__*` 覆盖（10 类） | 运行时注入的第三方 DOM | `global.css` 基础段 |
| 画布容器尺寸、`--grid-dot` 网格 | 依赖视口计算 | `global.css` + CSS 变量 |
| 导出画布时隐藏浮层（2 条） | 全局状态选择器 | `global.css` 基础段 |
| 动画降级 `@media`（4 条 `!important`） | 无障碍全局规则 | `global.css` 基础段 |
| 3D 视口、时间轴像素定位、波形 | 逐帧计算 | inline style + CSS 变量 |
| React Flow 节点拖拽偏移、缩放变换 | 运行时数值 | inline style |

判断标准：**样式值在编译期确定的迁 utility；值在运行期由 JS 计算或由第三方注入的留在 CSS/inline style。**

## 3. 迁移规则

### 3.1 `unstyled` 退出规则

1. 每批迁移时，同步删除该页面所有 `unstyled` 用法，改为直接传 utility 或使用 primitive 默认变体。
2. `components/ui` 保留 `unstyled` 属性作为逃生舱，但迁移完成的目录不得再出现 `unstyled`。
3. 验收用 `grep` 检查：该批涉及的目录 `unstyled` 计数必须为 0。
4. 迁移结束后再统一评估是否删除 `unstyled` 属性本身。

### 3.2 测试锚点

现有 e2e 依赖 `.promptbar`、`.library-window`、`.agent-panel`、`.react-flow`、`.project-card` 作为选择器。语义类删除后这些断言会碎。

处理方式：

1. 给上述顶层元素加 `data-testid`（`promptbar`、`library-window`、`agent-panel`、`canvas`、`project-card`）。
2. 同步修改 `e2e/app.spec.ts` 的选择器。
3. 不为测试保留任何样式类；`.react-flow` 是第三方类，保持不变。

### 3.3 `@theme` 补齐

`tokens.css` 有 41 个变量，`@theme` 映射 35 个。缺 6 个：

| 变量 | 处理 |
|---|---|
| `--media-control-bg`、`--media-control-border` | 补 `@theme` 映射 |
| `--grid-dot` | 画布专用，保留 CSS 变量，utility 用 `bg-[var(--grid-dot)]` |
| `--glow`、`--watermark`、`--edge-default` | 画布/连线专用，同上 |

新增 `@theme` 条目统一放在 `tailwind.css`，不散落到其他文件。

### 3.4 动态样式

- 运行期计算的尺寸、位置、缩放、角度：inline style，值为 `var(--token)` 或 JS 变量。
- React 条件样式：`cn()` 拼 utility，不拼语义类。
- 动画与关键帧：定义在 `tailwind.css` 的 `@theme` / `@keyframes`，组件用 `animate-*` 引用。

### 3.5 类命名

- 迁移后不再新增语义类。
- 个别必须保留的全局类集中放入 `global.css` 的「基础设施」段，并逐条注释原因。
- 组件内部状态不用修饰类（`is-*`、`--modifier`），改用 `data-*` 属性 + Tailwind 变体（`data-[state=open]:`）。

## 4. 截图基线

### 4.1 生成方式

1. `corepack pnpm dev:isolated` 启动独立实例（自动分配 CDP 端口和临时 userData）。
2. 固定窗口 1440×900，使用 `AgentSpike.cinelab` 或新建标准测试项目。
3. 对 5 个页面各截明暗两套：项目中心、画布、设置、资产库、剪辑室。
4. 保存到 `.opencode/handover/evidence/tailwind-baseline/`，命名 `<页面>-<主题>.png`。
5. 基线生成必须在代码未改动时完成，对应提交 `674d9b7`。

### 4.2 对比方式

每批迁移后按同一路径重截，人工逐页对比；差异必须能解释（刻意调整需在 PR 说明）。暂不引入像素比对工具，避免阈值误报。

### 4.3 基线清单

已采集，见 `.opencode/handover/evidence/tailwind-baseline/`，环境与局限见 `.opencode/handover/evidence/2026-11-15-tailwind-baseline.md`。

| 页面 | 浅色 | 深色 |
|---|---|---|
| 项目中心 | 已采集 | 已采集 |
| 画布 | 已采集 | 已采集 |
| 设置（通用） | 已采集 | 已采集 |
| 资产库 | 已采集 | 已采集 |
| 剪辑室 | 已采集 | 已采集 |

## 5. 分批清单

批次按「静态优先、动态靠后」排序，每批独立分支 + 独立 PR。

| 批 | 范围 | CSS 行数 | 调用点 | 级别 | 关键文件 |
|---|---|---:|---:|---|---|
| 1 | 设置 + 模型配置 + 技能 | ~2,270 | ~130 | A | `SettingsPanel`、`GeneralSettingsSection`、`ModelConfigDialog`、`SkillsSection`、`skills.css` |
| 2 | 资产库 + 项目中心 + 确认弹窗 | ~1,610 | ~60 | A | `LibraryWindow`、`AssetGrid`、`FolderTree`、`ProjectCard`、`ProjectCenter` |
| 3 | 剪辑室 | ~1,804 | ~80 | B | `InspectorPane`、`TimelinePane`、`MaterialPool`、`PreviewStage`、`studio.css` |
| 4 | Prompt Bar | ~1,073 | ~25 | B | `PromptBar`、`ModelMenu`、`ParamPanel` |
| 5 | 画布节点 + 节点工具栏 + 底栏 | ~2,600 | ~110 | C | `CineNodeView`、`NodeToolbar`、`VideoOpNodeView`、`Canvas`、`BottomBar`、`TopBar` |
| 6 | 拉片 | ~1,111 | ~55 | C | `FilmStudyRoom`、`FilmStudySheet`、`FilmStudyInsights`、`StudyNodeCard` |
| 7 | 音频条 + 文本编辑弹窗 | ~697 | ~30 | B | `AudioPlayer`、`AudioActionBar`、`TextEditorDialog` |
| 8 | 导演台 | ~894 | ~35 | C | `StageWindow`、`StageViewport`、`StageInspector`、`StageTimeline`、`stage.css` |
| 9 | CineBot | ~1,388 | ~45 | B | `AgentPanel`、`agent.css` |

说明：

- 行数为 CSS 侧估算，按 `global.css` 分段边界与独立 CSS 文件累计。
- 调用点为 `unstyled` 分布推算，执行时以 `grep` 实测为准。
- 第 5、6、8 批属于 C 级：只迁移静态外壳（面板、按钮、标签、空状态），拖拽、缩放、像素定位保留 inline style。
- 每批完成后同步更新本文进度表。

### 5.1 第 1 批执行要点

第 1 批拆成两个子批次，各自独立验收：

| 子批 | 范围 | 状态 |
|---|---|---|
| 1a | 设置外壳、通用、外观、关于、资产库、模型服务、技能、组件 | done |
| 1b | `ModelConfigDialog`（模型配置弹窗） | done |

1a 已完成的动作：

1. `SettingsPanel` 外壳改为固定定位 + utility，导航项用 `Button variant="ghost" size="none"`。
2. `SettingRow` 的控件容器改为 utility，设置行下拉框用任意变体统一为 210×30。
3. `GeneralSettingsSection` 移除全部 `unstyled`，按钮改用 `variant` + `size`。
4. `AppearanceSection`、`AboutSection`、`LibrarySection`、`PlaceholderSection` 改为 utility。
5. `ModelsSection` 表单与列表全部 utility 化，`btn-secondary btn-small` 对应 `size="xs"`。
6. `SkillsSection` 迁移并删除 `skills.css`；顺带修正详情栏 `min-w-0` 缺失。
7. `ComponentsSection` 迁移组件卡片。
8. 删除 `global.css` 中 921 行设置/模型/组件相关规则，删除 `skills.css` 492 行。
9. `Button` 新增 `size="none"`，用于布局完全自定义的导航项与行内按钮。

1b 已完成：

1. `ModelConfigDialog` 全部自定义类改为 utility，20 处 `unstyled` 退出。
2. 删除 `global.css` 中「模型配置」「能力模式」「模型输入能力」三段共 734 行。
3. 面板样式核对 `.operation-dialog`：`p-[18px]`、`rounded-[14px]`、`bg-surface`、`border-border`、`shadow-menu`，与迁移前一致。
4. 补回被 1a 误删的 `.settings-overlay` 与 `.settings-dialog__close`（HistoryPanel / ProjectCenter / ShortcutPanel 仍在引用）。
5. 遮罩统一为 `bg-black/45` + `backdrop-blur-[2px]` + `z-[90]`，与设置页一致。

已知偏差（1b 有意调整）：

- 请求扩展表与删除字段原先使用未样式化的原生输入框，现改为 `Input` / `Textarea` primitive，属于补齐样式。
- 等宽字体由手写字体栈改为 `font-mono`。
- Chip 过渡色从 border/background 扩展到 `transition-colors`。

### 5.2 第 2 批执行要点

第 2 批拆成两个子批次：

| 子批 | 范围 | 状态 |
|---|---|---|
| 2a | 项目中心、项目卡片、模板选择器、封面对话框、确认弹窗 | done |
| 2b | 资产库窗口、文件夹树、资产网格、提示词模板、资产库弹窗 | done |

2a 已完成的动作：

1. `ProjectCenter` 外壳、按钮、空状态、模板选择器改为 utility，入场动画保留 `@keyframes welcome-in` 并用 `animate-[welcome-in_220ms_ease-out]` 引用。
2. `ProjectCard` 卡片、封面、菜单、封面对话框改为 utility，编辑按钮用 `group-hover` 控制显隐。
3. `ConfirmDialog` 的 overlay/panel 改为 utility，遮罩 `bg-black/35`、面板 420px。
4. 删除 `global.css` 中项目中心、全部项目之外的卡片、确认弹窗、封面选择器共 561 行。

2a 踩到的两个坑：

- `Button` 默认 `inline-flex items-center`，`block` 无法可靠覆盖；卡片信息区必须用 `flex flex-col`，且文本省略需要 `min-w-0`，否则 flex item 的 `min-width: auto` 会撑开。
- `ConfirmDialog` 只在 `phase === 'ready'` 时渲染，项目中心无法触发确认弹窗，截图必须在画布页面采集。

2b 已完成的动作：

1. `LibraryWindow` 外壳、搜索、面包屑、侧栏、页脚、移动/合成/标签弹窗改 utility。
2. `AssetGrid`、`FolderTree`、`NameDialog`、`TemplateDialog`、`TemplateGrid` 全部 utility 化。
3. 删除 `global.css` 中资产库三段共 1,087 行，另删除已无引用的 `.field` 族 41 行。
4. e2e 的 `.library-window` 选择器改为 `data-testid="library-window"`。

2b 保留的共享类：`icon-btn`、`btn-*`、`form-message`、`settings-overlay`。资产库窗口像素差异 0.82%，树缩进、行高与迁移前一致。

## 6. 每批验收门槛

全部满足才允许合并：

1. `corepack pnpm typecheck` 通过。
2. `corepack pnpm lint` 0 errors。
3. `corepack pnpm test` 全绿。
4. `corepack pnpm build` 通过。
5. `corepack pnpm check:docs` 通过。
6. 该批 CSS 行数下降 ≥ 90%（C 级批次 ≥ 60%）。
7. 该批目录 `grep -c unstyled` 为 0。
8. 明暗双主题截图对比无未解释差异。
9. e2e 通过（迁移后选择器已改用 `data-testid`）。
10. 本文进度表与 `state.json` 同步更新。

## 7. 风险与回滚

| 风险 | 缓解 |
|---|---|
| 无视觉基线导致错位 | 第 4 节基线先行；每批逐页对比 |
| `unstyled` 漏改导致样式丢失 | 按目录 grep 清零；typecheck 无法发现，必须靠截图 |
| 主题切换失效 | 所有颜色只走 `@theme` token；禁止 `bg-[#...]` 硬编码 |
| C 级页面 utility 化后可读性下降 | 只迁静态外壳；定位保留 inline style，并在 PR 说明 |
| e2e 选择器碎裂 | 先补 `data-testid` 再删类名，同一 PR 内完成 |
| 迁移中途停滞 | 每批独立 PR，合并后即锁定收益；未完成的批次不影响已合并部分 |

回滚单位是单个批次：`git revert` 该 PR 即可，不需要整体回退 Tailwind。

## 8. 进度

| 批 | 状态 | CSS 实际下降 | 备注 |
|---|---|---|---|
| 基线 | done | — | 10 张截图，1440×900 / DPR 1 / 明暗双主题 |
| 1 设置/模型配置 | done | -2,187 行 | `global.css` -1,695、`skills.css` -492；设置目录与 ModelConfigDialog `unstyled` 均为 0 |
| 2 资产库/项目中心 | done | -1,583 行 | 2a 项目中心/卡片/确认弹窗，2b 资产库窗口/文件夹树/资产网格/模板/弹窗 |
| 3 剪辑室 | done | -1,165 行 | 3a 外壳/顶栏/预览/素材池（-350），3b 按钮统一/检查器/时间线（-815），`studio.css` 1,178→32 |
| 4 Prompt Bar | done | -1,052 行 | 外壳/工具条/输入区/槽位/上传/菜单/参数面板/高级设置；`global.css` 7,016→5,964 |
| 5 画布节点 | done | -2,876 行 | 容器/顶栏/底栏/多选/搜索/节点卡片/播放器/工具栏/菜单；`global.css` 5,964→3,088 |
| 6 拉片 | done | -1,108 行 | 节点卡片/分镜表/分组工具栏/右键菜单/浮窗/洞察面板；`global.css` 3,088→1,980 |
| 7 音频/文本 | done | -464 行 | 音频节点/截取变速浮动条/文本编辑弹窗；`global.css` 1,980→1,516 |
| 8 导演台 | done | -815 行 | 外壳/顶栏/侧栏/检查器/时间轴；`stage.css` 830→15，构建 CSS 195.7→202.4 KB |
| 9 CineBot | todo | — | — |
| 收尾 | todo | — | 删除旧 CSS、清理 `unstyled`、更新文档 |
