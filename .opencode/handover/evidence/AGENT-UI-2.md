# AGENT-UI-2 · 助手 UI 重做、会话与文本模型选择

日期：2026-11-09
状态：完成
范围：LibTV 风格助手面板、会话历史、文本模型选择、技能选择、权限菜单、工具过程隐藏
关联：`CLIP-PROFILE-1`、`SKILLS-UI-1`、`AGENT-FAB-1`

## 1. 目标

解决旧助手面板：

- 视觉粗糙，不像创作工具
- 只能使用自动选择的文本模型
- 只有一个会话，无法新建/切换历史
- 工具调用直接展示大段 JSON，用户看不懂

## 2. 新面板

### 2.1 布局

- 圆角悬浮卡片，420px 宽，顶部标题、模型/设置、新建对话、收起按钮。
- 空状态包含助手图标、能力说明和快捷建议。
- 用户消息右侧气泡，助手消息左侧无边框文本，悬停显示复制按钮。
- 底部输入卡：
  - 文本域
  - 模型 chip、权限 chip、技能 chip
  - 圆形发送按钮 / 停止按钮

### 2.2 会话

- 点击顶部会话标题打开「历史对话」：
  - 搜索
  - 新对话
  - 历史列表（标题、相对时间、当前高亮）
- 新建会话、切换会话会重新加载对应 JSONL。
- 首条用户消息自动生成会话标题。
- 会话与项目绑定，存 `<project>/.cinelab/agent/sessions/`。
- 运行中禁止新建/切换会话，避免事件串流。

### 2.3 文本模型

- 顶部设置按钮和输入区模型 chip 打开「选择文本模型」。
- 列表来自已配置且有 Key 的 `text.chat` 模型。
- 支持「自动选择」或指定 provider/model。
- 选择结果存本地 `cinelab.agent.modelKey`。
- 请求带 `modelKey`，运行时按 key 解析；缺失时回退到第一个可用文本模型。

### 2.4 技能

- 输入区「技能」chip 打开技能选择器。
- 读取三级技能列表，只显示启用技能。
- 支持搜索；选择后把「使用技能：name」插入输入框。
- 不直接执行技能，由用户补全需求后发送。

### 2.5 权限

- 「只读 / 当前空间」chip 打开权限菜单。
- 只读：不修改画布或时间线。
- 当前空间：允许修改当前画布或剪辑室。

### 2.6 工具过程

- 连续工具调用折叠为「思考过程 · N 步」。
- 每一步只显示友好名称和状态，例如：
  - 读取画布
  - 删除节点
  - 移动片段
- 不展示工具参数或结果 JSON。
- 失败时展开并显示错误文本。
- 运行中自动展开，结束后可收起。

## 3. 后端

- `AgentSessionInfo`、`sessionList / sessionCreate / sessionRename`。
- `ensureSessionTitle`：首条用户消息自动命名。
- `AgentSessionEntry` 新增 `meta`（标题）。
- `listTextModels`：列出有 Key 的文本模型。
- `resolveTextModel(modelKey?)`：按 key 解析，自动回退。
- `AgentChatRequest` 新增 `modelKey`。
- `agent:proposal-active` 按当前 sessionId 读取提案。

## 4. 验证

### 4.1 自动化

```text
36 test files, 247 tests passed
typecheck 通过
build 通过，主进程约 503KB
```

新增测试：

- 会话创建、自动标题、重命名、列表、消息计数、预览。
- 文本模型列表、指定 key 解析、无效 key、自动回退。

### 4.2 真实 UI

```text
打开助手 → 恢复历史会话，50 条消息，25 个思考过程
→ 工具 JSON 不再出现在消息区

会话标题 → 历史对话
→ 列表：你好 / 把选中节点改名为 只读测试 / 把选中节点改名为 开场镜头
→ 搜索框正常

新建对话 → 空状态「有什么可以帮你？」
→ 标题「新对话」

选择文本模型 → 列表：
  自动选择
  Agnes 3.0 Flash / Agnes AI（中国站）
→ 选择 Agnes 后 chip 显示 Agnes 3.0 Flash

发送「你好」
→ 会话标题自动变为「你好」
→ 用户/助手消息正常，无工具 JSON

技能 chip → 列表包含 canvas-basics、test-director
→ 选择后输入框插入「使用技能：canvas-basics」

权限 chip → 只读 / 当前空间菜单正常
```

截图：

- `.opencode/handover/evidence/AGENT-UI-1.png`
- `.opencode/handover/evidence/AGENT-UI-2.png`
- `.opencode/handover/evidence/AGENT-UI-MODEL-1.png`
- `.opencode/handover/evidence/AGENT-UI-SESSIONS-2.png`

## 5. 已知限制

- 会话暂不支持删除、收藏、分享、重命名 UI。
- 文本模型选择只列 `text.chat`，不显示其他能力模型。
- 未实现 `@` 引用节点/资源与附件上传。
- 工具过程默认隐藏参数/结果，不提供“查看原始数据”开关。
- 会话标题取首条消息前 40 字，不调用模型生成摘要。
- 运行中修改模型不会影响当前回合，只影响下一回合。

## 6. 下一步

1. 剪辑高级工具：自动字幕、删静音、转场、导出。
2. 整体验收。
3. 推送前同步 origin/main。
