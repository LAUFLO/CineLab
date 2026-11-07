# RUNTIME-COMPONENTS-1 深度 runtime 组件构建与发布

日期：2026-11-07
状态：已完成

## 交付

| 文件 | 作用 |
|---|---|
| `docs/runtime-components-plan.md` | 组件边界、版本策略、固定版本、构建流程、manifest 格式、验收与回滚 |
| `scripts/build-depth-runtime.ps1` | 参数化构建：Python embeddable + CPU torch + VDA 固定 commit + 冒烟测试 + zip/manifest |
| `.github/workflows/depth-runtime.yml` | workflow_dispatch / tag 触发，windows-2022 构建，发布 prerelease |

## 固定版本

- Python 3.11.9
- torch 2.8.0+cpu（PyTorch CPU index）
- numpy 2.1.3、opencv-python-headless 4.10.0.84、tqdm、easydict、einops
- VDA commit `4f5ae23172ba60fd7bc11ef671cca678842c7072`
- 打包：7-Zip `-tzip -mx=5`（`Compress-Archive` 超过 2GB 报 `Stream was too long`）

## 发布结果

- Release：`depth-components-v1`（prerelease，不影响 electron-updater）
- 资产：
  - `depth-runtime-win32-x64-v1.zip` 678,216,131 字节
  - `depth-runtime-manifest.json` 358 字节
- SHA256：`e257d4de5d9a4637426dbace6b30f20fce7e9672d73949948da5def05f161787`
- 解压后：3,377,605,421 字节，15,891 个文件
- GitHub 资产 digest 与 manifest sha256 一致；两个 URL 实测 302 → 200
- 用户已在设置页成功下载 runtime

## 关键修复

1. 冒烟测试最初直接 import VDA，触发 `ModuleNotFoundError: torchvision`；改为按 worker 真实顺序先启用 shim。
2. `Compress-Archive` 内存流限制导致构建失败；改用 7z。

## 验证

- CI run 42331479000 失败（torchvision shim）
- CI run 42331788261 成功（6m30s）
- `gh release view` 资产状态 uploaded，prerelease=true
- 本地 `curl -I` 两个资产均 200
