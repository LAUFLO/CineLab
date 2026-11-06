# DEPTH-CAPTURE P4 · 组件构建与 IPC 端到端

日期：2026-11-06
方案：`docs/depth-capture-plan.md`

## 已完成

### 新增文件

| 文件 | 职责 |
|---|---|
| `scripts/build-depth-components.ps1` | 构建 runtime/model 组件包与 manifest |
| `scripts/mock-component-server.mjs` | 本地分发服务器，支持 HTTP Range |

### 修改文件

| 文件 | 变更 |
|---|---|
| `src/main/media/depth.ts` | `--vda-dir` 从包目录改为运行时根目录 |

### 组件包

| 包 | 压缩体积 | 解压体积 | 文件数 |
|---|---|---|---|
| `depth-runtime-win32-x64-v1.zip` | 259,836,230 | 857,327,847 | 22,346 |
| `video_depth_anything_vits.pth` | 116,440,756 | 116,440,756 | 1 |

runtime 包含：Python 3.11.9 embeddable、torch 2.15.0+cpu、numpy 2.4.6、opencv-python-headless 5.0.0、tqdm、easydict、einops、VDA 代码、worker.py。

### 下载与安装验证

- 本地 mock 服务器 `http://127.0.0.1:8899`
- 通过设置面板「深度组件」触发下载
- 两个组件均完成：下载 → sha256 校验 → zip 解压 → 原子替换 → manifest 写入
- 状态最终为 `installed`，model 116MB，runtime 857MB

### IPC 端到端

- 视频节点「更多 → 深度动作捕捉」
- 对话框确认后任务后台执行
- 事件序列：queued → running 0/5/10/15 → normalize 82 → encode 90 → done 100
- 结果：
  - 72 帧、3 秒、24fps
  - 输出 640×360，与输入比例一致
  - 自动创建「视频节点 1 · 深度 1」
  - 自动建立源节点 → 新节点连线（`role: auto`）
  - 输出文件 151,817 字节，H.264 / yuv420p / 24fps
- 组件内 worker 耗时约 128 秒（比测试环境 102 秒慢，embeddable 首次加载开销）

## 发现并修复的问题

### 1. 企业加密软件加密 `site-packages` 文本文件

- 现象：组件内 `python.exe` 导入 torch 时报 `UnicodeDecodeError: 'utf-8' codec can't decode byte 0xe7`
- 原因：加密驱动把 `*.dist-info` 下的 `METADATA`、`entry_points.txt`、`LICENSE.txt` 等加密成二进制；torch 导入时 `importlib.metadata.entry_points()` 读取失败
- 验证：Node/PowerShell 读取同一文件是明文，只有组件内 `python.exe` 读到密文；Node 重写后仍被加密
- 解决：构建时删除 `site-packages/*.dist-info`。运行时不需要 pip 元数据；删除后 torch、cv2 正常导入
- 脚本已加入该步骤

### 2. `--vda-dir` 路径错误

- 现象：任务报 `No module named 'video_depth_anything'`
- 原因：`depth.ts` 传了 `runtime/video_depth_anything`，worker 再拼 `video_depth_anything.video_depth` 变成双层
- 解决：改为传 `runtime` 根目录

### 3. `ffmpeg-static` 二进制损坏

- 已在 P1 记录：原文件 55MB 无法执行，重新下载为 82MB 后恢复

## 未验证

- `dist:win` 打包后的安装包路径与 asar 解包
- 组件下载暂停/续传/删除的真实交互
- 中文路径在打包环境下的行为
