# CineLab 模型适配体系方案

日期：2026-11-21
状态：实施中（S0 代码完成；Agnes 首帧已复测；S1 契约与 golden 已实施）
适用版本：v0.4.0

## 1. 背景

最近几轮模型适配反复出现阻塞：

- Agnes 首帧收到 data URL，首帧没有生效；
- MiniMax H3 首尾帧没有发送 `role`，两张图无法区分；
- http-template 只有 data URL 变量，无法表达纯 base64；
- 首尾帧校验分散在 PromptBar、主进程和适配器三处；
- 缺少请求体契约测试，错误只能等真实生成才暴露；
- 模型元数据有官方文档、实测和推断，但没有来源和置信度区分。

根因不是“模型太多”，而是缺少一层**模型适配契约**：能力声明只描述“能做什么”，没有描述“媒体怎么传、字段叫什么、首尾帧怎么区分、限制是什么”。

本方案把首尾帧修复、媒体载荷、模型配置、外部 Agent 适配和本地适配器统一成一套体系。

## 2. 目标与原则

目标：

- 首帧、尾帧可靠生效，不再静默降级；
- 同协议族的新模型尽量只改配置，不改代码；
- 官方维护核心协议族和默认体验；
- 用户可以把官方文档交给外部 Agent，由 Agent 直接生成/修改本地适配器；
- 用户适配器写完即可直接使用，不经过信任门或启用开关；
- 官方功能保持完整、测试、迁移和回滚。

原则：

1. **官方与用户分层**：官方对内置功能负责；用户适配器是完全信任的本地代码，官方不承诺其质量或安全。
2. **声明式优先**：能用配置/模板解决，就不写代码。
3. **协议族复用**：适配单位是协议族，不是单个模型。
4. **本地完全信任**：用户适配器拥有 CineLab 应用权限，不设沙箱、不设信任弹窗、不设启用开关。
5. **单一契约**：模型能力、字段、格式、角色、限制只有一份定义。
6. **单一校验**：UI、主进程和 Agent 提案共用同一套首尾帧规则。
7. **UI 不按模型特判**：PromptBar 只消费契约，不写供应商分支。
8. **官方可回滚，用户错误可见**：官方功能有测试和回滚；用户适配器加载失败只显示错误，不阻塞应用。

## 3. 总体架构

```
用户 / 外部 Agent
      │  官方文档、模型信息
      ▼
外部 Agent（Cursor / Claude Code / 任意 Agent）
      │  直接写本地适配器目录或 models.json
      ▼
AdapterRegistry（统一加载官方 + 本地）
  ├─ 官方内置适配器（代码）
  ├─ 本地可信适配器（adapter.ts / adapter.js，utilityProcess）
  └─ L4 Sidecar（可选，本地 HTTP 服务）
      │
      ├─ L1 配置：models.json + protocol
      ├─ L2 模板：完整 http-template DSL
      ├─ L3 本地可信适配器：完整 Node，utilityProcess 执行
      └─ L4 Sidecar：本地 HTTP 服务，CineLab 不执行其代码
      ▼
MediaInput / LoadedRef（dataUrl / base64 / binary + mime）
      ▼
生成队列 → 适配器 → 供应商 API
```

一句话：**一个契约、两层载荷、四级接入、完全信任的本地适配器。**

## 4. 核心契约

`ModelContract` 同时服务配置校验、适配器取字段、PromptBar 渲染和官方契约测试。

```ts
interface ModelContract {
  provider: string
  adapter: string
  apiVersion: string

  fields: {
    firstFrame?: string
    lastFrame?: string
    referenceImage?: string
  }

  transports: {
    keyframe: 'data-url' | 'base64' | 'url'
    referenceImage: 'data-url' | 'base64' | 'url'
  }

  roles: {
    firstFrame: string
    lastFrame: string
  }

  limits: {
    maxImageBytes: number
    maxRequestBytes: number
    minWidth?: number
    maxWidth?: number
    minAspect?: number
    maxAspect?: number
  }

  modes: ModelModeId[]

  source: {
    url: string
    retrievedAt: string
    confidence: 'high' | 'medium' | 'low'
    notes?: string
  }
}
```

协议族提供默认值，模型只覆盖差异：

```ts
const AGNES_VIDEO = {
  fields: { firstFrame: 'first_frame', lastFrame: 'last_frame' },
  transports: { keyframe: 'base64' },
  roles: { firstFrame: 'first_frame', lastFrame: 'last_frame' }
}
```

同协议族的新模型只写：

```ts
{
  id: 'agnes-video-3.0',
  adapter: 'agnes-video',
  contract: AGNES_VIDEO,
  modes: ['t2v', 'first-frame', 'first-last'],
  overrides: { limits: { maxImageBytes: 30 * 1024 * 1024 } }
}
```

## 5. 媒体载荷

主进程一次性读取本地文件，生成统一载荷：

```ts
interface LoadedRef {
  dataUrl: string   // data:image/png;base64,...
  base64: string    // 去掉 data URL 前缀
  mime: string      // 小写，image/jpg -> image/jpeg
  role: string
  media: 'image' | 'audio'
}
```

外部媒体统一抽象为：

```ts
type MediaInput =
  | { type: 'url'; url: string }
  | { type: 'base64'; data: string; mimeType: string }
  | { type: 'binary'; data: Uint8Array; mimeType: string }
```

适配器只从 `LoadedRef` 取用，不再自己切前缀。

## 6. 各供应商现状与格式

| 模型 | 字段 | 官方接受 | 项目现状 | 结论 |
|---|---|---|---|---|
| Agnes Video 2.5 Flash | `first_frame` / `last_frame` | 官方只保证公网 URL；纯 base64 为实测可用 | 已改纯 base64 | 保留，标注非官方兼容 |
| Kling | `image` / `image_tail` | 纯 base64 | 已正确 | 复用统一 helper |
| MiniMax H3 | `content[]` + `role` | data URL、公网 URL、`mm_file://` | data URL 正确，**缺 role** | 补 `role` |
| 火山 Seedance 2.5 | `image_url.url` + `role` | data URL、公网 URL、`asset://` | 已正确 | 保持 |
| Sora | multipart `input_reference` | 文件上传 | 已正确 | 保持 |
| OpenAI 兼容 | `image_url.url` | data URL | 已正确 | 保持 |
| http-template | `{{refs.firstFrame}}` 等 | 由模板决定 | 旧变量为 data URL | 语义改为纯 base64，新增 DataUrl 变量 |

官方限制：

- MiniMax H3：单图 ≤30 MB，请求体 ≤64 MB，宽高 256–5760 px，宽高比 0.4–2.5。
- 火山 Seedance 2.5：单图 <30 MB，请求体 ≤64 MB，宽高 300–6000 px，宽高比 0.4–2.5。
- Agnes keyframe 官方未单列限制，保守沿用 reference 的 15 MB / 50 MB / 256–5760 px。

## 7. 首尾帧规则

扩展现有 `src/shared/reference-inputs.ts`，UI、主进程和 Agent 提案共用：

- `first-frame`：恰好 1 张图片；不允许尾帧、参考图、参考音频、参考视频。
- `first-last`：恰好 2 张图片，第一张 `firstFrame`，第二张 `lastFrame`；不允许参考图/音频/视频。
- `reference`：不允许 `firstFrame` / `lastFrame`，图片走参考图数组。

PromptBar 只负责角色分配，主进程二次校验；不允许静默回退成文生视频或参考图。

## 8. http-template 变量契约

这是一次破坏性变更：

- `{{refs.firstFrame}}` / `{{refs.lastFrame}}`：从 data URL 改为**纯 base64**；
- 新增 `{{refs.firstFrameDataUrl}}` / `{{refs.lastFrameDataUrl}}`：需要 data URL 的模板使用；
- 新增 `{{refs.firstFrameMime}}` / `{{refs.lastFrameMime}}`。

迁移策略：

- 不自动改写用户模板；
- 设置页模型编辑处检测到旧变量时，显示一次性警告：「变量含义已变，需要 data URL 请改用 `{{refs.firstFrameDataUrl}}`」；
- 文档提供迁移示例；
- 旧模板可继续使用，但需要用户手动调整。

## 9. 能力白名单

每个适配器声明自己支持什么：

```ts
adapterContract = {
  modes: ['t2v', 'first-frame', 'first-last', 'reference'],
  transports: { keyframe: ['data-url', 'base64'] },
  roles: ['firstFrame', 'lastFrame', 'reference'],
  limits: { ... }
}
```

官方模型配置只能在这个白名单里组合；官方能力审计在保存/启动时执行，禁止出现：

- 配置声明了 adapter 不支持的模式；
- 配置声明了首尾帧，但适配器没有对应字段；
- UI 能选，生成时才报错。

用户适配器不做契约测试和真实生成门槛；它们可以声明任意能力，错误由用户自己承担。

## 10. 四级接入

| 级别 | 形式 | 适用 | 执行方式 | 安全边界 |
|---|---|---|---|---|
| L1 配置 | `models.json` + `protocol` | 同协议族新模型 | 官方内置适配器 | 官方维护 |
| L2 模板 | 完整 `http-template` DSL | 声明式 HTTP 协议 | 主进程模板执行器 | 官方维护 |
| L3 本地可信适配器 | `adapter.ts` / `adapter.js` | 复杂协议、私有网关、本地模型 | `utilityProcess`，完整 Node/npm/native | 无沙箱，完全信任 |
| L4 Sidecar | 本地 HTTP 服务 | 企业私有协议、其他语言、需要隔离 | CineLab 只连端点 | 不执行用户代码 |

优先级：**L1 → L2 → L3 → L4**。  
L3 不再是“沙箱插件”，而是“完全信任的本地适配器”；需要隔离时用 L4。

## 11. 本地可信适配器工作区

不做插件市场、作者、签名、审核、开发者模式和启用开关。适配器目录存在即自动加载。

目录：

```text
<userData>/adapters/<id>/
  manifest.json
  models.json
  template.json      # L2 可选
  adapter.ts         # L3 可选
  adapter.js         # L3 可选，预构建
  tests/             # 可选，供外部 Agent 调试
  README.md          # 来源、官方文档、备注
```

最小 manifest：

```json
{
  "id": "agnes-video-3",
  "version": "0.1.0",
  "type": "config | template | code",
  "entry": "adapter.ts",
  "models": "models.json",
  "tests": ["tests/first-frame.json"]
}
```

没有 `permissions` 字段。适配器拥有 CineLab 应用权限，manifest 里的权限声明没有意义。

加载规则：

- 目录存在即注册，不需要启用；
- 监听文件变化，自动重新构建/重载；
- 构建失败、manifest 缺失、entry 不存在：只标记错误和日志，不阻塞应用；
- 同名模型 ID：本地适配器优先于官方内置，界面标注「本地适配器」；
- `adapter.ts` 由 CineLab 用 esbuild 按 Node target 构建；`adapter.js` 直接加载；
- 支持 Node/npm/native；原生模块由适配器自己安装并匹配 Electron ABI，CineLab 不负责编译；
- L3 适配器运行在 `utilityProcess`，完整 Node，享有应用权限，但崩溃不影响主进程。

## 12. 外部 Agent 工作流

模型适配由外部 Agent 负责，CineBot 不参与。

1. 用户把模型的官方文档交给 Cursor / Claude Code / 任意 Agent。
2. Agent 读本地规范：目录结构、manifest、models.json、adapter 接口、测试格式。
3. Agent 判断 L1/L2/L3/L4：
   - 同协议族 → 写 `models.json`；
   - 声明式 HTTP → 写 `template.json`；
   - 复杂协议 → 写 `adapter.ts`；
   - 需要隔离/其他语言 → 写 sidecar 说明。
4. Agent 写入 `<userData>/adapters/<id>/`。
5. CineLab 监听变化，自动构建、加载、热重载。
6. 构建/加载失败：设置页显示错误和日志，不阻塞应用。
7. 用户回到画布，模型列表里直接出现，立即可用。
8. 不满意：删除适配器目录，或让 Agent 继续修改。

外部 Agent 的辅助工具（可选，不是门槛）：

- `cinelab adapter build <id>`
- `cinelab adapter reload <id>`
- `cinelab adapter logs <id>`
- `cinelab adapter test <id>`（可选调试，不影响加载）

`tests/` 不是启用门槛，只是给 Agent 和用户排查问题的工具。

## 13. 官方与用户责任

| 范围 | 谁负责 | 支持等级 |
|---|---|---|
| 媒体载荷、首尾帧校验、官方适配器、契约测试 | 官方 | 官方支持 |
| OpenAI 兼容、Agnes、火山 Seedance、可灵、MiniMax、Sora | 官方 | 官方支持 |
| 内置协议模板库 | 官方 | 官方支持 |
| 默认模型清单、参数预设、官方文档来源 | 官方 | 官方支持 |
| 本地适配器、私有网关、本地模型、ComfyUI | 用户/外部 Agent | 本地适配器，不承诺官方质量 |
| 复杂签名、SSE、分片、多阶段回调 | 用户/外部 Agent | 本地适配器或 sidecar |

官方不再逐个模型发版，只维护协议族、核心适配器和默认体验；长尾交给用户/外部 Agent。高质量用户适配可以按需收编为官方支持，但不是义务。

支持等级只有两档：

- **官方支持**：内置、契约测试、真实 smoke、文档/来源/回归。
- **本地适配器**：自动加载、完全信任、无测试门槛、不承诺官方质量。

## 14. 官方模型更新节奏

官方要主动适配，但不是每个新模型都跟。官方维护「协议族 + 官方支持模型清单」，重点模型即时跟进，变体和长尾交给用户/外部 Agent。

### 14.1 节奏

| 周期 | 做什么 | 产出 |
|---|---|---|
| 每 1–2 周 | 巡检主流厂商文档：新模型 ID、参数、限制、字段变化 | 更新 `models.json` 默认清单和协议模板；同协议族不发核心代码 |
| 每月 | 评估新 API / 新能力：是否需要 L2 模板扩展或 L3/L4 | 决定是否新增协议适配 |
| 每季度 | 评审「官方支持模型清单」：保留、降级、归档 | 更新能力清单、文档、支持等级 |
| 事件驱动 | 核心厂商大版本（Seedance 3.0、Kling 5.0、Sora 3、Agnes 4.0 等） | 即时评估，不固定等周期 |

### 14.2 适配分级

| 级别 | 官方做什么 | 例子 |
|---|---|---|
| P0 核心协议族 | 维护 adapter、字段映射、错误处理、契约测试 | OpenAI 兼容、Agnes、火山、可灵、MiniMax、Sora |
| P1 主流模型 | 更新默认模型清单、参数、限制、文档 | Seedance 新版本、可灵新变体、Agnes Flash/Pro |
| P2 新能力 | 评估是否需要 L2/L3/L4 | 首尾帧+参考混合、音频驱动、视频编辑/延长 |
| P3 长尾/变体 | 不主动追，交给用户/外部 Agent | 区域站、中转站、私有网关、冷门模型 |

### 14.3 官方适配 SOP

1. **发现**：厂商文档订阅、定期巡检、用户反馈、Agent 适配记录。
2. **分级**：核心 / 主流 / 长尾。
3. **判断**：同协议族 → 只改配置；字段/轮询变化 → 模板或 adapter；新能力 → 契约 + UI；私有协议 → sidecar。
4. **更新**：配置、模板或适配器。
5. **测试**：mock 请求体快照；免费或低成本模型做真实 smoke test；不对所有模型自动发起付费生成。
6. **发布**：随版本或模型清单更新，标注支持等级。
7. **复盘**：季度清理过时模型，避免永久兼容拖累。

### 14.4 支持等级

- **官方支持**：随版本测试，API 变更由官方跟进。
- **本地适配器**：用户/外部 Agent 自己维护，不承诺官方质量和安全。
- 官方模型下架后从默认清单移除；不保留“归档/实验性”选项。

### 14.5 与实施阶段的关系

S1/S2 建好后，官方更新从「每个模型写代码」转为「更新协议族契约、默认模型清单和契约测试」。用户/外部 Agent 可以先通过 L1 配置或 L3 适配器接入新模型。

官方不承诺所有新模型第一时间支持；承诺的是核心协议族和主流模型有节奏更新。

## 15. 模型配置最终流程

```
设置 → 模型服务
  ├─ A. 官方支持模型
  │    选择供应商 → 填 Key → 选模型 → 直接可用
  └─ B. 本地适配器
       外部 Agent 写 adapters/<id>/
              ↓
       CineLab 自动发现、构建、加载
              ↓
       成功：模型直接出现在列表
       失败：显示错误和日志，不阻塞应用
```

没有开发者模式、没有启用开关、没有信任弹窗。

## 16. 实施阶段

| 阶段 | 内容 | 状态 |
|---|---|---|
| S0 | 视频首尾帧 P0–P2：`LoadedRef`、MiniMax `role`、Agnes/Kling、校验、http-template 变量、设置页警告 | 代码完成；Agnes 首帧真实复测通过（SSIM 0.889），MiniMax / http-template 待复测 |
| S1 | `ModelContract`、能力白名单、协议族模板、官方 golden 请求体测试 | 已实施：8 个官方适配器契约、契约缺口、保存校验与 golden 请求体 |
| S2 | 本地适配器 registry、目录监听、esbuild Node 构建、utilityProcess 宿主、CLI、自动加载/热重载 | 待实施 |
| S3 | L2 `http-template` 完整声明式 HTTP：条件字段、对象/数组映射、multipart、签名 header、动态轮询/状态/错误映射、同步/异步、结果数组 | 待实施 |
| S4 | L4 sidecar：OpenAI 兼容 + 自定义 manifest、健康检查、版本、日志 | 按需 |
| S5 | 可选的本地导入/导出；不做插件市场 | 长期 |

S0 先完成并单独发布；S1 吸收 S0 的真实适配经验；S2 让外部 Agent 闭环；S3 补齐 L2 完整能力。

## 17. 影响模块

- `src/main/providers/media.ts`：`LoadedRef` 与媒体 helper
- `src/main/engine/start-generation.ts`：`loadRefs`、MIME 规范化
- `src/main/providers/agnes.ts`、`kling.ts`、`minimax.ts`、`volcengine.ts`、`sora.ts`、`http-template.ts`、`model-body.ts`
- `src/shared/reference-inputs.ts`：首尾帧校验
- `src/shared/provider-schema.ts`：`ModelContract`、能力白名单
- `src/shared/http-template.ts` / `protocol-templates.ts`：变量契约与完整 DSL
- `src/renderer/src/canvas/PromptBar.tsx`：调用共享校验
- `src/renderer/src/canvas/nodes/ModelConfigDialog.tsx`：旧模板警告
- `src/main/settings/models-config.ts`：官方 registry
- 新增：适配器 registry、目录监听、esbuild 构建、utilityProcess 宿主、CLI、本地适配器覆盖逻辑
- `docs/models.md`、`docs/code-map/02-generation.md`、`docs/code-map/08-capabilities.md`

## 18. 验收

官方：

- 首帧模式：生成视频首帧与输入图片构图一致；
- 首尾帧模式：首帧、尾帧都与输入一致；
- 每个内置视频适配器有首帧/首尾帧/参考图请求体测试；
- MiniMax H3 首尾帧带 `role`；
- http-template 旧变量警告正常，DataUrl 变量可用；
- 官方支持模型有真实 smoke 记录；
- L2 完整 DSL 用例通过。

本地适配器：

- `adapters/<id>/` 存在即自动加载，无需启用；
- 修改文件自动重载；
- 构建/加载失败显示错误，不阻塞应用；
- 同名模型 ID 覆盖官方，界面标注「本地适配器」；
- 适配器崩溃不影响主进程（utilityProcess）；
- 支持完整 Node/npm/native；
- 没有信任弹窗、开发者模式或启用开关。

全局：

- `typecheck`、`test`、`check:ui`、`check:docs` 通过；
- 不引入默认外部上传。

## 19. 迁移与回滚

- 旧 http-template 不自动改写；设置页警告 + 文档迁移示例。
- 删除 `models.pending.json` 机制；本地适配器直接在 `adapters/` 下自动加载。
- 本地适配器覆盖官方同名模型时，界面标注「本地适配器」，删除目录即可恢复官方模型。
- 本地适配器无测试门槛；构建/加载错误只影响自身。
- 官方适配器随版本更新；用户覆盖保留。
- 实现分支：`feat/model-adapter`，确认后再合并 main；不直接修改 main。

## 20. 安全与隐私

这是纯本地、完全信任的设计，必须明确：

- 本地适配器拥有 CineLab 应用权限，可读写文件、读取配置和 Key、执行命令、访问任意网络；
- 不提供沙箱、权限隔离或信任确认；
- L3 在 `utilityProcess` 中执行，仅用于崩溃隔离，不是安全边界；
- 日志脱敏，避免 Key、base64、完整 URL 参数进入日志；
- 原生模块由适配器自己安装并匹配 Electron ABI，CineLab 不负责编译；
- 默认不上传素材到第三方；Agnes 纯 base64 标注非官方兼容；
- 需要隔离或非 Node 语言时，使用 L4 sidecar，CineLab 不执行其代码。

## 21. 不做

- 不做插件市场、作者体系、签名和审核；
- 不做沙箱、权限白名单、开发者模式、信任弹窗、启用开关；
- 不对用户适配器做契约测试或真实生成门槛；
- 不做默认外部上传；
- 不按模型拆分 PromptBar UI；
- 不自动改写用户 http-template；
- 不为每个新模型单独发版；
- 不保留“实验性/兼容”支持等级。

## 22. 决策记录

1. 官方负责协议族、核心适配器和默认体验；用户/外部 Agent 负责长尾。
2. 本地适配器完全信任，自动加载，无开发者模式、无信任门、无启用开关。
3. 本地适配器跑在 `utilityProcess`，完整 Node/npm/native，只做崩溃隔离，不做安全隔离。
4. 本地适配器覆盖官方同名模型，界面标注「本地适配器」。
5. 本地适配器不做契约测试和真实生成门槛；只保留基本加载校验，错误不阻塞应用。
6. 官方支持模型必须有契约测试 + 真实 smoke；支持等级只有「官方支持 / 本地适配器」。
7. 旧 `{{refs.firstFrame}}` 语义改为纯 base64；新增 `DataUrl` 变量；不自动改写旧模板。
8. 不上传素材；Agnes 纯 base64 是非官方兼容。
9. 首尾帧校验只保留一套规则，UI 和主进程共用。
10. L2 做完整声明式 HTTP；SSE/WebSocket/分片/多阶段回调归 L3/L4。
11. S0 先完成首尾帧 P0–P2 并单独发布；S1/S2 再做契约层和本地适配器。
12. “做彻底”只约束官方功能；用户适配器由用户自己负责。
