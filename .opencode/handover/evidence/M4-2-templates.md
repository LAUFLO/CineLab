# M4-2 模板系统验证

- 日期：2026-11-04
- 方式：CDP 保存模板 + 打开资产库面板 + 点击使用模板

## 数据格式

`library/templates.json`：

```json
{
  "version": 1,
  "templates": [
    {
      "id": "...",
      "name": "雪夜电影感",
      "kind": "image",
      "prompt": "雪夜，冷色调，电影感光影，浅景深",
      "createdAt": "...",
      "updatedAt": "..."
    }
  ]
}
```

## 验证结果

| 项 | 结果 |
|---|---|
| 保存模板 | 通过，`library/templates.json` 写入 |
| 面板 Tab | 通过，角色 / 素材 / 模板三项 |
| 模板卡片 | 通过，显示名称、节点类型、提示词预览 |
| 使用模板 | 通过，面板关闭 |
| 填入 prompt bar | 通过，内容为模板提示词 |
| 无选中节点提示 | 已实现，未单独跑通 |

## 实现要点

- `PromptTemplate` / `TemplateInput` 加入 shared library schema
- 主进程 `library/store.ts` 增加模板 CRUD
- `LibraryApi`、preload、renderer store 同步扩展
- 资产库面板新增「模板」Tab，支持新建/编辑/删除/使用
- 模板使用通过 `useUIStore.applyPrompt` 传给 PromptBar
- PromptBar 监听 `pendingPrompt` 并填入输入框

## 未验证 / 待做

- 模板类型与当前选中节点类型不匹配时只提示「请先选中节点」，没有类型校验
- 素材导入对话框仍需人工验证
