# 进度校准记录（2026-11-04）

- 方式：git log + 源码扫描 + 已有 evidence 交叉核对
- 目的：修正交接文档与实际代码进度不一致

## 核对依据

- 最新提交：`f6a4f37` feat: OpenAI compatible TTS audio node (M4-1)，2026-11-04 21:49:16 +0800
- 已验证 evidence：M1、M2-1、M2-2、M2-3、M2-5、M3-1、M3-2、M4-1
- 代码检查：`src/main/ipc/generate.ts`、`src/main/providers/openai-compat.ts`、`src/main/providers/volcengine.ts`、`src/main/engine/queue.ts`

## 结论修正

| 项 | 原状态 | 实际 | 依据 |
|---|---|---|---|
| M2-3 | done | partial | 仅文生图验证；`generateImage` 未接收 refs，图生图未接通 |
| M2-4 | done（重试待补） | done（重试已完成） | `retry.ts` + `generate.ts` 的 `withRetry` |
| M3-1 | done | partial | 仅火山方舟；可灵 JWT 未接入 |
| M3-2 | done | done（有缺口） | 引用取 `outputs[0]`，未跟随 `selectedOutputId` |
| M4-1 | done | done（范围有限） | 仅 OpenAI 兼容 TTS；`audio.music` 未接入 |

## 新增已知缺口

见 `state.json.knownIssues` K1–K6：

1. 图生图未接通
2. 文本生成未接通
3. `audio.music` 未接入
4. 可灵 JWT 未接入
5. 多处 UI 占位
6. 本机 pnpm / node_modules 未就绪

## 本次更新文件

- `.opencode/handover/state.json`
- `.opencode/handover/boot-packet.md`
- `.opencode/handover/project_summary.md`
- `README.md`

## 验证

- `node -e` 解析 `state.json` 通过
- 四份文档的 phase、next_focus、M2/M3/M4 状态已交叉核对
- 未改动任何 `src/` 代码

## 后续更新（同日）

上文是校准时的快照，以下项后来已完成：

- M2-3 图生图已接通并验证，见 `M2-3-image-edit.md`
- P2 文本生成已接通并验证，见 `P2-text-generation.md`
- M4-2 资产库 MVP 已实现并验证，见 `M4-2-library.md`
- PromptBar 下游引用已改为跟随 `selectedOutputId`
