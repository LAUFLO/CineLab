# 视频控件、对齐虚线、音频波形样式

日期：2026-11-08
关联：`MEDIA-NODE-POLISH-1`、`docs/film-study-plan.md`

## 1. 视频节点控件

原来使用浏览器原生 `<video controls>`，样式与应用不一致。

改为自定义 `VideoPlayer`：

- 应用内播放/暂停、上一帧、下一帧、时间、帧号、静音、全屏
- 底部进度条使用应用 token，不再出现原生控件
- 默认静音，避免画布多个视频同时出声
- 加载 metadata 后轻推 0.001s，修复首帧黑屏
- 帧率优先取节点 `fps`，没有时通过 `media.probe` 读取

## 2. 对齐虚线

问题：`.alignment-guides` 使用 `position: fixed; top: 40px`，而 `flowToScreenPosition` 返回的是窗口坐标，导致水平引导线整体下移 40px，看起来落在节点内部。

修复：引导层改为 `top: 0`。

实测：拖动视频节点使底边与音频节点底边对齐：

- 引导线 `rect.top = 468`
- 视频节点 `bottom = 468`
- 不再偏移 40px

## 3. 音频波形样式

参考用户提供的目标样式：

- 柱数从 96 调整为 64
- 柱子更宽、间距更大、圆角更明显
- 保持以中线上下对称
- 去掉波形区域内的点阵背景，改为纯 `--surface` 面板
- 波形颜色改为 `--text-2`

实测 64 根柱，高度从中间上下对称展开。

## 验证

```text
corepack pnpm typecheck  通过
corepack pnpm test       7 files / 21 tests 通过
corepack pnpm build      通过
```

## 截图

- `shot-video-controls2.png`：自定义视频控件 + 64 柱音频波形
- `shot-alignment-drag.png`：拖动时虚线落在节点底边
