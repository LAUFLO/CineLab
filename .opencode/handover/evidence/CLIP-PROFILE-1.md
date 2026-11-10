# CLIP-PROFILE-1 · 剪辑助手 clip profile

日期：2026-11-09
状态：完成
范围：clip 作用域、时间线工具、渲染执行桥、回合级撤销、Agent 面板剪辑模式
关联：`docs/agent-architecture-plan.md`、`AGENT-PROPOSAL-1`、`STAGE-TIMELINE-PREVIEW-1`

## 1. 目标

用通用 AgentRuntime 重建已删除的剪辑助手，让 Agent 在剪辑室上下文中读取和修改时间线。

## 2. 作用域

`AgentScope` / `AgentChatRequest` 增加：

```ts
timelineId?: string
studioNodeId?: string
selectedClipIds?: string[]
playheadMs?: number
```

- Agent 面板在剪辑室打开时发送 `profileId='clip'`。
- 自动带上当前时间线 ID、剪辑室节点 ID、选中片段和播放头。
- 主进程校验长度与数量，构造 scope。
- 剪辑工具要求 `scope.timelineId` 存在，否则拒绝。

## 3. Agent 工具

新增 `TIMELINE_TOOLS`（profile `clip`，scope `timeline`）：

| 工具 | 说明 |
|---|---|
| `timeline_get` | 读取视频设置、轨道、片段、标记、选中片段、播放头、总时长 |
| `timeline_select_clips` | 设置/清空选中片段 |
| `timeline_move_clips` | 相对移动或移动到指定起点，支持 insert/overwrite |
| `timeline_trim_clip` | 裁头/裁尾，支持 ripple |
| `timeline_split_clips` | 在绝对时间切分片段 |
| `timeline_remove_clips` | 删除片段，支持 ripple |
| `timeline_update_clip` | 名称、音量、静音、透明度、淡入淡出、速度 |
| `timeline_set_track` | 轨道可见/静音/锁定 |
| `timeline_add_marker` | 添加时间线标记 |

实现位置：

- 定义与参数校验：`src/main/agent/tools.ts`
- 渲染执行桥：`src/renderer/src/agent/timelineBridge.ts`
- 时间线命令：`src/shared/timeline-commands.ts`

## 4. 回合级撤销

`timelineStore` 新增：

- `dispatchMany(commands, turnId?)`：批量应用命令。
- 同一 `turnId` 只压入一次历史。
- `endCommandTurn(turnId)`：回合结束时清理。

`AgentTurnChange` 增加 `timelineUpdated`：

- 时间线工具成功执行时标记。
- Agent 面板显示「本轮修改了 N 处」。
- 「撤销这一轮」同时处理画布与时间线。

## 5. 剪贴模式 UI

- Agent 面板 z-index 提升到 95，可在剪辑室 / 导演台之上使用。
- 剪辑室打开时：
  - 标题「剪辑助手」
  - 占位符「把选中片段整体前移 1 秒」
  - 空状态提示移动/裁剪/切分/删除/音量/速度
- 画布模式保持「画布助手」。

## 6. 系统提示

`runtime.ts` 按 profile 切换：

- `canvas`：画布、生成提案。
- `clip`：只操作当前时间线；先 `timeline_get`；时间单位毫秒；破坏性操作先说明；同一轮只产生一条撤销。

## 7. 真实验证

### 7.1 自动化

```text
33 test files, 239 tests passed
typecheck 通过
build 通过
```

新增工具参数测试：

- 未打开时间线时拒绝剪辑工具。
- 只读模式拒绝写工具。
- clipIds 非空、去重、数量限制。
- 移动必须提供 deltaMs 或 startMs。
- trim edge、split atMs、marker 时间。
- update patch 白名单与范围。
- track flag 枚举。

### 7.2 真实剪辑室

测试时间线：4 条轨道、1 个图片片段 0–5000ms。

```text
剪辑室打开 → Agent 面板显示「剪辑助手」，z-index 95 可见
发送：读取时间线，把主轨片段整体右移 1 秒
→ timeline_get 返回 timeline_mw812ggr_3 / 1 个片段 / 4 条轨道
→ timeline_move_clips：startMs 0 → 1000，总时长 5000 → 6000
→ 时间线文件保存 startMs=1000
→ Agent 面板显示「本轮修改了 1 处」
→ 点击「撤销这一轮」：startMs 回到 0，duration 5000

发送：把主轨片段尾部缩短 1 秒
→ timeline_get → timeline_trim_clip
→ duration 5000 → 4000
→ 点击撤销：duration 恢复 5000
```

截图：`.opencode/handover/evidence/CLIP-ASSISTANT-1.png`

> 测试期间 Agnes 文本模型仍偶发 503；`timeline_split_clips`、`timeline_remove_clips`、`timeline_update_clip`、`timeline_set_track`、`timeline_add_marker` 未逐一跑真实 Agent 轮次，但共享同一执行桥、命令层与参数测试。

## 8. 已知限制

- 暂未提供剪辑导出工具，导出仍由剪辑室按钮触发。
- 剪辑助手不能直接发起生成，需切回画布或使用画布助手。
- 时间线工具只操作已打开的时间线，不支持跨剪辑室。
- 时间线选择只同步到 Agent 请求时，回合中用户手动改选不会更新 scope。
- 自动字幕、删静音、转场等高级工具尚未接入 Agent。

## 9. 下一步

1. 技能管理 UI。
2. 删除 / 批量操作二次确认。
3. 剪辑助手高级工具：自动字幕、删静音、转场、导出。
4. 整体验收；推送前同步 origin/main。
