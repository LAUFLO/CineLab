# CineBot Phase 3 方案与实施记录

日期：2026-11-11
状态：**已实施**
分支：`feat/agent-phase3`
适用版本：`main` @ `b76a064`
关联：`docs/agent-capability-plan.md`、`docs/agent-capabilities.md`、`docs/node-operation-bridge-plan.md`

## 1. 范围

Phase 3 聚焦三块能力补齐：

1. 拉片完整度：段落编辑、字幕提取、拉片回合撤销。
2. 导演台完整度：镜头增删改、机位关键帧、背景、对象姿势/颜色/可见性。
3. 能力发现：`capability_search` 关键词搜索已注册工具。

## 2. 拉片

### 新增工具

| 工具 | 作用 |
|---|---|
| `film_study_update_segment` | 修改段落标题、时间、类型、结构角色、景别、机位、运镜、光线、画面描述、提示词、人声、音乐和备注 |
| `film_study_extract_subtitles` | 从源视频提取内嵌字幕并写入拉片数据 |

### 回合撤销

- 修改前调用 `useFilmStudyStore.rememberFilmTurn(turnId, study)` 保存整份 study 快照。
- `AgentTurnChange.filmUpdated` 标记本轮修改了拉片数据。
- `agentStore.undoLastTurn` 改为异步，撤销时调用 `undoFilmTurn(turnId)` 写回快照。
- 最多保留 10 个拉片快照，避免内存膨胀。

### 已知限制

- `film_study_import_analysis` 仍走界面文件对话框；Agent 侧暂不开放任意路径导入。
- 拉片快照只覆盖 study JSON，不覆盖已经导出到磁盘的 Markdown/ZIP。

## 3. 导演台

### 新增工具

| 工具 | 作用 | 确认 |
|---|---|---|
| `stage_add_shot` | 添加镜头并绑定机位 | 否 |
| `stage_update_shot` | 修改镜头名称、机位、时长、画幅 | 否 |
| `stage_remove_shot` | 删除镜头及运镜/动作轨 | 是 |
| `stage_set_camera_track` | 整体替换机位关键帧轨道 | 是 |
| `stage_set_background` | 设置纯色/全景/模型背景 | 否 |
| `stage_update_object` | 修改对象姿势、颜色、可见性 | 否 |

### 实现

- `stage-commands.ts` 新增 `setBackground` 命令和 `backgroundChanged` 变更标记。
- 新增工具复用 `StageCommand.addShot / updateShot / removeShot / setCameraTrack / setPose / setColor / setVisible`。
- 同一轮场景命令继续通过 `turnId` 合并为一条场景撤销记录。

### 已知限制

- 导演台当前 schema 没有独立灯光实体；灯光目前通过对象颜色、背景和环境材质近似。
- 镜头动作轨（对象运动）仍由界面编辑，Agent 暂只开放机位运镜。

## 4. 能力发现

### `capability_search`

- 主进程执行，读取 `AGENT_CAPABILITIES` 投影。
- 按工具名、能力 ID、描述做关键词匹配。
- 返回工具名、ID、说明、作用域、只读性、确认级别和 profile。
- 参数：`query` 必填，`limit` 1-30，默认 10。

## 5. 测试

- `src/shared/__tests__/stage-commands.test.ts`：背景设置与空背景拒绝。
- `src/main/agent/__tests__/tools.test.ts`：导演台镜头/运镜/背景、拉片段落、字幕提取、能力搜索校验与确认。
- `src/main/agent/__tests__/capabilities.test.ts`：能力搜索。

## 6. 后续

- 拉片分析包导入（Agent 指定项目内路径）。
- 导演台对象动作轨/灯光实体。
- 动态工具暴露、真实 tokenizer 和上下文预算。
- Agnes 视频队列恢复后补测。
