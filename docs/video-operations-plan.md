# 视频专用操作：内嵌面板 + 模型能力（片段重拍 / 元素替换 / 智能续写）

日期：2026-11-08
分支：`feat/video-operations`
状态：实施中
删除：创意片头、设置页「操作模型」绑定页

## 1. 目标

1. 删除设置页「操作模型」页，改为模型自身声明支持的操作。
2. 三个视频操作在视频节点旁以内嵌面板完成，不再使用居中弹窗。
3. 操作时选择模型；不支持该操作的模型置灰并显示原因。
4. 片段重拍/元素替换支持时间区间；元素替换支持上传、画布图片、资产库图片。
5. 接口返回完整视频或新增片段，片段由主进程拼回源视频。
6. 时间区间复用剪辑台的缩略帧能力，先做轻量片段条，后续升级完整时间轴。

## 2. 功能定义

### 片段重拍

- 输入：源视频、时间区间、提示词。
- 输出：接口返回完整视频，或返回重拍片段。
- 片段返回时拼接：`原视频 [0,start] + 重拍片段 + 原视频 [end,duration]`。

### 元素替换

- 输入：源视频、时间区间、替换目标图片（1 张）、提示词。
- 图片来源：本地上传、画布图片节点、资产库。
- 输出与拼接同片段重拍。

### 智能续写

- 输入：源视频、方向（向后/向前）、新增时长、提示词。
- 输出：完整视频或新增片段。
- 片段返回时：
  - 向后：`源视频 + 新增片段`
  - 向前：`新增片段 + 源视频`

## 3. 模型能力

`ModelDef` 增加：

```ts
operations?: VideoOperationId[] // shot-retake / element-replace / extend
```

`models.json` 同步支持。设置页模型卡片增加「支持的操作」，和「输入能力」并列。

操作可用条件：

1. `capability === 'video.t2v'`
2. `adapter === 'http-template'`
3. `template` 存在
4. `operations` 包含当前操作

不满足的模型保留在选择列表中并置灰，显示具体原因。

## 4. 内嵌面板

- 触发：节点工具栏「片段重拍 / 元素替换 / 智能续写」。
- 位置：视频节点右侧/下方的浮动面板，使用 `flowToScreenPosition` 定位，不随节点缩放。
- 结构：
  - 顶部：操作切换（三个 tab）。
  - 源视频预览。
  - 时间区间：缩略帧条 + 开始/结束滑块 + 时间标签（片段重拍/元素替换）。
  - 替换素材（元素替换）：缩略图 + 上传/画布/资产库选择。
  - 模型选择：仅列 `video.t2v`，不可用置灰。
  - 描述输入。
  - 生成按钮。
- 状态：新增 `useVideoEditStore` 管理 `nodeId`、`operation`、打开/关闭。

## 5. http-template 变量

| 变量 | 说明 |
|---|---|
| `{{video.start}}` | 区间开始秒数 |
| `{{video.end}}` | 区间结束秒数 |
| `{{video.duration}}` | 续写新增时长 |
| `{{video.direction}}` | forward / backward |
| `{{video.operation}}` | shot-retake / element-replace / extend |

`HttpTemplate` 增加 `videoResult?: 'full' | 'segment'`，默认 `full`。

## 6. 结果拼接

- `videoResult: full`：直接使用接口返回视频。
- `videoResult: segment`：
  - 续写按方向拼接源视频。
  - 片段重拍/元素替换裁剪前后段后拼接。
- 拼接使用 `concatVideoFiles`，统一分辨率/帧率/音频编码，保留源视频宽高比。

## 7. 删除项

- 设置导航「操作模型」与 `OperationsSection`。
- `settings.json` 的 `operationBindings` 不再读取；旧数据忽略。
- 节点工具栏「创意片头」。
- 旧 `VideoOperationDialog` 居中弹窗。

## 8. 实施顺序

1. 共享类型与模型能力（`operations`、`videoResult`、`videoOptions`）。
2. 设置页：模型「支持的操作」；删除操作模型页。
3. 内嵌面板：`VideoEditPanel` + `useVideoEditStore` + 缩略帧时间条。
4. 后端：模板变量、结果拼接。
5. 文档、测试、CDP 验证。

## 9. 验收

- 设置页不再有「操作模型」。
- 模型卡片可勾选三个操作。
- 视频节点工具栏打开内嵌面板，不再弹居中对话框。
- 不支持操作的模型置灰并显示原因。
- 片段重拍/元素替换可选时间区间；元素替换可选画布/资产库/上传图片。
- 智能续写可选方向和时长。
- `videoResult: segment` 时输出拼接后的完整视频。
- typecheck / test / build 通过。
