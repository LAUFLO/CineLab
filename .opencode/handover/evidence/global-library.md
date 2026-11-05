# 全局资产库与节点一键入库

日期：2026-11-05

## 目标

- 资产库从项目级改为全局级，默认 `文档/CineLab Assets`
- 支持自定义、多级文件夹，默认创建：角色、场景、道具、风格、音频、提示词
- 节点工具栏新增「入库」，弹出资产库窗口选择目标文件夹，支持新建
- 资产库从左侧侧边栏改为居中大悬浮窗
- 提示词模板改为全局 `提示词/*.prompt.json`，不再使用项目内 characters/materials/templates JSON

## 关键实现

- `src/shared/asset-schema.ts`：`AssetScope = 'project' | 'global'`
- `src/shared/canvas-schema.ts`：`OutputRef.scope`
- `src/shared/project-schema.ts`：Zod schema 补 `scope` / `width` / `height`，避免保存时剥离
- `src/main/library/config.ts`：全局库根配置（userData/library.json）、默认路径、默认文件夹
- `src/main/library/store.ts`：扫盘、文件夹 CRUD、导入、节点复制、角色投影
- `src/main/library/templates.ts`：`提示词/*.prompt.json` 读写
- `src/main/protocol.ts`：`cinelab-asset://global/...` 走库根，`local` 走项目根
- `src/main/ipc/generate.ts`：参考图按 scope 从项目根或库根解析
- `src/renderer/src/panels/library/*`：大窗口、文件夹树、资产网格、模板网格、命名/模板弹窗

## 验证

1. `corepack pnpm typecheck` 通过。
2. 启动后自动创建 `文档/CineLab Assets` 及 6 个默认文件夹。
3. 调用 `library.addAsset` 将项目内图片写入 `场景/雪夜街道.png`，文件存在。
4. 资产库窗口显示 6 个默认文件夹、面包屑、资产卡片、模板卡片。
5. 资产卡片「添加到画布」创建节点，图片经 `cinelab-asset://global/...` 正常加载。
6. 重启应用后节点仍显示，画布 JSON 中 `scope: "global"` 保留。
7. 节点工具栏出现「下载 / 展开 / 入库」；点击「入库」进入选择模式，选中「角色」后「加入到这里」可用，确认后文件写入 `角色/<节点标题>.png`，窗口关闭。
8. 同名入库自动生成 `图片节点 1 (2).png`。
9. 默认文件夹禁止重命名/删除，返回「默认文件夹不能重命名或删除」。
10. 提示词模板保存为 `提示词/雪夜电影感.prompt.json`，模板卡片「使用」可填充 prompt bar。
11. `listCharacters()` 从「角色」文件夹扫描出角色及参考图。

## 遗留

- 导出项目 zip 尚未打包全局资产引用，换机器打开会断图。
- 旧项目内 `library/` 数据不再读取，未做迁移（确认当前无真实用户）。
- 资产网格直接加载原图，未做缩略图缓存。
- 画布上保留了本次验证新增的 2 个「雪夜街道」测试节点，资产库保留了测试文件：
  - `场景/雪夜街道.png`
  - `角色/图片节点 1.png`
  - `角色/图片节点 1 (2).png`
  - `提示词/雪夜电影感.prompt.json`
