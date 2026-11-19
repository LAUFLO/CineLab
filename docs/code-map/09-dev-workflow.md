# 09 开发流程

日期：2026-11-19
状态：现行
适用版本：v0.3.0
最后核对：2026-11-19

> 目标：让每次方案都基于**当前代码事实**，而不是文档里的「已完成」。
> 跨机器以本目录为准；`.opencode/handover` 只作为本机补充。

## 1. 方案阶段

每次让 AI 出方案前，按顺序：

1. 读 [README.md](README.md) 的「需求 → 模块」表，确定涉及 1–3 个模块。
2. 读 [08-capabilities.md](08-capabilities.md) 中相关行，确认哪些是**已实现 / 部分实现 / 仅文档**。
3. 读对应模块文档的「速查区」「当前状态」「已知限制」。
4. 需要接口/文件时读 [_generated.md](_generated.md)。
5. 只读相关代码，不全仓扫描。

方案必须包含五段：

```md
## 现状（依据 docs/code-map/0X-xxx.md）
- 已实现：...
- 部分实现：...
- 仅文档：...

## 已有实现检查（先查 docs/code-map/11-feature-index.md）
- 复用：...
- 扩展：...
- 新建：...

## 改动点
...

## 影响模块
- 04 导演台（主要）
- 06 Agent（新增工具）

## 验收
...
```

> 方案里禁止把「文档写了」当成「代码有」。能力状态以 08 为准。

## 2. 实施阶段

1. 方案确认后再改代码。
2. 大功能先落 `docs/<feature>-plan.md`，方案变更先改文档。
3. 改动跨模块时，按影响模块逐个核对现有逻辑，避免只改一处。

## 3. 更新地图

功能增删改后，必须同步：

| 变化 | 更新 |
|---|---|
| 新增/删除文件、导出符号 | 运行 `corepack pnpm map:code`（自动更新 AUTO 区与 `_generated.md`） |
| 能力状态变化 | 改对应模块文档的「当前状态」和 [08-capabilities.md](08-capabilities.md) |
| 新增模块 | 在 `scripts/gen-code-map.mjs` 的 `MODULES` 登记，并创建 `docs/code-map/NN-xxx.md` |
| 方案完成 | 方案文档标「已实施」，按 `docs/README.md` 约定移入 `docs/archive/` |

## 4. 校验

提交前：

```bash
corepack pnpm map:code        # 更新自动区
corepack pnpm check:code-map  # 校验自动区是否最新
corepack pnpm check:docs      # 校验索引、链接、Agent 工具清单
corepack pnpm check:ui        # 涉及 UI 时
corepack pnpm typecheck
corepack pnpm test
```

`check:docs` 已包含 `check:code-map`；单独调试时可用 `check:code-map`。

## 5. 文档状态三档

| 状态 | 含义 | 写法 |
|---|---|---|
| 已实现 | 代码存在、有测试或可复现证据 | 模块文档「当前状态」+ 08 |
| 部分实现 | 入口存在，但行为不完整 | 必须写清缺什么、证据文件 |
| 仅文档 | 只有方案/设计，没有代码 | 只出现在方案与 08 的「仅文档」表 |

## 6. 与 handover 的关系

- `.opencode/handover` 只在本机，换电脑不同步，**不作为跨机器真相源**。
- 跨机器上下文以 `docs/code-map/` 为准。
- 本机 handover 可以记录临时进度，但功能状态必须回写 `08-capabilities.md`。

## 7. 新会话启动

`AGENTS.md` 已写死启动顺序：

1. 读 `docs/code-map/README.md`；
2. 读 `docs/code-map/08-capabilities.md`；
3. 出方案前按涉及模块读对应地图。
