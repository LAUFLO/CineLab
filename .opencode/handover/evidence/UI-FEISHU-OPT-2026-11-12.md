# UI-FEISHU-OPT-2026-11-12

日期：2026-11-12
状态：done
来源：飞书多维表格「软件开发缺陷管理系统」7 条优化问题

## 完成项

1. 视频节点更多菜单二级浮窗：悬浮即展开，点击保留兜底。`NodeToolbar` + `.cnode__toolbar-submenu`。
2. 图片节点更多菜单二级浮窗：同一套逻辑覆盖。
3. CineBot 模型浮窗：文本 / 图片 / 视频 / 音频四个 tab，一次显示一类；有已选模型的 tab 显示圆点。
4. 节点操作输出目标：新增 `NodeOperation.outputTarget`；生成型、裁剪/截取/画面裁切/去字幕/扩图/抠图/音频派生操作全部新建节点并连线；光影校正、打光、人像、重绘、擦除、元素编辑保持版本回写。规则见 `docs/node-output-target-plan.md`。
5. CineBot 悬浮按钮：`right: 26px`、`bottom: 26px`。
6. 文本节点编辑弹窗：单栏，工具栏「预览 / Markdown」切换，格式工具只在编辑态显示。
7. 角色三视图改为角色四视图：全身正面、全身侧面、全身背面、面部正面特写；菜单、右键菜单、项目模板和文档同步。

## 验证

- `corepack pnpm typecheck` 通过。
- `corepack pnpm test`：42 文件 312 用例通过。
- `corepack pnpm build` 通过。
- 隔离实例 CDP：
  - FAB 实测 `rightGap=26.0`、`bottomGap=26.0`，尺寸 44×44。
  - 图片节点更多菜单 hover「九宫格」出现 `.cnode__toolbar-submenu`，子项「多机位九宫格 / 剧情推演四宫格」可点击。
  - 模型浮窗显示四个 tab，点击「图片」切换到生图模型列表。
  - 文本编辑器编辑态单栏；点击「预览」显示 Markdown 渲染，按钮变为「Markdown」。
  - 裁剪 1:1 实测：源节点 outputs 保持 1，新节点「界面测试图片 · 1:1」outputs=1，自动生成 source→target 连线。
  - AiOperationDialog 对 `new-node` 操作显示「结果会创建一个新节点，并自动连到当前节点」。
- 测试数据已清理，CapabilityTest 恢复 3 节点 / 2 连线。

## 证据

- `UI-FEISHU-MORE-SUBMENU.png`
- `UI-FEISHU-MODEL-TABS.png`
- `UI-FEISHU-TEXT-EDITOR.png`
- `UI-FEISHU-FAB.png`
- `docs/node-output-target-plan.md`

## 追加：CineBot 提案对齐

- 主进程登记提案时写入 `outputTarget`；渲染端确认 `new-node` 提案时创建占位节点并连线，再把新节点 ID 传给 `proposalSubmit`。
- 主进程校验并改写 `request.nodeId` 后再入队；旧提案用 `nodeOperationOutputTarget(request.op)` 兜底。
- 提案卡显示「新建节点并连线 / 写回当前节点版本」。
- 新增 2 个 proposals 测试（new-node 提交、version 忽略 target），全量 314 tests 通过。
- 隔离实例伪造 new-node 提案：提案卡显示「新建节点并连线」；点击确认后创建节点、自动连线；模拟主进程失败时节点标红并写入错误。测试数据已清理。

## 待办

- 真实模型生成类的“新节点 + 连线”尚未做端到端烟测（本地裁剪链路和提案创建链路已验证）。
