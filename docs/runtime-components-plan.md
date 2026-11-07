# 深度 runtime 组件构建与发布方案

日期：2026-11-07
状态：实施中
关联：`DEPTH-CAPTURE-1`、`RUNTIME-COMPONENTS-1`、`docs/beef-tv-depth-research.md`

## 1. 背景

深度动作捕捉依赖两个按需下载的组件：

| 组件 | 内容 | 来源 |
|---|---|---|
| `depth-runtime` | Python 3.11 embeddable + PyTorch CPU + OpenCV + VDA 代码 + worker | 本仓库 GitHub Actions 构建，发布到 Release |
| `depth-model` | VDA Small 权重 `video_depth_anything_vits.pth` | 官方 HuggingFace（hf-mirror 备用） |

模型侧已经完成并验证。runtime 侧没有官方现成 Windows 包，代码默认源指向的 `depth-components-v1` Release 不存在，导致设置页下载 runtime 返回 404。本方案负责补齐这一构建与发布链路。

## 2. 目标与非目标

### 目标

- 在 CI 中构建可复现的 Windows x64 CPU runtime 包
- 产出 `depth-runtime-win32-x64-v1.zip` + `depth-runtime-manifest.json`
- 发布到 GitHub Release `depth-components-v1`，使应用默认源可直接下载
- 构建产物经过冒烟测试，坏包不发布
- 完成 `DEPTH-CAPTURE-1` 的组件下载与真实素材验收

### 非目标

- 不发布 CineLab 应用安装包，不动 `build-win.yml`
- 不做 CUDA 变体、macOS 变体、镜像源、分片下载
- 不把模型打进 runtime 包，模型继续走官方 HF
- 不做 manifest 签名（后续如需再补 Ed25519）

## 3. 组件布局

runtime 安装后的目录结构（客户端 `installer.ts` 解压到 `userData/components/depth-runtime`）：

```
depth-runtime/
  manifest.json              # 安装时写入
  worker.py                  # resources/depth-worker/worker.py
  python/
    python.exe               # embeddable Python
    python311._pth
    Lib/site-packages/       # torch / numpy / opencv / tqdm / easydict / einops
  video_depth_anything/      # VDA 源码（固定 commit）
  utils/                     # VDA 依赖工具
```

客户端完整性检查只要求 `python/python.exe`，但 `worker.py` 还会用到 `video_depth_anything`、`utils`、模型文件和主进程传入的 ffmpeg。

## 4. 版本与命名

| 项目 | 值 |
|---|---|
| Release tag | `depth-components-v1` |
| runtime 资产 | `depth-runtime-win32-x64-v1.zip` |
| manifest 资产 | `depth-runtime-manifest.json` |
| manifest `version` | `1` |
| `platform` | `win32-x64` |

升级到 v2 时：

1. 新增 tag `depth-components-v2` 并上传新的 zip + manifest
2. 修改 `src/main/components/manifest.ts` 的 `runtimeBaseUrl` 指向 v2
3. 旧版本应用仍指向 v1，不受影响；不做强制升级

## 5. 固定版本

| 依赖 | 版本 |
|---|---|
| Python embeddable | 3.11.9 |
| PyTorch（CPU） | 2.8.0 |
| numpy | 2.1.3 |
| opencv-python-headless | 4.10.0.84 |
| tqdm / easydict / einops | 最新（纯 Python，风险低） |
| VDA commit | `4f5ae23172ba60fd7bc11ef671cca678842c7072` |

VDA 不装 torchvision：`worker.py` 启动时提供 `Compose` shim，runtime 保持 torch + numpy + cv2 的最小组合。FFmpeg/FFprobe 使用应用自带的 `ffmpeg-static`，不重复打包。

## 6. 构建流程

`scripts/build-depth-runtime.ps1`（CI 与本地共用，参数化）：

1. 下载 Python embeddable zip（缓存复用）
2. 解压并修改 `python311._pth`，启用 `Lib\site-packages` 与 `import site`
3. `pip install --target` 到 runtime 的 site-packages：
   - 主 index `https://download.pytorch.org/whl/cpu` 取 CPU torch
   - extra index PyPI 取其余依赖
4. clone VDA 并 checkout 固定 commit，复制 `video_depth_anything/` 与 `utils/`
5. 复制 `resources/depth-worker/worker.py`
6. 清理 `__pycache__` / `*.pyc`
7. 冒烟测试：用 runtime 自带 `python.exe` 导入 torch/cv2/numpy/einops/easydict/tqdm 和 `video_depth_anything.video_depth`，并断言 `torch.version.cuda is None`
8. 压缩 zip，统计 SHA256 / 压缩体积 / 解压体积 / 文件数
9. 生成 manifest，`urls` 指向 `-DownloadBase` 下的 zip

现有 `scripts/build-depth-components.ps1` 保留不动，作为本地快速验证脚本；它包含本机路径和模型打包逻辑，不用于 CI。

## 7. manifest 格式

```json
{
  "version": 1,
  "kind": "depth-runtime",
  "platform": "win32-x64",
  "size": 0,
  "expandedSize": 0,
  "sha256": "",
  "urls": ["https://github.com/<owner>/<repo>/releases/download/depth-components-v1/depth-runtime-win32-x64-v1.zip"],
  "files": 0
}
```

字段与 `src/shared/components.ts` 的 `ComponentManifest` 完全一致。客户端拉取 manifest 失败时会退回内置地址，下载后仍做 SHA256 校验。

## 8. CI 设计

`.github/workflows/depth-runtime.yml`：

- 触发：`workflow_dispatch` 手动触发；`push` tag `depth-components-v1`（v2 需同步改 workflow）
- runner：`windows-2022`
- 权限：`contents: write`
- 步骤：checkout → setup-python 3.11.9 → pip 缓存 → 构建脚本 → 冒烟测试（脚本内）→ 上传 artifact（保留 7 天）→ 创建/更新 Release

发布策略：

- Release 标记为 **prerelease**
- 原因：electron-updater 的 GitHub provider 默认跳过 prerelease，且该 Release 没有 `latest.yml`，不会被误判为应用更新
- 资产使用 `--clobber` 覆盖，支持重复构建
- 首次运行约 15–30 分钟（torch 下载 + 压缩），后续命中 pip 缓存会更快

## 9. 本地验证

1. 触发 workflow，确认 Release 出现两个资产
2. 检查 manifest 的 `sha256` / `size` / `files` 与 zip 一致
3. 用 `CINELAB_COMPONENT_BASE_URL` 指向本地 mock 源做无网络回归：

```powershell
node scripts/mock-component-server.mjs build/components 8899
$env:CINELAB_COMPONENT_BASE_URL = "http://127.0.0.1:8899"
corepack pnpm dev:isolated
```

4. 在设置页下载 runtime，确认进度、校验、解压、安装状态正常
5. 用横屏、竖屏各一段真实素材跑深度动作捕捉，检查输出比例、灰度、闪烁与拖影

## 10. 验收标准

- Release `depth-components-v1` 的 zip 与 manifest 可公开下载
- manifest 校验通过，客户端不再出现 404
- runtime 冒烟测试通过（torch 为 CPU 版）
- 打包态能完成一次真实视频的深度捕捉，自动生成节点与连线
- `corepack pnpm typecheck` / `corepack pnpm build` 不受影响

## 11. 风险与回滚

| 风险 | 处理 |
|---|---|
| torch 2.8.0 与 numpy/opencv 组合冲突 | CI 冒烟失败则不发布；调整版本后重跑 |
| VDA commit 与 worker 不兼容 | 用 `vda_ref` 输入覆盖，改为已验证 commit |
| 压缩耗时或磁盘不足 | windows-2022 约 14GB 可用；CPU 包峰值约 3–4GB |
| Release 被误认为应用版本 | 标记 prerelease；不生成 `latest.yml` |
| 发布坏包 | 重新构建并 `--clobber` 覆盖；必要时删除 Release 资产 |

## 12. 后续

- 如需 CUDA 变体：复用本 workflow，增加矩阵与分片
- 如需多源：在 manifest `urls` 中追加镜像地址，客户端已支持按顺序回退
- 如需签名：manifest 增加 Ed25519 签名字段，客户端增加校验
