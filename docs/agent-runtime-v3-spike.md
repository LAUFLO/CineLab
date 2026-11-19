# Agent 运行时 v3 M0 Spike 报告

日期：2026-11-19
状态：功能验证通过；已决定接受包体积，安装包实测仅记录
适用分支：`spike/agent-runtime-v3`
关联：`docs/agent-runtime-v3-plan.md`

## 0. 结论

M0 的核心功能验证通过：

1. Electron 45.3.1 / Node 24.22.2 下，`require('@earendil-works/pi-coding-agent')` **失败**，但 `await import()` **成功**；
2. `createAgentSession` + `SessionManager` + `customTools` 可创建会话；
3. 自定义 `ModelRuntime` + `streamSimple` 可驱动「工具调用 → 工具结果 → 最终文本」；
4. `Type.Unsafe(JSON Schema)` 可被 pi 工具接受并执行；
5. 包装原 `session.agent.finishTurn` 后，原钩子仍执行，自动续跑判断可生效；
6. 自定义会话目录 `SessionManager.create(cwd, '<root>/.cinelab/agent/sessions/v2')` 生效；
7. `AgentSession.compact()` 存在，手动压缩可用；
8. `pnpm build` 通过。

未完成：

- `pnpm dist:win` 在当前机器上因 electron-builder 的 `EXDEV` 错误失败，安装包体积未测得；
- pi 相关依赖的原始体积约 **74.6 MB**（未压缩、含重复实例）；**已决定不裁剪，接受该体积**。

## 1. 环境

| 项 | 值 |
|---|---|
| Electron | 45.3.1 |
| Electron Node | 24.22.2 |
| 系统 Node | 24.22.2 |
| pnpm | 12.16.1 |
| 平台 | Windows 10.0.26100 x64 |
| pi-coding-agent | 1.5.2 |
| pi-ai | 1.5.2 |
| typebox | 1.3.27 |
| proper-lockfile | 4.1.2 |

依赖安装时 pnpm 因 `@google/genai`、`protobufjs` 的构建脚本被拦截而退出 1；已在 `pnpm-workspace.yaml` 的 `allowBuilds` 中加入这两项，重新 `pnpm install` 通过。

## 2. 验证结果

| 编号 | 验证项 | 结果 | 证据 |
|---|---|---|---|
| M0-1 | CJS `require` pi | 失败：`ERR_PACKAGE_PATH_NOT_EXPORTED` | `electron-import.cjs` 之前的 require 测试 |
| M0-2 | CJS 内 `await import()` pi | 通过 | `scripts/spike/electron-import.cjs` |
| M0-3 | `createAgentSession` + `customTools` | 通过 | `scripts/spike/pi-smoke.mjs` |
| M0-4 | 自定义 `streamSimple` 驱动文本 | 通过 | `pi-smoke.mjs` 第二次请求输出「完成」 |
| M0-5 | 工具调用 → 结果 → 最终文本 | 通过 | `pi-smoke.mjs` 执行 `echo` |
| M0-6 | `Type.Unsafe(JSON Schema)` | 通过 | `pi-continue.mjs` 执行 `json_tool` |
| M0-7 | `finishTurn` 包装 | 通过，原钩子被调用 | `pi-continue.mjs` 的 `innerCalled` |
| M0-8 | 自动续跑 | 通过 | 第一轮过渡语后自动发起第二轮 |
| M0-9 | 自定义会话目录 | 通过 | `pi-session.mjs` 生成 v2 目录文件 |
| M0-10 | 手动压缩 API | 存在 | `typeof session.compact === 'function'` |
| M0-11 | `pnpm build` | 通过 | `out/main/index.js` 756.98 kB |
| M0-12 | `pnpm dist:win` | 失败（环境） | `EXDEV ... LICENSE -> LICENSE.electron.txt` |
| M0-13 | 包体原始增量 | 74.6 MB（未压缩） | `.pnpm` 匹配包统计 |

## 3. 关键发现

### 3.1 ESM 加载

```text
require('@earendil-works/pi-coding-agent')
→ Error [ERR_PACKAGE_PATH_NOT_EXPORTED]: No "exports" main defined
```

包的 `exports` 只有 `"import"` 条件，没有 `"require"`。Electron 主进程是 CJS，但 Node 24 支持在 CJS 中 `await import()`，实测成功。

**落地建议**：

- 不整体 ESM 化主进程；
- 在 `pi/runtime.ts` 用 `await import('@earendil-works/pi-coding-agent')`；
- 如果 electron-vite/Rollup 把动态 import 改成 `require`，用 `new Function('s', 'return import(s)')('@earendil-works/pi-coding-agent')` 绕过静态分析；
- M1 第一次接入主进程时，在 `out/main/index.js` 里确认保留了 `import(`。

### 3.2 工具与流

`customTools` 是 SDK 一等入口，工具 `execute` 返回 `{ content, details, isError? }` 即可。自定义 `streamSimple` 用 `createAssistantMessageEventStream()` + `push/end` 构造事件流，工具调用使用 `toolcall_start/delta/end`，`stopReason: 'toolUse'`。

### 3.3 `finishTurn`

`session.agent.finishTurn` 是函数；包装后原钩子返回 `undefined`，包装逻辑可以继续判断并返回 `{ action: 'continue' }`。`pi-continue.mjs` 中 `innerCalled = 4`，说明原钩子没有被覆盖丢失。

注意：测试脚本为了验证机制，未实现 `looksLikePreamble`，所以最终文本后又续跑了一次；正式实现必须加前缀/冒号判断和最多 2 次限制。

### 3.4 会话

`SessionManager.create(agentDir, sessionDir)` 接受自定义目录，实际生成：

```text
<agentDir>/sessions/v2/2026-11-19T09-00-36-119Z_<uuid>.jsonl
```

`session.compact()` 存在，可直接接手动压缩按钮。

### 3.5 包体

| 项 | 体积 |
|---|---:|
| pi 相关包（42 个，未压缩） | 74.6 MB |
| 其中未使用 provider/可选包（33 个，仅记录） | 65.7 MB |
| `node_modules` 总计 | 1,647 MB |
| `.pnpm` 总计 | 1,220 MB |
| `out`（应用代码） | 5.3 MB |
| `win-unpacked`（仅 Electron 运行时，打包在中途失败） | 356.9 MB |

体积主要来自：

- `openai@7.19.0` 两个实例，各 17.6 MB（pnpm peer 变体）；
- `@google/genai@2.21.0` 10.8 MB；
- `@earendil-works/pi-ai` 两个实例，各 4.3 MB；
- `pi-tui` 2.4 MB、`photon-node` 2.2 MB、`undici` 多个版本各 1–2 MB。

`pnpm why` 显示两个 `openai` / `pi-ai` 实例来自 peer 变体，暂未找到不破坏解析的 dedupe 方式。

### 3.6 裁剪可行性分析（已决定不裁剪）

**决策：不做裁剪，接受完整依赖体积；`electron-builder.yml` 保持原样。**

以下仅记录 M0 验证结果。用 Node 24 的 `module.registerHooks` 拦截包解析，再跑 `pi-smoke.mjs`、`pi-continue.mjs`、`pi-session.mjs`，确认以下包在运行时**完全不被加载**：

| 包 | 用途 | 结论 |
|---|---|---|
| `openai`（2 个实例） | pi-ai 的 OpenAI provider | 可裁剪；我们只用自定义 `streamSimple` |
| `@aws-sdk/*`（18 个包） | Bedrock provider | 可裁剪 |
| `@smithy/*`（7 个包） | AWS SDK 内部依赖 | 可裁剪 |
| `@google/genai` | Gemini provider | 可裁剪 |
| `@anthropic-ai/sdk` | Anthropic provider | 可裁剪 |
| `@silvia-odwyer/photon-node` | 内置 read 工具的图片处理 | 可裁剪；我们不走内置工具 |
| `quickjs-wasi` | codemode 沙箱 | 可裁剪；不使用 codemode |
| `jiti` | TS 扩展加载器 | 可裁剪；不使用文件扩展 |

合计 33 个 `.pnpm` 目录，逻辑大小 **65.7 MB**。裁剪后 pi 相关原始体积约 9 MB。

以下包虽然看起来“没用”，但**静态 import 会加载**，不能直接排除：

- `@earendil-works/pi-tui`：`agent-session.js` 静态 import 主题；
- `marked`、`highlight.js`、`lovely-mermaid`：`export-html` 静态 import；
- `@earendil-works/pi-mcp`、`@earendil-works/pi-codemode`：根 index 静态 import；
- `chalk`、`diff`、`yaml`、`ignore`、`minimatch`、`hosted-git-info`、`cross-spawn`、`undici`、`proper-lockfile`、`semver`、`@earendil-works/pi-telemetry`、`partial-json`：block 测试均失败，说明加载链需要。

另外可以安全排除的非运行时代码：

| 路径 | 大小 |
|---|---:|
| `pi-coding-agent/dist/bundle/**`（CLI bundle） | 9.2 MB |
| `pi-coding-agent/docs/**` | 2.9 MB |
| `pi-coding-agent/examples/**` | 0.9 MB |
| `**/*.map`（全量 source map） | 57.9 MB（含 dev 依赖） |
| `**/*.d.ts`（类型声明） | 待实测 |

决策是不应用这些排除，`electron-builder.yml` 保持原样；完整依赖随包分发，避免运行时解析风险。

### 3.7 安装包失败

```text
⨯ EXDEV: cross-device link not permitted, rename
  'D:\CineLab\release\win-unpacked\LICENSE'
  -> 'D:\CineLab\release\win-unpacked\LICENSE.electron.txt'
```

同目录手动 `Rename-Item` 成功，说明不是普通权限问题；疑似 electron-builder 26.18.0 在当前 Windows/文件系统/安全软件组合下的 rename 兼容问题。尚未定位到可复现的最小绕过。

## 4. 产物

```text
scripts/spike/pi-smoke.mjs         # 最小闭环：customTools + streamSimple + tool
scripts/spike/pi-continue.mjs      # finishTurn 包装 + Type.Unsafe
scripts/spike/pi-session.mjs       # 自定义会话目录 + compact
scripts/spike/electron-import.cjs  # CJS 内动态 import
```

这些脚本只用于 M0，不接入业务；M1 开始前保留在 `scripts/spike/`，合并前删除或移入归档。

## 5. 对方案的修订

1. ESM 结论从「可能需要主进程 ESM 化」改为「优先用 CJS 动态 import；ESM 化是最后手段」；
2. M0 检查项从「require 成功」改为「动态 import 成功」；
3. 包体结论改为「接受原始 74.6MB 增量，不裁剪、不设阈值；安装包实测仅记录」；
4. 新增「`openai` / `pi-ai` peer 重复实例」优化项；
5. 新增「electron-builder EXDEV」环境阻塞项。

## 6. 下一步

M0 功能上已通过，建议进入 M1，但先处理两个前置：

1. 包体：不裁剪，`electron-builder.yml` 保持原样；安装包实测值仅记录，不作为 M1 门禁；
2. 安装包：在 CI 或另一台 Windows 上复测 `dist:win`，确认 EXDEV 是否只在本机出现；
3. 不使用文件扩展仍建议 `DefaultResourceLoader` 设置 `noExtensions: true`，这是安全/行为选择，与包体无关。

如果这两项无法在 M1 前解决，M1 仍可继续（功能验证不依赖安装包），但发布前必须关闭。
