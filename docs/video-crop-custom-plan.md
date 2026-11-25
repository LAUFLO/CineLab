# 画面裁切自定义比例方案

日期：2026-11-25
状态：已实施（真实视频待复测）
适用版本：v0.5.x
最后核对：2026-11-25

> 目标：移除没有意义的“原比例”裁切，补充常用比例，并提供自定义宽高比；仍然按画面中心裁切。

## 1. 背景

视频节点的「画面裁切」原来只有 16:9、9:16、1:1、原比例四项：

- “原比例”不会改变画面，需要原尺寸就不该裁切，入口没有意义。
- 比例档位太少，4:3、3:4、21:9 等常用画幅无法直接选择。
- 没有自定义入口，2.35:1 等画幅无法裁切。

## 2. 最终决策

| 决策 | 结论 |
|---|---|
| 原比例 | 删除 |
| 预设比例 | 16:9、9:16、1:1、4:3、3:4、21:9 |
| 自定义 | 菜单增加“自定义…”，输入宽高比，例如 4:5、2.35:1 |
| 裁切方式 | 居中裁切，宽高向下取偶以适配 H.264 |
| Agent | `video-crop` 的 `itemId=custom` 必须带 `params.ratio`；不传或非法时返回可读错误 |

## 3. 目标交互

1. 视频节点工具栏点击「画面裁切」。
2. 菜单展示 6 个预设比例和「自定义…」。
3. 选择预设后直接裁切。
4. 选择「自定义…」打开对话框：
   - 宽、高两个数字输入，默认 16:9；
   - 支持 `4:5`、`2.35:1` 等小数比例；
   - 确认后按比例居中裁切。
5. 结果创建新节点，节点标题带裁切比例。

## 4. 实现设计

### 4.1 共享比例工具

在 `src/shared/media.ts` 增加：

- `parseAspectRatio(input)`：支持 `16:9`、`4/5`、`2.35:1`、`4x5`；比例限制 1:20 到 20:1。
- `centerCropRect(sourceWidth, sourceHeight, targetRatio)`：计算居中裁切矩形，宽高向下取偶。

### 4.2 主进程

`src/main/media/video.ts`：

- 删除固定比例白名单。
- `cropVideo` 使用 `parseAspectRatio` 校验任意合法比例。
- 使用 `centerCropRect` 计算 `crop=w:h:x:y`。
- 模型名保留 `本地画面裁切（比例）`。

### 4.3 UI

- `node-operations.ts`：菜单改为 6 个预设 + 自定义，删除原比例。
- `node-operation-runner.ts`：
  - `executeVideoCrop` 接收 `params.ratio`；
  - `custom` 且无比例时，UI 打开对话框，Agent 返回 `needsUi` 错误；
  - 有比例时校验并裁切。
- 新增 `VideoCropDialog.tsx`，复用 `Dialog`、`Input`、`Button`，不新建浮层。
- `NodeToolbar.tsx`：处理 `video-crop-dialog` 效果和确认回调。

### 4.4 Agent

- `video-crop` 的 `itemOptions` 增加 `4:3`、`3:4`、`21:9`、`custom`。
- `params.ratio` 仅 `custom` 必填，`validateNodeOperationParams` 做格式校验。
- Agent 传 `itemId=custom` + `params.ratio=4:5` 可直接执行。

## 5. 改动文件

| 类型 | 文件 |
|---|---|
| 新建 | `src/renderer/src/canvas/nodes/VideoCropDialog.tsx`、`src/shared/__tests__/media.test.ts`、本方案 |
| 修改 | `src/shared/media.ts`、`src/main/media/video.ts` |
| 修改 | `src/renderer/src/canvas/nodes/node-operations.ts`、`node-operation-runner.ts`、`NodeToolbar.tsx` |
| 修改 | `src/shared/node-operation-specs.ts`、`src/shared/__tests__/node-operation-specs.test.ts` |
| 文档 | `docs/README.md`、`docs/ui-spec.md`、`docs/code-map/02-generation.md`、`docs/code-map/11-feature-index.md` |

## 6. 验收

1. 视频节点「画面裁切」菜单为 16:9、9:16、1:1、4:3、3:4、21:9、自定义…，不再出现原比例。
2. 预设比例裁切结果尺寸正确。
3. 自定义 4:5、2.35:1 能正常裁切，宽高为偶数。
4. 非法比例（空、0、100:1）不能提交。
5. Agent `video-crop` + `itemId=custom` + `params.ratio=4:5` 可执行；缺参数或格式错误返回可读错误。
6. `typecheck`、`test`、`build`、`check:docs`、`check:code-map`、`check:ui` 通过。

## 7. 风险与后续

- 自定义只输入宽高比，不做自由框选；需要局部裁切时后续再评估框选界面。
- `cropVideo` 目前是重新编码，裁切会损失一次画质；后续可评估无损/流复制路径。
- 真实视频上的裁切尺寸和编码兼容性待复测。

## 8. 实施记录

- 2026-11-25：移除原比例，增加 4:3、3:4、21:9 和自定义宽高比对话框；主进程改为解析任意合法比例。
- 新增 `parseAspectRatio` / `centerCropRect` 单元测试和 `video-crop` Agent 参数校验测试。
