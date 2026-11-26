# 关闭确认与后台运行方案

日期：2026-11-26
状态：已实施
类型：跨模块功能（主进程生命周期 / IPC / UI / 设置 / 文档）

## 背景与目标

用户希望：点关闭应用时弹出二次确认，且支持「关闭后继续在后台运行」。

调查发现「关闭前确认」已部分存在，但只在「有未保存修改」时弹；系统托盘与后台运行完全未实现。本方案把它们整合成一套完整的关闭交互，并补齐托盘、自绘菜单、设置项与文档。

## 一、最终决策（已与用户对齐）

| # | 决策 |
|---|---|
| 1 | 点关闭 → 弹确认框，两个按钮「后台运行」（默认高亮）/「退出程序」 |
| 2 | 改为每次关闭都弹（现在是「仅有未保存修改时弹」），带「不再提示」勾选 |
| 3 | 系统托盘：logo 图标，单击恢复主窗口，右键自绘菜单「显示主窗口 / 退出 CineLab」 |
| 4 | 后台继续跑任务；完成通知沿用现有系统通知，点击恢复窗口；弹窗提示「后台任务将持续运行」 |
| 5 | 设置页「通用 → 启动与项目」：复用「关闭前确认」开关（语义改为每次都弹）+ 新增「关闭时默认动作」+「重置关闭确认偏好」 |
| 6 | 范围仅主窗口（只有一个可见 BrowserWindow，其余是 React 面板/离屏导出窗口） |
| 7 | Windows / macOS 统一；macOS 原生「退出 CineLab」走同一确认，`activate` 改为恢复已隐藏窗口而非重建 |
| 8 | 两种动作都先自动保存；保存失败则报错且不关闭、不进后台 |
| 9 | 托盘退出确认用自绘 Dialog（应用风格），确认后 `app.quit()` 走现有清理链 |
| 10 | 托盘右键菜单为自绘透明无边框窗口（复用 Button/Menu + tokens.css），按 `tray.getBounds()` 定位、失焦即关 |
| 11 | 「不再提示」只记忆「后台运行」并直接执行；「退出程序」即使勾选也仍每次弹确认；记忆优先于开关，重置后恢复 |

## 二、现状（代码事实）

- 关闭链路：`WindowControls.tsx:68` → `app.close()` → IPC `window:close` → `win.close()` → `window.ts:86–91` 拦截并发 `app:close-requested` → `App.tsx:99–128` 决定 → `confirmClose()` → IPC `app:confirm-close` → `allowWindowClose()` 放行。
- 已有关闭确认只在 `dirty || saving` 且 `confirmBeforeClose`（默认 true）时弹「保存并退出」；无未保存修改时静默关闭。设置开关在 `GeneralSettingsSection.tsx:263–271`。
- 无托盘、无后台运行（全库无 `Tray`）；关闭即真正退出。
- 可复用资源：`ConfirmDialog`（z-1200）、`Dialog`/`Button`/`Menu`、`tokens.css`；`resources/icon.ico` 含 16×16/32×32 logo；`brandIconPath()`；系统通知点击恢复（`ipc/index.ts:93–115`）；`before-quit` 两段清理链（`index.ts:178–180`、`:200–205`）。
- 单实例 `second-instance` 现有 `restore()+focus()`；macOS `activate` 现为 `createMainWindow()`（需改）。

## 三、已有实现检查

- **复用**：`Dialog`/`ConfirmDialog`/`Button`/`Menu`、`tokens.css`、`brandIconPath`+`icon.ico`、系统通知点击恢复、两段 `before-quit` 清理链、`window.ts` 白名单拦截、`preferences.ts` 偏好结构、`GeneralSettingsSection` 的 `SettingRow` 模式。
- **扩展**：`App.tsx` 关闭处理（三按钮+勾选+保存失败拦截）；`preferences.ts`（在 `project` 分组新增 `closeDefaultAction`、`closeRememberBackground`，含默认值/校验/测试）；`GeneralSettingsSection.tsx`（改 hint + 两项新设置）；`index.ts` 的 `activate`；IPC 契约与 preload（新增托盘相关 API）。
- **新建**：`src/main/tray/`（托盘管理 + 自绘菜单窗口创建/定位）、`src/renderer/src/tray/TrayMenuWindow.tsx`（hash 路由独立渲染树）、`src/renderer/src/components/CloseConfirmDialog.tsx`（专门的关闭确认框，不动通用 `ConfirmState`）、`docs/close-background-plan.md`、相关单测。

## 四、改动点（按文件）

### 主进程

- `src/main/tray/index.ts`（新）：`new Tray(logo)`（16/32，macOS 用模板图）；左/双击恢复主窗口，右键按 `tray.getBounds()` 显示自绘菜单窗口，失焦隐藏；退出 IPC → `app.quit()`。
- `src/main/index.ts`：`activate` 改为「窗口存在但隐藏 → `show()+focus()`，否则新建」；退出前销毁托盘。
- `src/main/ipc/index.ts`：新增 `app:hideToTray`（`hide()`+`setSkipTaskbar(true)`）、`app:restoreWindow`、`tray:showMenu` 等；托盘退出复用 `app.quit()`，不手动逐个调清理函数。
- `src/main/window.ts`：托盘/隐藏时维护 `skipTaskbar` 状态。

### 契约 / preload

- `src/shared/ipc-contract.ts` 的 `CineApi.app` 增加上述 API；`src/preload/index.ts` 同步暴露。

### 渲染进程

- `App.tsx:99–128` 重写关闭处理：记忆命中且为后台 → 自动保存后直接 `hideToTray()`；否则弹 `CloseConfirmDialog`（含「后台运行 / 退出程序 / 取消」+「不再提示」）；后台动作写记忆、退出动作不写；保存失败拦截。
- `CloseConfirmDialog.tsx`（新）：复用 `Dialog`，遵守 `check:ui`（组件库、tokens.css、`bg-overlay`、不硬编码色值、不自建 `shadow-menu`）。
- `TrayMenuWindow.tsx`（新）：自绘菜单，含「显示主窗口 / 退出 CineLab」，后者触发自绘确认弹窗，确认后 `app.quit()`。
- `GeneralSettingsSection.tsx` + `preferences.ts`：设置项与偏好字段、默认值、解析校验。

### 文档 / 工程

- 落本方案文档；更新 `code-map/07`（窗口/托盘生命周期）、`10`（自绘菜单与浮层层级）、`08`、`11`。
- `agent-coverage-exempt.json` 增加豁免（系统级托盘/退出不开放给 Agent），跑 `check:agent-coverage`。
- `corepack pnpm map:code`、`check:docs`、`check:ui`、`typecheck`、`test`；发版时同步 README 中英文核心能力。

## 五、影响模块

`07 存储、IPC 与安全`（主进程生命周期/IPC/preload）、`10 UI 组件与面板`（设置页、自绘菜单、确认弹窗）、`App.tsx` 入口；文档 07/10/08/11 与本文档。

## 六、验收清单

1. Windows 点 X → 弹确认框，双按钮 +「不再提示」，默认高亮「后台运行」，文案含「后台任务将持续运行」「将自动保存」。
2. 有未保存修改时选任一动作先保存；模拟保存失败 → 报错且不关闭、不后台。
3. 选「后台运行」→ 窗口与任务栏图标消失、托盘出现 logo；正在跑的任务继续，完成后系统通知，点击恢复窗口。
4. 托盘单击恢复主窗口；右键弹出应用风格自绘菜单；「显示主窗口 / 退出 CineLab」均可用。
5. 托盘「退出」→ 自绘确认弹窗 → 确认后进程退出，清理链执行（stem 任务/缓存、适配器、MCP）。
6. 勾选「不再提示」+「后台运行」→ 以后点 X 直接后台无弹窗；设置页「重置」后恢复弹窗。
7. 勾选「不再提示」+「退出程序」→ 以后点 X 仍弹确认。
8. 设置页「关闭时默认动作」切换 → 弹窗默认高亮随之改变。
9. macOS：原生菜单退出走同一确认；点击 Dock 图标从后台恢复原窗口（不新建）。
10. `typecheck` / `test` / `check:ui` / `check:docs` / `check:agent-coverage` 通过，并用 `dev:isolated` 实测上述路径。
