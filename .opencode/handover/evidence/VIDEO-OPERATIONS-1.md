# 视频专用操作：模型能力 + 内嵌面板

日期：2026-11-08
状态：完成（待提交）
分支：`feat/video-operations`

## 背景

原实现把「片段重拍 / 元素替换 / 智能续写 / 创意片头」压缩成同一个居中弹窗：只填提示词，整段视频提交给绑定的 http-template 接口，结果替换节点。缺少时间区间、替换目标、续写方向/时长和片段拼接。

本次按 LibTV 的交互重新实现：

- 删除「创意片头」。
- 删除设置页「操作模型」绑定页。
- 模型声明支持的操作，操作时选模型，不支持置灰。
- 视频节点右侧内嵌面板，不再居中弹窗。
- 片段重拍/元素替换支持时间区间，元素替换支持上传/画布/资产库。
- 接口返回完整视频或片段，片段自动拼回源视频。

## 数据与能力

- `ModelDef.operations?: VideoOperationId[]`，`models.json` 支持 `operations`。
- `inferModelOperations()` 按 http-template 中的 `video.start` / `video.end` / `video.duration` / `video.direction` 推断。
- 设置页模型卡片「模型能力」同时编辑输入能力和支持的操作。
- 删除 `OperationsSection` 和设置导航「操作模型」。
- `settings.json` 的 `operationBindings` 不再读取，旧 `intro` 绑定被过滤。

## 视频操作节点

- 新增 `video-op` 节点类型、`addVideoOpNode` / `patchVideoOpNode`。
- 点击「片段重拍 / 元素替换 / 智能续写」在源节点右侧 80px 创建对应功能节点并连线；同源同操作已存在时选中并展开。
- 功能节点不能切换操作，参数区在节点卡片内展开：
  - 源视频预览。
  - 缩略帧条（`media:thumbnail` 抽 10 帧）+ 时间区间滑块。
  - 元素替换：上传 / 画布 / 资产库选择替换图。
  - 模型列表：视频模型全列，不是 http-template、缺模板、未声明操作时置灰并显示原因。
  - 描述和开始生成。
- 点击开始生成后创建普通视频结果节点，连线 `功能节点 → 结果节点`；功能节点保留，可再次生成。

## 后端

- `GenerateRequest.videoOptions`：operation / range / duration / direction。
- `HttpTemplate.videoResult?: 'full' | 'segment'`。
- http-template 新增变量：`{{video.start}}`、`{{video.end}}`、`{{video.duration}}`、`{{video.direction}}`、`{{video.operation}}`。
- `applyVideoSegmentResult()`：
  - 续写：源视频 + 片段 / 片段 + 源视频。
  - 片段重拍/元素替换：前段 + 片段 + 后段。
- `concatVideoFiles()` 按源视频宽高统一编码后拼接。

## 验证

- `corepack pnpm typecheck` 通过。
- `corepack pnpm test`：19 个测试文件、102 个用例通过。
- `corepack pnpm build` 通过。
- 隔离实例 CDP 验证：
  - 设置页不再显示「操作模型」。
  - 模型能力对话框显示输入能力和三个操作勾选。
  - 视频节点「更多 → 片段重拍」创建功能节点并连线，参数在节点卡片内展开，没有浮窗。
  - 功能节点显示源视频、10 帧缩略条、时间区间和开始/结束滑块。
  - Agnes Flash（agnes-video）显示「不是专用接口」并置灰；Mock http-template 模型可用并选中。
  - 元素替换 tab 显示「替换素材」，选择器含画布 / 资产库 / 上传。
  - 智能续写 tab 显示向后/向前方向和新增时长。
  - 点击开始生成后创建普通视频结果节点并连线；因 Mock 供应商没有 API Key，结果节点显示生成失败，节点创建和连线正常。
  - 画布保存成功，`project.json` 中 `video-op` 节点可正常持久化。

## 已知限制

- 时间区间第一版为缩略帧条 + 双滑块，尚未替换为剪辑台的完整时间轴。
- 真实视频编辑接口未联调，`videoResult` 和变量需要按供应商模板配置。
- 内嵌面板暂不包含「动作迁移」tab。
- 生成结果仍写回当前节点版本栈，原视频可在版本栈切回。
