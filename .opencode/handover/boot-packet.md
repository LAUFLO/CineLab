# CineLab · Boot Packet

> **下一会话优先**：确认是否先实施 CineBot Phase 1 小范围能力；PR #2 已创建且 CI 通过。

## 状态

2026-11-10：PR #2 已创建，CineBot 能力扩展方案已写入文档。

- PR：https://github.com/LAUFLO/CineLab/pull/2
- 状态：`OPEN` / `MERGEABLE` / `CLEAN`
- CI：GitHub Actions build 通过
- 分支：`feat/agent-runtime`，领先 `origin/main` 34 个提交、落后 0
- `origin/main` 9f4511d 已合并，6 个冲突已解决
- 验证：40 文件 277 测试、`typecheck`、`build` 通过

## Frontier

1. 确认 Phase 1 能力补齐范围（下一项）
2. PR #2 review/merge
3. Phase 2：节点操作桥 + 能力注册表（新分支）
4. Phase 3：拉片/导演台完整 Agent、能力搜索、真实 tokenizer

## 能力覆盖结论

已覆盖：

- 画布基础：创建/移动/连接/删除节点、标题、分组
- 生成提案、素材引用、画布/资产库/本地附件
- 时间线：读取/选择/移动/裁剪/切分/删除/属性/轨道/标记
- 剪辑高级：自动字幕、删静音、转场、导出
- 导演台基础：读场景、加/移动对象、加/切换机位、删对象
- 技能读取、资产库搜索

未覆盖：

- 删除连线、修改文本正文
- 时间线画幅、按镜头切分、节拍标记/切分、导入字幕
- 导演台机位变换、镜头/运镜、预览导出、灯光/背景
- 拉片完整链路
- 节点工具栏 29 个操作（裁剪、宫格、抽帧、全景、抠图、重绘、片段重拍等）
- 音频节点资产裁剪/变速（时间线片段已有）

## 方案要点

详见 `docs/agent-capability-plan.md`：

- 能力注册表 `AgentCapability`
- UI 和 Agent 共用执行器
- 节点操作桥 `node-operation-runner`
- `canvas_node_operations` / `canvas_node_operation`
- `capability_catalog` 能力发现
- 未来功能接入清单

## 合并建议

- PR #2 先合入稳定部分。
- Phase 1 小范围能力可在当前分支补，但会让 PR 变大。
- Phase 2/3 建议在新分支 `feat/agent-capabilities` 做。
- Agnes Video 503 不阻塞合并。

## Gates

- G-AGENT-VIDEO：Agnes Video 2.5 Flash 队列 503，待恢复重试。
- G-AGENT-MAIN：已解决，origin/main 9f4511d 已合并且 CI 通过。

## 证据

`.opencode/handover/evidence/` 下 `PR-CINELAB-2.md`、`MERGE-MAIN-1.md`、`AGENT-ACCEPTANCE-1.md`、`SKILLS-FILES-1.md`、`AGENT-UI-REFINE-1.md`、`AGENT-ASSET-REFS-1.md`。方案：`docs/agent-capability-plan.md`。

## 关键 lessons

- main 的 `generate.ts` 是旧内联逻辑；合并时要保留薄 IPC，把改动移植到 `start-generation.ts`。
- main 成片已合并进 studio 节点，导出写回用 `applyStudioOutput` / `patchStudioNode`。
- InspectorPane 保留属性/画面/音频，旧助手分页删除。
- `canvas.ts` 合并时以 main 为基础，再叠加 stage、`applyCommands`、回合撤销。
- 新功能要 UI 和 Agent 共用执行器，不要做两套逻辑。
- 节点工具栏操作应统一走 `node-operation-runner`，Agent 只暴露一个通用操作工具。
- CineBot 模型选择分文本/生图/生视频/音频；生成提案按目标类型覆盖模型。
- 上下文压缩 v1：3 字符≈1 token、32K 固定预算、保留最近 6 条、summary 存 coveredMessages。
- `@` 引用素材、`/` 打开技能；引用随 `agent:chat.references` 注入系统提示。
- 技能文件上传只允许 references/assets；同名覆盖并返回 overwritten；删除不允许 SKILL.md。
- 工具过程折叠为「思考过程」，不展示 JSON。

## 设计约定

- CineBot 面板为 LibTV 风格：`CineBot · 会话标题`、上传/模型/权限/技能 chip、上下文圆环、圆形发送按钮。
- 输入框 `@` 引用素材、`/` 选择技能。
- 技能覆盖优先 project > global > builtin；内置技能只读。
- 主题只通过 `styles/tokens.css` 的 CSS 变量。
