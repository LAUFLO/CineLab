# 逐帧拉片 P3 验证

日期：2026-11-08
分支：`film-study`
关联：`docs/film-study-plan.md`、`FILM-STUDY-P3`

## 范围

P3 结构/情绪可视化：

- 「笔记 / 结构 / 情绪」标签页
- 剧情泳道
- 结构树
- 观众情绪曲线
- 段落剧情线/结构角色编辑
- AI schema/prompt 支持 primaryLine、sharedLines、structureRole

## 实测

使用带以下数据的 study：

- storyLines：主线、情感线
- segments：
  - 建立目标（主线，共用情感线，结构角色「铺垫」）
  - 压力升级（主线，结构角色「冲突」）
- audienceCurvePoints：
  - 好奇 20
  - 压力上升 45
  - 冲突爆发 82
  - 余波 60

结果：

- 结构页：
  - 主线 2 个段落
  - 情感线 1 个段落（共用段落）
  - 结构树「铺垫 1」「冲突 1」
- 情绪页：
  - SVG 曲线显示 4 个点
  - 点颜色区分紧张/释放等情绪
  - 点击「压力上升」，视频 `currentTime = 1.5`
- 标签页切换正常，原笔记编辑页不受影响

截图：

- `shot-study-structure.png`
- `shot-study-emotion.png`

## 验证

```text
corepack pnpm typecheck  通过
corepack pnpm test       9 files / 26 tests 通过
corepack pnpm build      通过
```

## 未实现

- CineLab 直连多模态分析（仍使用导出 AI 包 + 导入 JSON）
- 字幕提取与 srt
