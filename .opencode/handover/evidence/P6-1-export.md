# P6-1 导出

## 范围

- 导出项目：整包 zip
- 导出当前画布：PNG
- 导出选中素材：节点当前输出 / 资产库素材

## 实现

| 文件 | 内容 |
|---|---|
| `src/main/export/zip.ts` | 手写 store 模式 zip 写入器，无新增依赖，跳过 `.lock`、`.trash` |
| `src/main/ipc/export.ts` | `export:project` / `export:canvas-png` / `export:asset` |
| `src/renderer/src/canvas/TopBar.tsx` | 顶栏导出菜单与结果提示 |
| `src/renderer/src/canvas/nodes/CineNodeView.tsx` | 节点 hover 导出按钮（导出当前版本输出） |
| `src/renderer/src/panels/LibraryPanel.tsx` | 素材卡片导出按钮 |
| `src/renderer/src/components/Toast.tsx` | 导出结果全局提示 |

## 命名

- 项目：`<项目名>-YYYYMMDD-HHmmss.zip`
- 画布：`<项目名>-<画布名>-YYYYMMDD-HHmmss.png`
- 素材：`<节点标题或素材名><原扩展名>`

## 验证

- zip 单元测试：中文根目录、跳过 `.lock` 与 `.trash`、二进制内容逐字节一致
- `Expand-Archive` 解压成功，文件数与内容匹配
- 画布 PNG 使用 `capturePage`，导出时隐藏 topbar / bottombar / statusbar / promptbar / 窗口三键 / minimap
- `export:asset` 路径校验：`../../etc/passwd` 返回「资源路径无效」且不弹保存框；不存在的文件返回「资源文件不存在」
- `corepack pnpm typecheck` 通过

## 待人工确认

- 系统保存对话框无法自动化，需要手动点一次三个导出入口
- 导出素材的文件落盘与目标目录

## 限制

- zip 未支持 ZIP64，单项目超过 4GB 会失败
- 早期版本的导出菜单曾包含「导出选中素材」，现改为节点/资产库入口
