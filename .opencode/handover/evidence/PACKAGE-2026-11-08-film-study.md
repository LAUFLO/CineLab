# film-study 合并与打包（2026-11-08）

## 合并

- `190daed Merge branch 'film-study' into main`
- `732ad8b fix: narrow prompt bar node kind after merge`

冲突处理：

- `state.json`：保留剪辑室 frontier，补入 FILM-STUDY-P0–P4 与 8 条拉片经验
- `canvas-schema.ts`：NODE_META 同时保留 studio、film、study
- `project-schema.ts`：nodeKind 增加 study，保留 outputRefSchema
- `ipc-contract.ts` / `preload/index.ts` / `ipc/index.ts`：同时注册 timeline 与 filmStudy
- `App.tsx`：同时挂载 StudioWindow 与 FilmStudyRoom
- `PromptBar.tsx`：节点收窄为 cine 且排除 study，模型菜单保留输入能力置灰与 capabilityGroup
- `NodeSearch.tsx`：ICONS 同时包含 studio、film、study

## 验证

```text
corepack pnpm typecheck  通过（主仓库）
corepack pnpm test       19 files / 102 tests 通过
corepack pnpm check:encryption  通过（CI）
corepack pnpm build      通过
```

合并后隔离实例冒烟：

- study 节点显示「进入拉片室」，拉片室播放器、时间轴、右侧面板正常
- 画布右键「剪辑室」可创建并打开剪辑室，素材池、时间线、属性面板正常
- 两者互不干扰

## CI 打包

- 首次 run 42449784963 失败：合并提交漏掉 PromptBar 两处类型修复
- 修复提交 732ad8b 后 run 42449888036 成功（2m40s）
- 产物已下载到 `C:\Users\LAUFLO\Downloads\cinelab-732ad8b`：
  - `CineLab Setup 0.1.0.exe` 156.5 MB
  - `CineLab-0.1.0-win.zip` 199.2 MB
