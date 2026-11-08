# 逐帧拉片 P0 验证

日期：2026-11-08
分支：`film-study`
关联：`docs/film-study-plan.md`、`FILM-STUDY-P0`

## 范围

P0 拉片台骨架：

- `study` 节点类型
- 视频工具栏「逐帧拉片」
- 帧间隔选择 0.5 / 1 / 2 / 5 秒
- 主进程 ffmpeg 抽帧 + 进度 + 取消
- `study/<id>.json` + `assets/study/<id>/frames/`
- 拉片节点卡片：进度、帧数、进入拉片室
- 拉片室浮窗：播放器 + 帧时间轴
- 点击帧跳转、播放时帧选择跟随

## 实测

使用 4 秒、24fps 测试视频：

1. 视频节点工具栏出现「逐帧拉片」
2. 选择「1 秒 / 帧」
3. 自动创建拉片节点并完成抽帧
4. 拉片节点显示：

```text
4 帧 · 0 段 · 1s/帧
进入拉片室
```

5. study.json：

```json
{
  "sourceNodeId": "video_mw7ap6yq_1",
  "sourceName": "持久化源视频",
  "frameInterval": 1,
  "frames": [
    { "index": 1, "time": 0, "file": "assets/study/.../frame_000001.jpg" },
    { "index": 2, "time": 1, "file": "assets/study/.../frame_000002.jpg" },
    { "index": 3, "time": 2, "file": "assets/study/.../frame_000003.jpg" },
    { "index": 4, "time": 3, "file": "assets/study/.../frame_000004.jpg" }
  ],
  "segments": []
}
```

6. 进入拉片室：

- 浮窗显示 4 帧、1s/帧、24fps
- 点击第 3 帧：
  - `video.currentTime = 2`
  - 选中索引 = 2
  - 右侧时间 `00:02.0`

7. 保存项目并重新加载：

- 拉片节点仍在
- `studyId`、`sourceNodeId`、`sourcePath`、`studySummary` 完整
- 「进入拉片室」仍可打开

## 验证

```text
corepack pnpm typecheck  通过
corepack pnpm test       7 files / 21 tests 通过
corepack pnpm build      通过
```

截图：`shot-study-room.png`（会话临时目录）

## 后续

P1：帧备注、段落编辑、播放本段、Markdown 导出、当前帧/12 帧拼图/段落摘要放回画布。
