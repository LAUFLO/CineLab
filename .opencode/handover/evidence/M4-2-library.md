# M4-2 资产库 MVP 验证

- 日期：2026-11-04
- 方式：CDP 调用 preload API + 点击真实 UI + 检查项目文件

## 数据格式

```
<project>.cinelab/library/
├─ characters.json     角色卡数组
├─ characters/         角色参考图
├─ materials.json      素材数组
└─ materials/          导入素材文件
```

## 验证结果

| 项 | 结果 |
|---|---|
| 保存角色卡 | 通过，返回完整 `CharacterCard` |
| 角色参考图落盘 | 通过，`library/characters/…….png` |
| 资产库面板打开 | 通过，状态栏「资产管理」可打开 |
| Tab 切换 | 通过，角色 / 素材两个 Tab |
| 角色卡展示 | 通过，名称、描述、参考图数量正确 |
| 添加到画布 | 通过，节点数 1→2，新节点标题「测试角色」 |
| 画布图片地址 | 通过，`cinelab-asset://local/library/characters/…….png` |
| 素材空状态 | 通过，显示引导文案 |
| 导入素材按钮 | 通过，素材 Tab 内存在 |

## 实现范围

- 共享 schema：`src/shared/library-schema.ts`
- 主进程存储：`src/main/library/store.ts`（角色 CRUD、素材导入、SHA-256 去重）
- IPC：`src/main/ipc/library.ts`，preload 暴露 `window.api.library.*`
- 渲染层：`src/renderer/src/stores/library.ts`、`panels/LibraryPanel.tsx`
- 入口：状态栏「资产管理」、prompt bar「上传 / 角色库」

## 未验证 / 待做

- 素材导入需要系统文件对话框，自动化只验证了空状态与按钮
- 角色参考图选择对话框未端到端验证
- 模板系统未实现
- 角色一致性生成（自动把角色参考图注入生成请求）未实现
