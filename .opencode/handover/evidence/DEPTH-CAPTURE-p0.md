# DEPTH-CAPTURE P0 · 组件下载器骨架

日期：2026-11-06
方案：`docs/depth-capture-plan.md`

## 已完成

### 新增文件

| 文件 | 职责 |
|---|---|
| `src/shared/components.ts` | 组件类型：Kind、State、Manifest、Status、Event |
| `src/main/components/manifest.ts` | 组件注册表、manifest 拉取、平台校验、内置兜底 |
| `src/main/components/downloader.ts` | 多源下载、HTTP Range 续传、sha256 校验、进度回调、取消 |
| `src/main/components/installer.ts` | zip 解压、单文件安装、原子目录替换、manifest 写入 |
| `src/main/components/service.ts` | 状态机、安装/暂停/删除、事件广播、已安装检测 |
| `src/main/ipc/components.ts` | IPC：status / install / pause / remove |
| `src/shared/ipc-contract.ts` | 新增 `ComponentsApi` |
| `src/preload/index.ts` | 暴露 `window.api.components` |
| `src/main/ipc/index.ts` | 注册组件 IPC |

### 行为

- 组件分两个：`depth-runtime`、`depth-model`
- 安装位置：`userData/components/<directory>/`
- 下载临时文件：`userData/components/.downloads/`
- 已安装判定：`manifest.json` + 关键文件（`python/python.exe` 或 `video_depth_anything_vits.pth`）
- 暂停：abort 下载，保留 `.part`，下次 Range 续传
- 删除：移除组件目录与下载缓存
- 事件：主进程通过 `components:event` 广播状态与进度
- 清单地址：可用 `CINELAB_COMPONENT_BASE_URL` 指向本地 mock

### 依赖

- 新增 `extract-zip@2.0.1`（纯 JS，无原生模块）

## 验证

- `corepack pnpm typecheck` 通过（TS 5.9 回退，无报错）
- IPC 已注册，preload 已暴露

## 未完成

- 真实组件包与 manifest（需 P4 构建）
- 渲染进程组件管理 UI（P3）
- Python worker（P1）
- ffmpeg 抽帧/编码链路（P1/P2）
