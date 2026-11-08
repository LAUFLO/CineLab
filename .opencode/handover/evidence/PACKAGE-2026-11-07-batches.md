# 整体打包：批次 1-3（2026-11-07）

## 范围

- 批次 1：蒙版编辑器、重绘/擦除/元素编辑、720 全景、操作状态改造
- 批次 2：InSPyReNet + LaMa 视觉组件、抠图/图层分离、视频抠像、智能去字幕、主体消除、本地扩图
- 批次 3：专用视频 HTTP 模板、视频输入、multipart、操作模型绑定

## 构建

- 提交：`02d921b`
- CI：https://github.com/LAUFLO/CineLab/actions/runs/42364183939
- 结果：成功（3m53s）
- 步骤：typecheck → test（15 passed）→ check:encryption → build → electron-builder → artifact

## 产物

- `CineLab Setup 0.1.0.exe`：163,955,014 字节（约 156MB）
- `CineLab-0.1.0-win.zip`：208,771,220 字节（约 199MB）
- 下载目录：`C:\Users\LAUFLO\Downloads\cinelab-02d921b`

## 视觉组件

- Release：https://github.com/LAUFLO/CineLab/releases/tag/vision-components-v1
- `vision-models-win32-x64-v1.zip`：526,828,343 字节
- 许可证：InSPyReNet MIT + LaMa Apache-2.0
- 安装位置：设置 → 组件 → 视觉模型（InSPyReNet + LaMa）
- 依赖：先安装深度动作捕捉运行时

## 验收清单

1. 安装新包，项目数据/模型配置保留
2. 图片节点：重绘、擦除、元素编辑的蒙版编辑器；720 全景查看器
3. 设置 → 组件：安装视觉模型（约 527MB），确认进度/暂停/卸载
4. 图片节点：图层分离、本地抠图、本地扩图
5. 视频节点：智能抠像、智能去字幕（框选）、主体消除（框选）
6. 设置 → 操作模型：给四个视频操作绑定专用 HTTP 模板模型
7. 视频节点：片段重拍/元素替换/智能续写/创意片头（需要真实专用 API）
8. 回归：模型服务、PromptBar 设置面板、资产库标签/合成、日志目录

## 已知限制

- 智能去字幕仍需手动框选，自动字幕检测未接入
- 视频抠像/修复限制 10 秒，CPU 较慢
- 专用视频接口只验证了 JSON data URL；multipart 待真实 API 联调
- 4 秒 720P 视频 data URL 约 8MB，长视频需要接口支持大请求
- 多轨音轨混合、自动更新真实 Release 仍未验证
