# 模型接入、多选工具栏与分组设计

日期：2026-11-05

## 本轮完成

| 项 | 提交 | 验证 |
|---|---|---|
| 画布右键菜单、左键框选、中键平移、撤销/重做、节点/系统剪贴板粘贴 | `97ea20d` | CDP 框选 3 节点、拖动撤销/重做、剪贴板文本/图片粘贴 |
| Agnes 图片/图生图、Agnes 视频、`audio.music` 执行器 | `6a288ea` | 文生图、图生图真实成功；音乐 mock 成功；视频受队列 503 |
| `models.json` 外部模型配置、只读 JSON provider、删除确认 | `cd8f26c` `efc7647` | 临时 JSON provider 合并、PromptBar 生成、删除弹窗 |
| 视频适配器：可灵、MiniMax H3/旧版、智谱、Vidu、http-template | `b85b6e9` | mock 全链路通过，JWT 三段校验通过 |
| 多选工具栏：保存到资产、创建副本、导出 zip、删除；多选隐藏单节点 UI | `30b7e75` | 4 节点多选、6→10 副本、10→6 删除、资产入库 |
| 分组节点设计文档 | `docs/group-nodes.md` | 设计完成，待实现 |

## 验证细节

- 智谱：`/videos/generations`，Bearer，文生 + 首尾帧
- Vidu：`/ent/v2/text2video`、`/ent/v2/img2video`，`Token` 鉴权
- MiniMax H3：`/v2/video_generation` → `/v2/query/...`
- MiniMax Hailuo：`/v1/video_generation` → `file_id` → `/v1/files/retrieve`
- 可灵：API Key 和 AK/SK JWT 两种模式，JWT payload 含 `iss/exp/nbf`
- 多选：选中 4 节点时 prompt bar 0、节点工具栏 0、多选工具栏 386×42
- `corepack pnpm typecheck` 通过
- `models:check models.example.json` 通过

## 设计决策

- 分组使用 React Flow `parentId`，子节点坐标相对组
- 组颜色 10 个预设：blue/cyan/teal/green/lime/amber/orange/rose/violet/slate
- 组内排列：横排、竖排、网格三种
- 删除同时提供「解组」和「删除组和节点」
- 拖出组按节点中心点判断：中心在组外即脱离；边缘超出但中心在组内则扩组
- 空组保留，不自动删除
- v1 不支持嵌套组

## 待验证 / 限制

- 智谱、Vidu、MiniMax、可灵没有真实 Key，只经过本地 mock 验证
- Agnes 视频免费队列持续 `503 video_queue_full`
- 多选导出 zip 依赖原生保存对话框，未人工确认落盘
- 项目 `assets` 下有测试遗留的孤儿图片/视频素材
- 分组功能尚未编码

## 校验与文档

- `models.example.json`
- `docs/models.md`
- `docs/group-nodes.md`
- `scripts/mock-video.mjs`
- `scripts/models-check.mjs`
