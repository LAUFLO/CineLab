# M4-2 角色一致性验证

- 日期：2026-11-04
- 方式：CDP 选中图片节点 + 角色选择器 + mock `/images/edits` 请求核对

## 链路

```
资产库角色卡（1 张参考图）
  → PromptBar footer「角色」选择器选中
  → characterRefs 合并进 refs
  → generate:run
  → loadRefs 读取角色参考图
  → generateImage 走 multipart /images/edits
  → 新结果追加到节点版本栈
```

## 验证结果

| 项 | 结果 |
|---|---|
| 角色选择器出现 | 通过，图片节点 footer 显示「角色」 |
| 角色菜单 | 通过，列出「测试角色 · 1 张参考图」 |
| 选中角色 | 通过，refs 显示「素材 1」 |
| 请求路径 | 通过，命中 `/v1/images/edits` |
| 请求字段 | 通过，`model / prompt / n / size / image` |
| 参考图文件 | 通过，`reference-0.png` |
| 节点状态 | 通过，`status=done` |
| 版本栈 | 通过，outputs 从 1 增至 2 |

## 实现要点

- PromptBar 新增角色选择器，读取 `useLibraryStore.characters`
- 角色参考图转为 `ReferenceInput`，role 为 `reference`
- 与上游连线 refs 合并后截取前 4 张，连线首尾帧优先
- 切换节点时清空角色选择，避免串用
- 角色菜单底部提供「管理角色库…」入口

## 未验证

- 视频生成链路的角色参考图注入（同一 refs 机制，未单独跑通）
- 多角色同时选择、参考图超过 4 张时的截断提示
- 角色一致性在真实模型上的效果
