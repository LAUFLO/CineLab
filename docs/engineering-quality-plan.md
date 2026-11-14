# CineLab 工程质量、仓库与文档治理方案

日期：2026-11-13
状态：已执行（P0–P3 完成）
适用版本：v0.1.0
最后核对：2026-11-14

> 本文是方案与执行记录：P0 安全与仓库清理、P1 工程门禁、P2 UI 迁移、P3 架构与测试均已完成，执行结果见 `docs/p2-acceptance.md` 和 `docs/p3-refactor-plan.md`。

## 0. 摘要

CineLab 的功能迭代速度已经超过工程基础设施的建设速度。当前问题不在“代码能不能跑”，而在四类边界：

1. **仓库边界**：本地 `.opencode/handover` 被提交进公开仓库，包含本机路径、下载目录和 24MB 截图。
2. **安全边界**：Markdown XSS、外链协议、CSP、自定义协议 Range、无补丁依赖。
3. **工程门禁**：没有 lint / format / audit / coverage；文档检查只查格式，不查内容。
4. **UI 基础设施**：只有 7 个公共组件，38 处原生 `<select>`，7 处重复 `Toggle`，8,467 行全局 CSS。

方案分四批：

| 批次 | 目标 | 预估 |
|---|---|---|
| P0 | 仓库隐私、安全止血、文档硬伤 | 2–3 天 |
| P1 | 工程门禁、文档机制、发布流程 | 1 周 |
| P2 | 公共组件、样式分层、Tailwind 决策 | 2–3 周 |
| P3 | 架构拆分、性能、测试补齐 | 1–2 个月，持续 |

### 0.1 已确认的决策

- 仓库保持 **Public**（开源项目）。
- `.opencode` 从 Git 索引移除，**本地保留**；已提交 `5e5306b`，尚未 push。
- 清理 Git 历史中的 `.opencode`，并一并清理 `docs/brand/explorations`。
- 文档版本改用 `适用版本 + 最后核对`，不再手写 commit SHA。
- **Tailwind 全量迁移**，按第 3.7 节四阶段执行。
- P0 按本文顺序执行。

### 0.2 仍需拍板

- 历史清理的具体执行窗口由维护者决定；执行前需临时关闭 main 保护。
- Tailwind 迁移顺序：基础层 → primitives → 页面 → 收尾。
- 是否引入 Playwright e2e 与覆盖率门槛。
- 文档 release 版本：当前用 `v0.1.0`，还是等下一个版本号。
- 公开仓库文件：本轮是否补 `SECURITY.md`、PR 模板、CONTRIBUTING。

## 1. 现状

### 1.1 体检数据

| 指标 | 现状 |
|---|---|
| TS/TSX | 310 文件 / 72,915 行 |
| 测试 | 43 文件 / 317 用例 / 2.27s |
| 公共组件 | 7 个 |
| 原生 `<select>` | 38 处 / 15 文件 |
| 重复 `Toggle` | 7 处 |
| 内联 `style` | 46 处 |
| TSX 硬编码色值 | 53 处 |
| `global.css` | 8,467 行 / 1,273 选择器 |
| Tailwind utility | 21 处（但 `global.css` 已 `@import 'tailwindcss'`） |
| Agent 工具 | 56 个 / `src/main/agent/tools.ts` 3,286 行 |
| IPC handler | 165 个 |
| 首屏 JS | 2.44MB + three.js 1.26MB + CSS 277KB |
| 依赖漏洞 | 2 个 high（extract-zip，无补丁） |
| `.opencode` | 237 文件 / 24.6MB；72 张 PNG 占 24.03MB |
| 仓库 pack | 26.5MB |
| 文档漂移 | 18 份现行文档版本戳落后 18 个提交；3 个引用路径失效 |

### 1.2 做得好的地方

- TypeScript `strict`，基本没有 `any`。
- 317 个测试全绿，运行只要 2.27s，适合作为质量门。
- `sandbox` / `contextIsolation` / `nodeIntegration: false` 基础正确。
- `safeStorage` 加密 Key；路径校验 `resolveInside` 普遍使用；项目写入原子化。
- 共享 schema、IPC 分层、Agent 工具注册表方向正确。
- 分支规范、PR 流程、44 份文档，说明项目有工程意识。

### 1.3 核心矛盾

不是“重构代码”，而是**把已经形成的开发习惯，固化成不会回退的机制**：

- 安全靠人记得检查 → 改成边界测试 + CSP + 白名单。
- 样式靠人记得统一 → 改成 primitives + ESLint。
- 文档靠人记得更新 → 改成生成 + 校验 + PR 模板。
- 仓库靠人记得别提交 → 改成 `.gitignore` + 隐私扫描。

## 2. 仓库公开与历史清理

### 2.1 公开仓库的现状

`gh repo view` 结果：

```json
{"visibility":"PUBLIC","forkCount":0,"stargazerCount":1,"watchers":0}
```

项目首次提交是 `chore: initial open source release`，因此公开是有意选择。公开本身不是问题，问题是公开前没有做隐私边界。

公开仓库意味着：

- 任何人可以查看全部代码和提交历史。
- 可以被搜索引擎索引、fork、clone。
- GitHub Actions 日志、Issues、PR 默认可见。
- 已经公开的内容，即使删除，也可能被缓存或 fork。

### 2.2 `.opencode` 的问题

已从 Git 索引移除，本地保留：

```text
commit 5e5306b  chore: stop tracking local .opencode handover state
238 files changed, 13576 deletions(-)
```

问题内容：

- `state.json` 含 `C:\Users\LAUFLO\...`、下载目录、测试项目路径。
- `evidence` 含 `C:\Users\LAUFLO\Videos\...`、`C:\Users\Administrator\...`。
- 72 张 PNG 共 24.03MB，占仓库体积绝大部分。
- 未发现真实 API Key；`sk-test-key-123` 是测试值。

本地 `.opencode` 仍然存在，`AGENTS.md` 和 handover 流程不受影响；只是不再进入 Git。

### 2.3 历史清理范围

需要清理的内容：

| 内容 | 大小 | 是否清理 | 说明 |
|---|---|---|---|
| `.opencode/handover` | 24.6MB | 是 | 本机状态、截图、绝对路径 |
| `docs/brand/explorations` | 10.42MB | 是 | 已确认一并清理；删除前备份到仓库外 |
| `scripts/poc-capture/run.cjs` 绝对路径 | 很小 | 只改当前文件 | 历史中的旧路径不构成高风险，不必为此重写全部历史 |

历史清理不是删除当前文件，而是把所有历史提交中的这些路径移除，然后重写提交历史。

### 2.4 执行前置条件

1. **备份**：`git clone --mirror` 到仓库外，例如 `D:\backup\CineLab-mirror.git`。
2. **确认无协作者依赖**：当前 `forkCount=0`、无 open PR；仍有 15 个已合并 PR，清理后旧链接会失效。
3. **安装 git-filter-repo**：当前未安装（`git filter-repo` 不是 Git 命令）。
4. **临时关闭 main 保护**：当前 `enforce_admins=true`、`allow_force_pushes=false`，force push 会被拒绝。
5. **选择维护窗口**：当前无 open PR、无 fork，适合立即执行；清理期间不要推送；清理后所有本地克隆需要重新 clone。

### 2.5 执行步骤

```bash
# 1. 备份（仓库外）
git clone --mirror https://github.com/LAUFLO/CineLab.git CineLab-mirror.git

# 2. 安装 git-filter-repo
pip install git-filter-repo
# 或 scoop install git-filter-repo

# 3. 确认工作区干净；.opencode 已在 .gitignore
git status

# 4. 重写历史（一并清理设计稿）
git filter-repo --path .opencode --path docs/brand/explorations --invert-paths

# 5. 验证
git log --all -- .opencode          # 应无输出
git rev-list --objects --all | grep .opencode   # 应无输出
git count-objects -vH

# 6. 临时关闭 main 保护后强制推送
git push --force --all
git push --force --tags

# 7. 恢复 main 保护
```

### 2.6 影响与回滚

影响：

- 所有 commit SHA 改变。
- 已合并 PR 的旧 commit 链接可能失效；PR 页面可能仍存在，但关联的 SHA 变化。
- 4 个 tag（`archive/wip-video-operations`、`depth-components-v1`、`local-main-ready`、`vision-components-v1`）会指向新 SHA。
- 其他克隆必须重新 clone。
- GitHub 缓存/搜索引擎不会立即更新。

回滚：

- 使用 mirror 备份恢复：重新 push 备份的 refs，再 force push。
- 回滚同样需要临时关闭分支保护。

### 2.7 验收

- `git clone` 体积从约 26.5MB 降到约 2MB。
- `git log --all -- .opencode` 无输出。
- `git fsck` 通过。
- CI 绿，构建产物正常。
- GitHub 上仓库不再显示 `.opencode` 目录。

### 2.8 公开仓库必备文件

| 文件 | 作用 | 优先级 |
|---|---|---|
| `SECURITY.md` | 漏洞报告方式、支持版本 | P0 |
| `.github/pull_request_template.md` | 文档影响、测试说明、截图 | P1 |
| `CONTRIBUTING.md` | 分支、提交、测试、文档约定 | P1 |
| `.github/ISSUE_TEMPLATE/` | Bug / feature 模板 | P2 |
| `CODEOWNERS` | docs/ 和关键模块 review | P2 |
| `CODE_OF_CONDUCT.md` | 社区行为准则 | P3 |

### 2.9 其他仓库卫生

- 删除已合并的远端分支：`origin/docs/sora-release-handover`、`origin/feat/sora-video`。
- 清理一次性 tag：`archive/wip-video-operations`、`local-main-ready`。
- `scripts/poc-capture/run.cjs` 的 `C:/Users/LAUFLO/...` 改为 `process.cwd()` 或环境变量。
- CI 增加隐私扫描：

```bash
git grep -n -I -E 'C:\\Users|/Users/|Downloads|Desktop' -- . ':!*.png' ':!*.jpg'
```

命中即失败；白名单只允许文档中的脱敏示例。

## 3. Tailwind 决策

### 3.1 当前样式体系

`src/renderer/src/styles/global.css` 第一行：

```css
@import 'tailwindcss';
```

说明 Tailwind 已经启用。但实际代码：

- `global.css` 8,467 行手写 CSS。
- 只有 21 处 Tailwind utility。
- 组件主要使用语义类名，例如 `cnode__toolbar`、`text-editor__panel`。
- `tokens.css` 用 CSS 变量实现明暗双主题。

也就是说，当前是**手写 CSS 为主、Tailwind 为辅**的双轨状态。

### 3.2 Tailwind 的优势

| 优势 | 说明 |
|---|---|
| 设计约束 | utility 强制使用 spacing / color / font 尺度，减少随意值 |
| 无需命名 | 不用纠结 BEM 命名和类名冲突 |
| 按需生成 | 生产 CSS 只包含用到的类，体积可控 |
| 主题能力 | Tailwind 4 的 `@theme` 基于 CSS 变量，可映射现有 tokens |
| 组件内聚 | 样式和结构在同一文件，改组件不用跳 CSS |
| 生态成熟 | 与 React / Vite 集成好，文档和工具链完善 |
| 新代码一致性 | 新组件容易遵循统一尺度，减少重复样式 |

### 3.3 Tailwind 的代价

| 代价 | 说明 |
|---|---|
| JSX 冗长 | 复杂组件类名很长，结构和样式混在一起 |
| 学习曲线 | 维护者需要熟悉 utility 和配置 |
| 动态样式 | 画布节点尺寸、时间线位置、3D 面板参数需要 inline style 或 CSS 变量，Tailwind 不擅长 |
| 存量迁移 | 8,467 行 CSS 全量重写，视觉回归风险高 |
| 双轨期 | 迁移期间两套体系并存，review 和调试成本上升 |
| 调试成本 | DevTools 中类名多，定位样式来源不如语义类名直观 |
| preflight 依赖 | 当前 reset 部分依赖 Tailwind preflight，移除时要补 `base.css` |

### 3.4 对 CineLab 的适配度

| 场景 | Tailwind 适配度 | 说明 |
|---|---|---|
| 设置页、资产库、表单、对话框 | 高 | 静态 UI，utility 收益明显 |
| 节点卡片、画布工具栏 | 中 | 有动态尺寸/缩放，但仍可用 utility + CSS 变量 |
| 时间线、3D 视口、波形 | 低 | 像素级定位、动态计算多，CSS 变量/inline style 更合适 |
| 明暗主题 | 中 | Tailwind 4 可用 `@theme` 映射 tokens，但需要设计 |
| 现有 8,467 行 CSS | 低 | 全量迁移成本高，收益要等 primitives 建立后才明显 |

### 3.5 决策矩阵

已确认选择 **方案 B：分阶段全量迁移 Tailwind**。

| 方案 | 内容 | 成本 | 风险 | 结论 |
|---|---|---|---|---|
| A. 移除 Tailwind | 统一 `tokens.css + primitives + feature CSS` | 0.5–1 天 | 低 | 不采用 |
| **B. 分阶段全量迁移 Tailwind** | 基础层 → 组件层 → 页面层 → 删除旧 CSS | 3–6 周 | 中高 | **已选择** |
| C. 维持现状 | 继续双轨 | 0 | 中 | 不采用 |

### 3.6 决策与执行原则

**决策：全量迁移至 Tailwind。**

Tailwind 在静态 UI、组件化、设计约束方面更有优势；CineLab 的功能页面（设置、资产库、表单、对话框）适合优先迁移，画布/时间线/3D 等动态场景保留 CSS 变量和 inline style，不强行 utility 化。

执行原则：

1. **不一次性重写 8,467 行 CSS**，按 3.7 四阶段推进。
2. **直接全量迁移**：先建立 Tailwind 基础层（`@theme` 映射 tokens、reset、排版），再迁移 primitives 和页面，不设独立试验阶段。
3. **分批验收**：每个阶段独立 PR + 截图对比；如果某一批次出现重大视觉回归或维护成本明显上升，暂停该批次并回到方案 A（移除 Tailwind），在文档中记录原因。
4. **动态画布/时间线保留 CSS 变量**：Tailwind 用于布局、间距、颜色、排版；像素级定位、缩放、3D 参数继续用 CSS 变量/inline style。
5. **迁移期间旧 CSS 只减不增**：新代码不得新增 feature CSS；旧样式随页面迁移删除。

### 3.7 全量迁移：四阶段计划

| 阶段 | 内容 | 验收 |
|---|---|---|
| 1. 基础层 | `@theme` 映射 tokens、reset、排版、Tailwind 入口 | 现有页面视觉不变 |
| 2. 组件层 | 8 个 primitives 全部用 Tailwind + `@theme` | 组件不再写独立 CSS |
| 3. 页面层 | 按“设置 → 资产库 → 剪辑室 → 画布”迁移 | 每批截图对比 |
| 4. 收尾 | 删除旧 CSS、移除未使用类、更新文档 | `global.css` < 2,000 行 |

回滚策略：每个阶段独立分支；保留旧 CSS 直到该页面验收通过；用截图对比和 e2e 防止回归。如果某一批次出现不可接受的视觉回归，按 3.8 回滚到方案 A。

### 3.8 回滚方案：移除 Tailwind

仅在迁移过程中出现不可接受风险或明确放弃 Tailwind 时执行：

1. 删除 `global.css` 第一行 `@import 'tailwindcss'`。
2. 删除 `electron.vite.config.ts` 中的 `tailwindcss()` 插件。
3. 删除 `package.json` 的 `tailwindcss`、`@tailwindcss/vite`。
4. 把必要的 preflight reset 复制到 `base.css`。
5. 替换 21 处 utility 为普通类。
6. 跑 build + 截图对比。

## 4. 文档治理

### 4.1 现状

`scripts/check-docs.mjs` 目前只检查：

1. 17 份“现行文档”是否有日期/状态/适用版本头。
2. Markdown 链接是否存在。
3. `docs/README.md` 是否收录所有文档。
4. Agent 工具数量和名称是否与 `src/main/agent/tools.ts` 一致。

不检查：

- 版本戳是否过期。
- 文档引用的代码路径是否存在。
- 测试数量、工具数量、技术栈是否与代码一致。
- “现行文档”和“历史文档”的分类是否正确。
- 文档描述的功能是否已经删除或改名。

### 4.2 漂移证据

| 问题 | 证据 |
|---|---|
| 版本戳过期 | 18 份文档写 `main @ b76a064`，当前 `HEAD` 落后 18 个提交 |
| 引用失效 | skills-plan、agent-rollout-plan、depth-runtime-windows-check 三个引用不存在（已在本轮修复） |
| 数字过期 | `docs/architecture.md`、`docs/roadmap-plan.md` 写 42 文件 / 312 用例，实际 43 / 317 |
| 技术栈失真 | `README.md` 写 Tailwind CSS 4，实际只有 21 处 utility |
| 分类冲突 | `CURRENT_DOCS` 有 17 份，README 现行表只有 8 份 |

### 4.3 文档分级

保留现有头部格式，不强制 YAML frontmatter：

```text
日期：2026-11-13
状态：现行
适用版本：v0.1.0
最后核对：2026-11-13
```

| 状态 | 规则 |
|---|---|
| 现行 | 必须通过路径、数字、工具清单、链接、元数据检查 |
| 历史 | 不校验内容，只校验归档日期和原因 |
| 草案 | 允许过期，但必须有 owner 和复核日期 |

已完成的 plan（agent-phase3、clip-studio、agent-generation-* 等）转为历史，从 `CURRENT_DOCS` 移出。现行文档从 17 份降到约 8 份。

### 4.4 版本戳

不再手写 `main @ <sha>`：

- `适用版本` 跟 release tag（当前 `v0.1.0`）。
- `最后核对` 是人工确认日期。
- CI 对超过 30 天或落后 release 的文档输出 warning，不阻塞。
- 发布时统一刷新，不要求每次提交都改 18 份文档。

### 4.5 check-docs 升级

| 检查 | 规则 | 级别 |
|---|---|---|
| 元数据 | 状态枚举、日期格式、适用版本格式 | error |
| 链接 | Markdown 链接存在 | error |
| 索引 | 所有 docs 被 README 收录 | error |
| 路径引用 | 文档中的 `src/`、`docs/`、`.github/` 路径存在 | error |
| 数字 | 工具数、测试文件数、用例数、provider 数一致 | error |
| 分类 | 现行必须在 README 现行表；历史不在 CURRENT_DOCS | error |
| 版本 | `最后核对` 超过 30 天或落后 release | warning |
| 隐私 | 绝对路径、用户名、下载目录、测试 key | error |

### 4.6 生成式投影

| 内容 | 来源 |
|---|---|
| `docs/README.md` 索引 | 扫描文档头部生成 |
| Agent 工具清单 | `src/main/agent/tools.ts` |
| 测试文件/用例数 | `vitest --reporter=json` |
| 技术栈版本 | `package.json` |
| 架构文件列表 | 校验存在性 |

能自动生成的不要手写；不能生成的就写“最后核对日期”。

### 4.7 PR 流程

- `.github/pull_request_template.md` 增加“文档影响”勾选。
- `docs/doc-impact.md` 维护代码路径 → 文档映射：
  - `src/main/ipc/**` → `architecture.md`
  - `src/shared/*schema*` → `architecture.md` / `models.md`
  - `src/main/agent/tools.ts` → `agent-capabilities.md`
  - `src/renderer/src/styles/tokens.css` → `ui-spec.md`
  - `package.json` → `README.md`
- CI 输出提示，不阻塞。
- Definition of Done：功能 PR 必须更新对应现行文档，或写 `docs: n/a` + 原因。

### 4.8 发布归档

每次 release：

1. 刷新 current 文档的 `适用版本` / `最后核对`。
2. 已完成的 plan 转历史。
3. 重新生成索引和数字。
4. 输出“本月文档漂移报告”。

## 5. 安全

### 5.1 P0 修复

| 问题 | 位置 | 修法 | 验收 |
|---|---|---|---|
| Markdown XSS | `src/renderer/src/canvas/nodes/text-markdown.ts` 及 3 处 `dangerouslySetInnerHTML` | `DOMPurify.sanitize`，限制标签/属性 | XSS payload 不执行 |
| 生产 CSP 过宽 | `src/renderer/index.html` | 生产去掉 `unsafe-inline` / `unsafe-eval`；补 `object-src 'none'` / `base-uri 'none'` | 控制台无 CSP 违规 |
| 外链任意协议 | `src/main/window.ts` | 只允许 `http:` / `https:`；增加 `will-navigate`；权限默认拒绝 | `file://` / `javascript:` 被拒 |
| Range 全文件读 | `src/main/protocol.ts` | `createReadStream` → `Readable.toWeb()`；校验边界；CORS 收紧 | 500MB 视频 seek 内存平稳 |
| extract-zip 两个 high | `src/main/components/installer.ts` | 换 `yauzl` 或封装：拒绝 symlink、校验 entry 路径、限制大小 | `pnpm audit --prod` 0 high |
| 导出泄露会话 | `src/main/export/project-export.ts` | 默认排除 `.cinelab/agent`；可选“包含对话” | 导出 zip 无 sessions |
| IPC 参数校验 | `src/main/ipc/*` 165 handler | 统一 wrapper + zod 关键通道 | 非法参数结构化错误 |
| Electron Fuses | `electron-builder.yml` | `OnlyLoadAppFromAsar`、`RunAsNode: false` 等 | 打包检查通过 |
| Windows 签名 | 发布流程 | 配代码签名，或明确风险 | SmartScreen 可接受 |

### 5.2 P1 加固

- `window.api` 按窗口/能力拆分，缩小 XSS 可达面。
- `app:log`、`clipboard:read` 加来源限制。
- `SECURITY.md`。
- CI 隐私扫描。
- 依赖安全更新（Dependabot）。

### 5.3 安全验收

- XSS / 外链 / Range / zip slip 四类回归测试。
- `pnpm audit --prod` 0 high。
- 生产 CSP 无 `unsafe-eval`。
- 导出 zip 不含 `.cinelab/agent`。

## 6. 性能

### 6.1 优化项

| 优化 | 位置 | 做法 | 预期 |
|---|---|---|---|
| three.js 首屏加载 | `src/renderer/src/App.tsx` | `React.lazy` + 条件渲染 | 首屏减 1.26MB |
| Range 全文件读 | `src/main/protocol.ts` | 流式响应 | seek 不 OOM |
| React Flow 全量渲染 | `src/renderer/src/canvas/Canvas.tsx` | `onlyRenderVisibleElements` + `memo` | 大画布帧率 |
| 撤销栈全量克隆 | `src/renderer/src/stores/canvas.ts` | 增量命令 / immer patches | 操作不卡 |
| 缩略图串行 | `src/main/library/store.ts` | 并发池 + 占位图 | 大资产库首开 |
| 会话全量扫描 | `src/main/agent/session.ts` | header 索引 | 历史面板 O(1) |
| 自动保存全量 JSON | `src/renderer/src/stores/project.ts` | 分片/增量 | 保存抖动 |
| 列表无虚拟化 | `AssetGrid` / Agent 消息 / 历史 | `@tanstack/react-virtual` | 1000+ 项 |

### 6.2 基线

优化前先记录：

- 启动到可交互时间。
- 首屏 JS/CSS 体积（gzip）。
- 500 节点画布拖动帧率。
- 500MB 视频 seek 内存。
- 资产库 1000 项首屏时间。

写入 `docs/performance-baseline.md`，每项优化前后对比。

### 6.3 性能目标

- 首屏 gzip < 800KB。
- 启动 < 2s。
- 500 节点拖动 > 50fps。
- 500MB 视频 seek 内存 < 100MB。
- 1000 项资产库首屏 < 500ms（缩略图异步）。

## 7. 测试

### 7.1 现状

| 层 | 现状 | 目标 |
|---|---|---|
| shared 纯函数 | 27 文件，较好 | 保持 |
| main 服务 | 15 文件 | 补 protocol/project/library/timeline-export |
| renderer | 1 文件 | 补 primitives + 关键面板 |
| IPC contract | 无 | 通道集合一致性 |
| e2e | 无 | 3 条关键链路 |
| 安全回归 | 无 | XSS/路径/Range/zip |

### 7.2 补测清单

1. `src/main/protocol.ts`：Range 边界、路径穿越、CORS。
2. `src/main/project/manager.ts`：schema 校验、原子写、异常恢复。
3. `src/main/library/store.ts`：缩略图、删除、路径。
4. `src/main/ipc/*`：165 个 handler 参数边界（wrapper 后统一测）。
5. `src/main/agent/runtime.ts`：回合、取消、确认、恢复。
6. `src/renderer/src/components/ui/*`：primitives 渲染/交互。
7. e2e：打开项目 → mock 生成 → 保存/导出。

### 7.3 覆盖率

- 接入 `@vitest/coverage-v8`，先跑基线。
- 初始门槛：全局 45%；shared 与安全路径 80%；新增文件 70%。
- 每月提升 3–5 个百分点，不追求数字。

### 7.4 e2e

- Playwright `_electron` 启动开发版或打包版。
- 只跑关键链路：打开项目、mock 生成、保存、导出。
- CI 在 Windows 上跑 smoke，失败截图。

## 8. UI 与公共组件

### 8.1 根因

不是“没提前做组件”，而是三缺一：

- 有 `tokens.css`，但没有 primitives。
- 有 8,467 行全局 CSS，但基础样式和业务样式混在一起。
- 没有 ESLint，组件库会被新代码绕过。

### 8.2 组件清单

| 组件 | 替代 |
|---|---|
| `Button` / `IconButton` | 209 处 `btn-*` |
| `Input` / `Textarea` / `NumberInput` | 各处手写 |
| `Select` / `Combobox` | 38 处原生 select |
| `Switch` | 7 处重复 Toggle |
| `Dialog` / `ConfirmDialog` | 237 处 dialog/modal |
| `Menu` / `Popover` / `Tooltip` | 各处浮层 |
| `Field` / `SettingRow` | 设置页重复布局 |
| `Toast` / `EmptyState` / `Skeleton` | 反馈不统一 |

后续补 `Tabs`、`Badge`、`Card`、`VirtualList`、`Resizable`。

### 8.3 样式分层

```text
styles/
  tokens.css       变量
  base.css         reset / 排版
  primitives.css   基础组件
  features/*.css   业务页面
```

规则：

- 业务 CSS 不得定义基础组件变体。
- 基础组件不得引用业务类名。
- 组件样式优先 CSS Modules 或 `ui-` 前缀。

### 8.4 迁移策略

1. 先做 8 个 primitives。
2. 新代码强制使用（ESLint）。
3. 旧代码按“设置页 → 资产库 → 剪辑室 → 画布节点”分批迁移。
4. 每批配 Playwright 截图对比。
5. 迁移完删旧 CSS，预计 `global.css` 减 30–40%。

### 8.5 ESLint 规则

```text
no-restricted-syntax:
  - <select> 原生元素 → 用 components/ui/Select
  - style={{...}} → 仅允许动态值白名单
  - dangerouslySetInnerHTML → 仅白名单文件
自定义:
  - 禁止 TSX 中硬编码 #[0-9a-f]{3,8}
  - 单文件 > 500 行 warning，> 800 行 error
```

落地策略：先全量 warn，新文件 error；分目录逐步收紧。

### 8.6 验收

- 原生 select：38 → 0
- 重复 Toggle：7 → 0
- TSX 硬编码色值：53 → 0
- 内联 style：46 → <10
- `global.css`：8,467 → <5,000 行
- 公共组件覆盖交互元素 > 80%

## 9. 架构与可维护性

| 文件 | 行数 | 拆法 |
|---|---|---|
| `src/main/agent/tools.ts` | 3,286 | 按域拆 `tools/canvas.ts`、`timeline.ts`、`stage.ts`、`film.ts`、`generation.ts`、`skills.ts` |
| `src/renderer/src/stores/canvas.ts` | 2,650 / 110 actions | slices：nodes、edges、selection、history、groups、viewport、clipboard |
| `src/renderer/src/canvas/PromptBar.tsx` | 1,804 | 容器、引用选择、模型参数、提交逻辑、弹层 |
| `src/renderer/src/agent/AgentPanel.tsx` | 1,471 | 消息列表、输入框、会话菜单、提案卡、确认卡 |
| `src/renderer/src/studio/InspectorPane.tsx` | 1,376 | 属性/画面/音频 Tab |

原则：

- 单文件 > 500 行进入 review 讨论，> 800 行必须拆。
- 拆文件前先补测试，再移动代码。
- 一个 PR 只做一件事，避免“重构 + 修 bug”混在一起。

## 10. 路线图

### P0：止血（2–3 天）

| # | 任务 | 产出 |
|---|---|---|
| 1 | 仓库保持 Public；补 SECURITY.md | 开源边界 |
| 2 | `.opencode` 停止跟踪 + 隐私扫描 | 已完成本地 commit，待 push |
| 3 | Markdown sanitize + 生产 CSP + 外链白名单 | 安全 PR |
| 4 | `protocol.ts` 流式 Range + CORS | 性能/安全 PR |
| 5 | 导出排除 `.cinelab/agent` | 隐私 PR |
| 6 | 替换/封装 `extract-zip` | 依赖 PR |
| 7 | 修 3 个失效文档引用 + 312→317 + plan 归档 | 文档 PR |
| 8 | 历史清理（`.opencode`） | 维护窗口执行 |

### P1：门禁（1 周）

| # | 任务 |
|---|---|
| 9 | ESLint + Prettier + editorconfig |
| 10 | CI 加 lint / audit / coverage / 隐私扫描 |
| 11 | 升级 `check-docs`（路径/数字/版本/分类） |
| 12 | PR 模板 + `docs/doc-impact.md` + Definition of Done |
| 13 | SECURITY.md + Dependabot |
| 14 | Release workflow（tag → Release + SHA256） |
| 15 | PR 与 main 构建分层 |

### P2：UI 基础设施（2–3 周）

| # | 任务 |
|---|---|
| 16 | 8 个 primitives + 样式分层 |
| 17 | 迁移设置页（12 个原生 select、多个 Toggle） |
| 18 | 迁移资产库 + 剪辑室 |
| 19 | 视觉回归截图 |
| 20 | Tailwind 四阶段全量迁移（基础层 → primitives → 页面 → 收尾） |

### P3：架构与测试（1–2 个月）

| # | 任务 |
|---|---|
| 21 | 拆 `tools.ts` / `canvas.ts` / `PromptBar` / `AgentPanel` |
| 22 | lazy load Studio/Stage/three |
| 23 | React Flow 视口裁剪、撤销栈增量、虚拟列表 |
| 24 | 缩略图并发、会话索引、自动保存分片 |
| 25 | 补 protocol/project/library/IPC/runtime 测试 |
| 26 | Playwright e2e 3 条链路 |
| 27 | 覆盖率基线 + 每月提升 |

## 11. 验收指标

| 维度 | 指标 | 当前 | 目标 |
|---|---|---|---|
| 安全 | `pnpm audit --prod` high | 2 | 0 |
| 安全 | XSS/外链/Range/zip 回归 | 0 | 4 类 |
| 仓库 | `.opencode` 跟踪文件 | 237 | 0 |
| 仓库 | 个人绝对路径 | 多处 | 0 |
| 仓库 | clone 体积 | 26.5MB | < 3MB |
| 文档 | 现行文档路径失效 | 3 | 0 |
| 文档 | 版本戳过期 | 18/18 | 0 或 warning |
| 文档 | 测试数字一致 | 312 vs 317 | 自动生成 |
| 测试 | 覆盖率 | 未测 | 基线 + 每月 +3% |
| 测试 | renderer 测试文件 | 1 | > 10 |
| UI | 原生 select | 38 | 0 |
| UI | 重复 Toggle | 7 | 0 |
| UI | TSX 硬编码色值 | 53 | 0 |
| UI | `global.css` 行数 | 8,467 | < 5,000 |
| 性能 | 首屏 gzip | 约 700KB + three | < 800KB 总 |
| 性能 | 启动到可交互 | 未测 | < 2s |
| 性能 | 500 节点拖动 | 未测 | > 50fps |
| 性能 | 500MB 视频 seek 内存 | 全文件读 | < 100MB |
| 工程 | PR 质量门 | 5 项 | 7 项（+lint +audit） |
| 发布 | 自动 Release | 手动 | tag 自动 |

## 12. 风险与回滚

| 风险 | 应对 |
|---|---|
| 历史清理重写 SHA | 先 mirror 备份；维护窗口；临时关闭分支保护；清理后重新 clone |
| 已合并 PR 链接失效 | 提前公告；保留备份；必要时在 README 说明 |
| `.opencode` 不入库后跨机器无法接续 | 单人单机不受影响；需要时用脱敏 `docs/handover/` |
| lint 全量开启报错太多 | 先 warn、新文件 error、分目录收紧 |
| 组件库迁移大爆炸 | 按页面分批，每批独立 PR + 截图对比 |
| Tailwind 迁移视觉回归 | 分批迁移；截图对比；旧 CSS 保留到验收 |
| 文档版本迁移成本 | 保留现有头部，只加字段；脚本批量替换 |
| 性能优化凭感觉 | 先建基线，再优化，每项前后对比 |
| 拆文件引入回归 | 先补测试再移动代码，单 PR 只做一件事 |

## 13. 待确认

1. **Tailwind 迁移排期**：四阶段全量迁移的起止时间与每批页面范围。
2. **历史清理窗口**：何时执行？是否一并清理 `docs/brand/explorations`？
3. **分支保护**：是否授权临时关闭 `main` 保护以执行 force push？
4. **e2e 与覆盖率**：是否引入 Playwright 和覆盖率门槛？
5. **文档 release 版本**：当前用 `v0.1.0`，还是等下一个版本号？
6. **公开仓库文件**：是否本轮补 `SECURITY.md`、PR 模板、CONTRIBUTING？

## 附录 A：历史清理检查清单

- [ ] mirror 备份完成
- [ ] 工作区干净
- [ ] `.opencode` 已在 `.gitignore`
- [ ] `git filter-repo` 已安装
- [ ] 确认无 open PR / fork
- [ ] 临时关闭 main 保护
- [ ] 执行 filter-repo
- [ ] `git log --all -- .opencode` 无输出
- [ ] `git fsck` 通过
- [ ] force push 所有分支和 tag
- [ ] 恢复 main 保护
- [ ] 重新 clone 验证体积
- [ ] CI 绿

## 附录 B：文档检查项

- [ ] 元数据：日期、状态、适用版本、最后核对
- [ ] 链接存在
- [ ] 索引收录
- [ ] 反引号路径存在
- [ ] 工具数量/名称一致
- [ ] 测试文件/用例数一致
- [ ] 现行/历史分类一致
- [ ] 版本落后 warning
- [ ] 隐私扫描

## 附录 C：公共组件清单

- Button / IconButton
- Input / Textarea / NumberInput
- Select / Combobox
- Switch
- Dialog / ConfirmDialog
- Menu / Popover / Tooltip
- Field / SettingRow
- Toast / EmptyState / Skeleton
- Tabs / Badge / Card / VirtualList / Resizable（后续）
