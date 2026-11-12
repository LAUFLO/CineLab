# 项目模板方案（P3-2）

日期：2026-11-07
状态：已完成

## 模板

| ID | 名称 | 结构 |
|---|---|---|
| `blank` | 空白项目 | 无节点 |
| `storyboard` | 分镜脚本 | 2×2 分镜组 + 4 个图片节点，显示序号 |
| `product` | 产品广告 | 卖点文本 → 主图/场景/细节 → 广告片 |
| `character` | 角色短片 | 角色设定 → 四视图/场景/分镜 → 短片 |

模板只生成画布结构、提示词文本和连线，不预置模型、Key 或素材。

## 实现

- `src/shared/project-templates.ts`：
  - `PROJECT_TEMPLATES` 元数据
  - `buildTemplateCanvas(templateId, canvasId)` 生成 `CanvasData`
  - 分镜组使用 `mode: 'storyboard'`、2 列、16:9、显示序号
  - 产品/角色模板使用文本节点承载提示词，图片/视频节点留空
- 主进程 `createProject(name, parentDir, templateId)` 使用模板画布
- IPC `project:create` / `project:pick-create` 增加 `templateId`
- preload 与项目 store 透传模板 ID
- 欢迎页「新建项目」先打开应用内模板选择器，再进入系统保存对话框

## 验收

- 欢迎页点击新建项目出现模板选择器（4 个模板）
- `storyboard`：5 个节点、0 条边，2×2 分镜组显示序号 01-04
- `product` / `character`：5 个节点、4 条边
- 截图画布结构正常，分镜组工具栏可用
