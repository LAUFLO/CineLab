# MCP 开放能力与配置面板方案

日期：2026-11-24
状态：现行
适用版本：v0.4.6
最后核对：2026-11-24

## 1. 背景

CineLab 已内置 MCP server，外部 Agent 可通过 HTTP 或 stdio 连接并操作画布、剪辑室、导演台和拉片。但实际使用存在三个问题：

1. 应用内没有任何 MCP 配置入口，用户只能去 `%APPDATA%\cinelab\mcp.json` 找地址和 token；
2. MCP 只注册了 46 个工具，低于 CineBot 的 70 个，高频能力有缺口；
3. `docs/mcp.md` 的「安全」章节仍写着「只读、不写项目」，与现有写工具矛盾。

## 2. 现状

| 项目 | 现状 |
|---|---|
| 配置方式 | 启动时写 `userData/mcp.json`，手动复制到外部客户端 |
| 端口 | 默认 7788，占用时顺延 7789–7792 |
| 鉴权 | Bearer token，仅监听 127.0.0.1 |
| 工具数 | 46（适配器 3 + 项目/画布只读 5 + 写 38） |
| 写操作 | 每次弹原生确认框，危险操作单独标记 |
| 设置页 | 8 个分区，无 MCP 入口 |

与 CineBot 相比，缺口集中在：画布分组与节点操作、时间线画幅/按镜头切分/自动字幕、导演台机位与对象变换、资产库搜索、能力目录与技能。

## 3. 方案

### 3.1 设置页 MCP 分区（P0）

新增「MCP」设置分区，包含：

- 运行状态：运行中 / 已停止、地址、端口、版本；
- 配置文件路径，一键打开所在目录；
- token 显示（默认打码）与一键复制；
- 一键复制 HTTP 配置、stdio 配置；
- 客户端示例（Claude Desktop / Cursor 片段）；
- 工具清单：按类别分组，标注只读 / 写 / 危险；
- 只读模式开关：开启后所有写工具直接拒绝，不弹确认框。

不提供「免确认」模式：外部 Agent 无人值守修改项目风险过高，当前保持逐次确认。

### 3.2 只读模式

- `preferences.json` 新增 `mcpEnabled`、`mcpReadOnly`；
- `mcpEnabled=false` 时不启动 server；
- `mcpReadOnly=true` 时写工具返回 `{ error: "MCP 当前为只读模式" }`，只读工具正常；
- 设置页修改后立即生效，无需重启应用。

### 3.3 能力补齐（P2）

新增 15 个工具，复用 CineBot 执行器：

| 类别 | 工具 | 类型 |
|---|---|---|
| 画布 | `canvas_group`、`canvas_ungroup`、`canvas_node_operation` | 写，确认 |
| 画布 | `canvas_node_operations` | 只读 |
| 剪辑室 | `timeline_set_video`、`timeline_split_by_shots`、`timeline_auto_subtitles` | 写，确认 |
| 导演台 | `stage_transform_camera`、`stage_update_shot`、`stage_set_camera_track` | 写，确认 |
| 资产 | `library_search` | 只读 |
| 能力 | `capability_catalog`、`capability_search` | 只读 |
| 技能 | `skill_list`、`skill_read` | 只读 |

写工具统一走 `runWrite`：原生确认 → `sendCommand` → renderer `executeAgentTool`。只读工具中，`canvas_node_operations` 依赖渲染层选中节点，走 `sendCommand` 但不确认；其余只在主进程读取数据。

### 3.4 文档修正（P1）

- 重写 `docs/mcp.md` 的安全与范围章节，区分只读与写工具；
- 更新版本号与工具清单；
- 补充配置面板与只读模式说明。

## 4. 改动点

| 文件 | 改动 |
|---|---|
| `src/shared/preferences.ts` | 新增 `mcpEnabled`、`mcpReadOnly` |
| `src/main/mcp/catalog.ts` | 新增工具目录（名称、类别、只读、危险） |
| `src/main/mcp/server.ts` | 状态导出、按设置启停、工具目录 |
| `src/main/mcp/write-tools.ts` | 新增 10 个写工具、只读模式检查 |
| `src/main/mcp/app-tools.ts` | 新增 5 个只读工具 |
| `src/main/ipc/mcp.ts` | 新增状态、配置、工具清单 IPC |
| `src/main/index.ts` | 按设置启停 server、设置变更生效 |
| `src/preload/index.ts`、`src/shared/ipc-contract.ts` | 暴露 MCP API |
| `src/renderer/src/panels/McpSettingsSection.tsx` | 新增设置面板 |
| `src/renderer/src/panels/SettingsPanel.tsx` | 新增 MCP 分区 |
| `docs/mcp.md` | 修正安全、范围、版本与工具清单 |
| `docs/README.md` | 登记本文档 |

## 5. 影响模块

- 主进程 MCP server 与设置持久化；
- preload / IPC 契约；
- 设置页；
- 外部 Agent 的工具清单（新增 15 个）。

不涉及项目文件格式、生成流程和数据迁移。

## 6. 验收

- `corepack pnpm typecheck`、`test`、`check:ui`、`check:docs`、`check:code-map`；
- 设置页 MCP 分区可查看状态、复制配置、切换只读模式；
- 只读模式下写工具返回明确错误，只读工具正常；
- 新增 15 个工具可通过 MCP 客户端列出并调用；
- `docs/mcp.md` 与 `catalog.ts`、注册代码三方一致（单测校验工具名集合）。

## 7. 风险与回滚

- 风险：新增写工具扩大外部 Agent 的操作面。缓解：全部保留确认框，并提供只读模式。
- 风险：设置变更需要重启 server 会影响已连接会话。缓解：只在 `mcpEnabled` 变化时重建，readOnly 实时读取。
- 回滚：整体 revert 本次提交；`mcp.json` 与 preferences 兼容旧值（缺省按默认开启、非只读）。
