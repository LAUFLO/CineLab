# 打包：剩余本地增强（2026-11-07）

## 范围

- K9 项目导出包含全局资产
- K11 资产缩略图缓存
- K24 视频合成多轨音频（原声 / BGM / 旁白独立音量）
- K2 文本流式/多轮已按用户要求移除，等 Agent 阶段再做

## 构建

- 提交：`144ac61`
- CI：https://github.com/LAUFLO/CineLab/actions/runs/42368040739
- 结果：成功（3m11s）
- 步骤：typecheck → test（18 passed）→ check:encryption → build → electron-builder → artifact

## 产物

- `CineLab Setup 0.1.0.exe`：163,956,041 字节（约 156MB）
- `CineLab-0.1.0-win.zip`：208,772,681 字节（约 199MB）
- 下载目录：`C:\Users\LAUFLO\Downloads\cinelab-144ac61`

## 验收重点

1. 含全局素材的项目导出 zip，解压后画布不再引用 `global` 路径
2. 资产库首次打开生成缩略图，二次打开复用；视频卡片显示首帧
3. 视频合成选择旁白、调整原声/BGM/旁白音量，输出音轨正常
4. 文本节点保持一次性返回，不出现流式/对话入口

## 测试

- 6 个测试文件 / 18 用例通过
- 新增 K9 导出改写测试、K24 真实 ffmpeg 混音测试
