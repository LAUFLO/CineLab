# 媒体路径与抽帧修复

日期：2026-11-07

## 1. 全局资产库 probe 失败（K16 相关）

### 现象

点击片段截取、深度捕捉、抽帧等报：

```
Error invoking remote method 'media:probe':
Error: ffprobe 失败（退出码 1）：...\未命名项目.cinelab\场景\....mp4: Invalid argument
```

### 根因

节点输出来自全局资产库（`scope: "global"`），文件在 `C:\Users\LAUFLO\Documents\CineLab Assets\场景\...`。
`media:probe` 只用了 `resolveInside(projectRoot, path)`，没有回退全局库；项目内不存在该路径，ffprobe 报 Invalid argument。

### 修复

`src/main/ipc/media.ts`：

```diff
-import { resolveInside } from '../media/paths'
+import { resolveMediaPath } from '../media/paths'

 ipcMain.handle('media:probe', async (_event, path: string) => {
-  return probeMedia(resolveInside(requireProjectRoot(), path))
+  return probeMedia(await resolveMediaPath(requireProjectRoot(), path))
 })
```

提交：`07911f2 fix: resolve global library assets for media probe`

### 验证

- 用项目自带 ffprobe 直接探测全局库文件成功：4.096 秒、视频+音频、6,024,626 字节
- `corepack pnpm typecheck` 通过
- 新安装包（07911f2）用户安装后片段截取恢复

## 2. 抽尾帧 ENOENT

### 现象

```
Error invoking remote method 'media:extract-frame':
Error: ENOENT: no such file or directory, open '...\cinelab-frame-...\frame.png'
```

### 根因

`frames.ts` 把 `-ss` 放在 `-i` 之后（输出侧 seek），时间取 `duration - 0.05`。4 秒视频的该位置落在最后一帧之后，ffmpeg 退出码 0 但没有输出帧，随后读取 `frame.png` 报 ENOENT。

### 修复

`src/main/media/frames.ts`：

- 尾帧改用输入侧 `-sseof -0.1`
- 首帧/当前帧改用输入侧 `-ss`
- 输出文件不存在时抛出明确错误：`未能抽取到视频帧，请更换素材或稍后重试`

提交：`2c4e8fd fix: extract video frames with input-side seek`

### 实测（4 秒 97 帧视频）

| 命令 | 结果 |
|---|---|
| `-i input -ss 4.046`（旧） | exit 0，无文件 |
| `-ss 3.9 -i input` | exit 0，输出 1 帧 |
| `-sseof -0.1 -i input` | exit 0，输出 1 帧 |
| `-sseof -0.04 -i input` | exit 0，无文件 |
