# macOS 打包缺口修复方案

日期：2026-11-20
状态：实施中
适用版本：v0.4.0
最后核对：2026-11-20

> 范围：macOS 安装包的资源完整性、视觉组件、字幕字体和发版验证。
> 不在范围：Apple 代码签名与公证（已决策搁置）、Intel Mac 支持（已决策不做）。

## 1. 背景

macOS 构建已接入发布矩阵：`release.yml` 使用 `macos-15` arm64 runner，`package.json` 的 `dist:mac` 使用独立的 `electron-builder.mac.yml`。基础媒体链路已经可用，但部分资源与平台假设没有同步，导致 mac 包存在缺口。

本方案把这些缺口收敛到可验证的状态，并记录已确认的取舍。

## 2. 现状

### 2.1 已经做对的部分

| 环节 | 实现 | 证据 |
|---|---|---|
| ffmpeg 二进制 | `asarUnpack` 解包 `ffmpeg-static/ffmpeg` | `electron-builder.mac.yml` |
| ffprobe 架构 | 构建前从 `ffmpeg-static` release 下载 arm64 版覆盖 `ffprobe-static` 的伪 arm64 文件 | `ee0df2f`、`build-macos.yml`、`release.yml` |
| 平台分支 | `taskkill` 有 POSIX 分支；Python 路径区分 `python.exe` / `python/bin/python3` | `src/main/media/depth.ts`、`vision.ts` |
| 组件 runtime | depth 和 whisper 均有 mac 构建脚本与 CI workflow | `build-depth-runtime-macos.mjs`、`build-whisper-macos.mjs`、`build-depth-macos.yml` |
| 启动校验 | `macos-smoke.mjs` 校验 ffmpeg/ffprobe 存在并执行 `-version` | `scripts/macos-smoke.mjs` |

### 2.2 缺口清单

| 编号 | 缺口 | 严重度 | 证据 |
|---|---|---|---|
| G1 | `model-config-skill` 未打进 mac 包 | 高（确定 bug） | `electron-builder.mac.yml` 的 `extraResources` 缺项；`src/main/settings/model-skill.ts` 固定读 `process.resourcesPath/model-config-skill/SKILL.md` |
| G2 | mac 视觉组件回退到 win32 包 | 高 | `src/main/components/manifest.ts` 的 `vision-models` fallback |
| G3 | smoke 不检查上述资源 | 中 | `scripts/macos-smoke.mjs` 只检查三个二进制 |
| G4 | 正式发版不跑 smoke | 中 | `release.yml` 的 mac job 只有 build + upload |
| G5 | 字幕字体写死 `Microsoft YaHei` | 中 | `src/main/media/concat.ts:210` |
| G6 | whisper 组件描述写死 Windows x64 | 低 | `src/renderer/src/panels/ComponentsSection.tsx:35` |
| G7 | 自动更新在未签名 mac 上不可用 | 已知，搁置 | `electron-builder.mac.yml` 的 `hardenedRuntime: false`、`notarize: false` |
| G8 | Intel Mac 无法安装 | 已知，不做 | 构建固定 `--arm64`，`files` 排除 `darwin/x64` |

## 3. 决策记录

| 决策 | 选择 | 理由 |
|---|---|---|
| mac 视觉功能 | 打通，复用现有模型包 | 包内容平台无关，无需重新构建 526MB 资产 |
| Intel Mac | 不支持，文档写清 | 当前 CI 只产出 arm64；universal 会让安装包接近翻倍 |
| Apple 证书 | 先搁置 | 不支付年费；本次不改更新相关代码，保留现有英文报错 |
| 推进方式 | 只写文档 | 代码按本文档后续实施 |
| 视觉资产命名 | 改为 `vision-models-v1.zip`，终态只留新名 | 名字误导是真实成本；先传新名、发版验证、再删旧名 |

## 4. 关键调研结论

### 4.1 视觉模型包是平台无关的

读取 release 资产 `vision-models-win32-x64-v1.zip` 的中央目录，共 11 个文件：

| 文件 | 大小 | 类型 |
|---|---|---|
| `inspyrenet/transparent_background/__init__.py` | 0.00 MB | 纯 Python |
| `inspyrenet/transparent_background/InSPyReNet.py` | 0.01 MB | 纯 Python |
| `inspyrenet/transparent_background/backbones/SwinTransformer.py` | 0.03 MB | 纯 Python |
| `inspyrenet/transparent_background/modules/attention_module.py` | 0.00 MB | 纯 Python |
| `inspyrenet/transparent_background/modules/context_module.py` | 0.00 MB | 纯 Python |
| `inspyrenet/transparent_background/modules/decoder_module.py` | 0.00 MB | 纯 Python |
| `inspyrenet/transparent_background/modules/layers.py` | 0.01 MB | 纯 Python |
| `models/big-lama.pt` | 196.14 MB | TorchScript 权重 |
| `models/ckpt_fast.pth` | 350.49 MB | PyTorch state_dict |
| `NOTICE.md` | 0.00 MB | 文本 |
| `worker.py` | 0.02 MB | 纯 Python |

没有 DLL、`.pyd`、`.so` 或 Mach-O。结论：macOS 可以直接复用同一份 zip，不需要新建平台包。

成立前提（均已满足）：

1. mac 版 `depth-runtime` 已包含 torch 2.8.0、numpy、opencv（`build-depth-runtime-macos.mjs`）。
2. InSPyReNet 已去除 timm/kornia 依赖，仅保留 torch/cv2（`docs/archive/placeholder-operations-plan.md:77`）。
3. `worker.py` 加载 state_dict 时显式传入 `weights_only=True`，与 torch 2.8 兼容。

命名遗留：资产名中的 `win32-x64` 只是历史命名，不代表内容有平台限定。本次不改资产名，避免重复上传 526MB；在 `manifest.ts` 加注释固定约束。

### 4.2 ffmpeg/ffprobe 不需要改动

`electron-builder.mac.yml` 已正确解包 `ffmpeg` 和 `darwin/**/ffprobe`，CI 也替换了真正的 arm64 ffprobe。本次只补校验，不改二进制来源。

## 5. 已有实现检查

| 需求 | 复用 | 扩展 | 新建 |
|---|---|---|---|
| mac 资源完整性 | `electron-builder.mac.yml` | 补 `model-config-skill` | — |
| 打包校验 | `scripts/macos-smoke.mjs` | 加资源检查与模型加载检查 | — |
| 视觉组件 | 现有 `vision-models-win32-x64-v1.zip` | 改 manifest 让 mac 复用 | — |
| 字幕字体 | 现有 `subtitles` 滤镜 | 平台常量 | — |
| 发版验证 | `release.yml` | 加 smoke step | — |
| 组件文案 | `ComponentsSection.tsx` | 去掉 Windows 限定 | — |

## 6. 改动点

### P0-1：mac 包补 `model-config-skill`

文件：`electron-builder.mac.yml`

```yaml
extraResources:
  - from: resources/sounds
    to: sounds
  - from: resources/skills
    to: skills
  - from: resources/model-config-skill
    to: model-config-skill
```

原因：`src/main/settings/model-skill.ts` 打包后只认 `process.resourcesPath/model-config-skill/SKILL.md`，`src/main/ipc/settings.ts:81` 直接调用，没有 fallback。

### P0-2：smoke 增加资源检查

文件：`scripts/macos-smoke.mjs`

在现有 `bin`、`ffmpeg`、`ffprobe` 检查中加入：

```js
const modelSkill = join(resources, 'model-config-skill/SKILL.md')

for (const file of [bin, ffmpeg, ffprobe, modelSkill]) {
  if (!existsSync(file)) throw new Error(`missing ${file}`)
}
console.log('model-config-skill: ok')
```

### P0-3：发版矩阵跑 smoke

文件：`.github/workflows/release.yml`

在 mac job 的 `Build installer` 之后、上传产物之前插入：

```yaml
      - name: Smoke test macOS app
        if: matrix.platform == 'mac'
        shell: bash
        run: |
          APP=$(find release -maxdepth 2 -name 'CineLab.app' -type d | head -1)
          if [ -z "$APP" ]; then echo "CineLab.app not found"; exit 1; fi
          node scripts/macos-smoke.mjs "$APP"
```

注意：该 job 其他步骤用了 `shell: pwsh`，这一步必须显式 `shell: bash`。

### P1-1：mac 视觉组件复用现有包

文件：`src/main/components/manifest.ts`

把 `vision-models` 的 manifest 与 fallback 从 Windows 专用改为全平台共用：

```ts
// 资产内容为纯 Python 源码 + 权重，不含平台二进制，Windows/macOS 共用。
// 若未来加入 .so/.pyd/DLL 等平台文件，必须拆分为按平台的资产。
manifestUrl: `${visionBaseUrl}/vision-models-manifest.json`,
fallback: fallback('vision-models', [
  `${visionBaseUrl}/vision-models-v1.zip`
], { ...原配置... })
```

影响：mac 上不再走 `isWindows ? ... : undefined` 的分支，设置页可以正常下载并显示“已安装”。

### P1-2：smoke 验证视觉模型可加载

文件：`scripts/macos-smoke.mjs`

现有 `--install-vision` 只执行 `import worker`，验证不到权重。改为：

```js
const worker = execFileSync(
  python,
  [
    '-c',
    `import sys
sys.path.insert(0, '.')
import torch
from worker import Vision
v = Vision('models')
v.inspyrenet()
v.lama()
print('VISION_MODELS_OK')`
  ],
  { cwd: vision.path, encoding: 'utf8' }
)
```

说明：加载 `ckpt_fast.pth` 与 `big-lama.pt` 会占用约 1–2 GB 内存、耗时数十秒，只在手动 `workflow_dispatch` 且带 `--install-vision` 时执行；push 触发的日常构建仍跑基础 smoke。

### P1-3：字幕字体按平台选择

文件：`src/main/media/concat.ts`

文件顶部新增：

```ts
const SUBTITLE_FONT =
  process.platform === 'darwin' ? 'PingFang SC' : 'Microsoft YaHei'
```

第 210 行改为：

```ts
`subtitles=filename='${escaped}':force_style='FontName=${SUBTITLE_FONT},FontSize=18,Outline=1,Shadow=0'`,
```

说明：先使用系统字体，不引入字体文件。如果 mac 真机上 libass 仍找不到 `PingFang SC`，再升级为“内置字体 + `fontsdir`”方案，单独评估体积。

### P1-4：修正组件描述

文件：`src/renderer/src/panels/ComponentsSection.tsx`

把 `whisper-runtime` 的描述从“whisper.cpp v1.7.6 Windows x64 运行时”改为不限定平台的说法，例如“whisper.cpp v1.7.6 本地运行时”。

视觉组件描述保持“复用深度运行时的 Python/PyTorch 环境”，在 mac 上同样成立。

### P2-1：更新 README

文件：`README.md`、`README.en.md`

现状已经写了“macOS 12+、Apple Silicon”“未签名未公证”“首版暂不支持自动更新”。本次只补两点：

1. 视觉增强依赖“深度动作捕捉运行时”，与组件描述一致。
2. 明确 Intel Mac 不支持（如果当前表述不够直接）。

### P2-2：更新代码地图

文件：`docs/code-map/03-clip-studio.md`、`docs/code-map/08-capabilities.md`

记录：

- 字幕字体按平台选择。
- mac 视觉组件复用同一份平台无关资产。
- mac 包资源校验由 smoke 覆盖。

## 7. 影响模块

| 模块 | 文件 | 变更类型 |
|---|---|---|
| 打包 | `electron-builder.mac.yml` | 资源清单 |
| CI | `.github/workflows/release.yml` | 新增 smoke step |
| 媒体 | `src/main/media/concat.ts` | 字体选择 |
| 组件 | `src/main/components/manifest.ts` | 视觉资产平台策略 |
| 组件 UI | `src/renderer/src/panels/ComponentsSection.tsx` | 文案 |
| 测试 | `scripts/macos-smoke.mjs` | 断言增强 |
| 文档 | `README.md`、`README.en.md`、`docs/code-map/*` | 说明同步 |

## 8. 验收

### 8.1 本地（Windows 可执行）

```bash
corepack pnpm typecheck
corepack pnpm test
corepack pnpm check:docs
corepack pnpm check:ui
```

### 8.2 CI（macOS）

手动触发 `Build macOS`（`workflow_dispatch`），选择修复分支，确认日志包含：

- `ffmpeg: ffmpeg version ...`
- `ffprobe: ffprobe version ...`
- `model-config-skill: ok`
- `depth python: 2.8.0 ...`
- `vision worker: VISION_WORKER_OK`
- `VISION_MODELS_OK`
- `whisper-cli: ...`

### 8.3 发版

`release.yml` 的 mac job 在 build 后自动跑基础 smoke；产物中必须存在：

- `CineLab.app/Contents/Resources/model-config-skill/SKILL.md`
- `CineLab.app/Contents/Resources/app.asar.unpacked/node_modules/ffmpeg-static/ffmpeg`
- `CineLab.app/Contents/Resources/app.asar.unpacked/node_modules/ffprobe-static/bin/darwin/arm64/ffprobe`

### 8.4 视觉功能人工验收（有 mac 真机时）

1. 设置 → 组件，安装“深度动作捕捉运行时”和“视觉模型”。
2. 画布执行一次图片抠图，确认输出透明 PNG。
3. 执行一次扩图，确认版本更新。
4. 确认设置页不再显示 Windows 专用文案。

## 9. 风险

| 风险 | 影响 | 处理 |
|---|---|---|
| 无 mac 真机，CI 通过不等于用户机器通过 | 可能在 Gatekeeper 放行后的子进程执行、字体发现上出问题 | 保留 smoke；真实用户反馈优先；后续找一台 mac 做回归 |
| 视觉包复用 `win32-x64` 命名的 URL | 未来若加入平台二进制，mac 会静默坏掉 | 在 `manifest.ts` 注释中固定“必须平台无关”的约束，并在代码地图记录 |
| `PingFang SC` 在 libass 下可能未被识别 | 字幕回退到默认字体，中文可能显示异常 | 真机验证；失败则改用内置字体 + `fontsdir` |
| mac 视觉推理耗时未测 | 抠图/修复可能明显慢于 Windows | 首版接受；记录耗时后再决定是否限制尺寸或提示 |
| `release.yml` 增加 smoke 延长发版时间 | 每次发版多 1–2 分钟 | 可接受；只在 mac job 执行 |
| 未签名导致自动更新报错 | 用户看到英文错误 | 已决策搁置；README 已说明“首版暂不支持自动更新” |

## 10. 实施顺序

1. P0-1 ~ P0-3：一次 PR，CI 绿即闭环。
2. P1-1 ~ P1-2：视觉复用与 smoke 增强，手动 dispatch 验证。
3. P1-3 ~ P1-4：字体与文案，可并入 P0 或单独 PR。
4. P2-1 ~ P2-2：文档与代码地图更新。
5. 有 mac 真机时执行 8.4 人工验收。

## 11. 视觉资产改名与 v0.4.1 发版

### 11.1 决策

最终只保留 `vision-models-v1.zip`，删除历史命名 `vision-models-win32-x64-v1.zip`。执行顺序采用“先传新名、切代码、发版验证、再删旧名”，避免老客户端在发版前 404。

### 11.2 执行步骤

| 步骤 | 动作 | 验证 |
|---|---|---|
| 1 | 下载旧包并校验 sha256 | 等于 `c00b66f6...` |
| 2 | 以新名上传到 `vision-components-v1` | `gh release view` 可见 |
| 3 | 远端二次校验大小与哈希 | 526828343 字节 |
| 4 | 更新 `vision-models-manifest.json` | `platform: portable`，URL 指向新名 |
| 5 | 改 `src/main/components/manifest.ts` | fallback 指向新名 |
| 6 | CI `workflow_dispatch --install-vision` | 出现 `VISION_MODELS_OK` |
| 7 | 发布 v0.4.1 | `release.yml` 全绿 |
| 8 | 删除旧资产 | 只留新名 |

### 11.3 待确认

- 资产名：`vision-models-v1.zip`（推荐）
- manifest 的 `platform`：`portable`（推荐）
- 上传方式：本地 `gh`（推荐）或一次性 Actions workflow
- 组件 release tag：保持 `vision-components-v1`（推荐）
- 本次发版范围：P0 + 视觉改名 + 字体（推荐）
- 旧资产删除时机：发版成功后立即（推荐）
- mac 视觉验证：模型加载 + 一次真实推理（推荐）

### 11.4 回滚

- 发版前不执行删除，回滚只需把 manifest 与代码指回旧名。
- 发版后删除旧资产前，确认新版本至少完成一次完整下载。
- 组件 release 不删除，只替换资产，回滚不需要重建 release。

### 11.5 发版清单

- `package.json` 版本号与 tag 一致。
- `CHANGELOG.md` 增加 macOS 视觉支持、资源修复、字体适配。
- `README.md` / `README.en.md` 同步 mac 说明。
- 确认 `release.yml` 的 mac job 已包含 smoke。

## 12. 后续可选项

| 项 | 触发条件 | 备注 |
|---|---|---|
| Apple 签名与公证 | 产品需要应用内更新或降低首次打开门槛 | 需要 Apple Developer Program（$99/年） |
| universal 包 | Intel Mac 用户占比不可忽略 | 需要恢复 `darwin/x64` 并准备双架构 ffprobe，安装包接近翻倍 |
| 内置字幕字体 | `PingFang SC` 在 libass 下不可用 | 使用开源中文字体 + `fontsdir`，体积增加约 5–10 MB |
| 视觉资产重命名 | 已纳入本次方案 | 见第 11 节，v0.4.1 发布后删除旧资产 |
