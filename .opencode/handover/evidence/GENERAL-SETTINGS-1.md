# 通用设置第一版验证

日期：2026-11-07
关联：`docs/general-settings-plan.md`、`GENERAL-SETTINGS-1`

## 范围

设置页新增「通用」分区，主题继续保留独立「外观」分区。实现 11 项：

1. 启动时打开最近项目
2. 自动保存间隔
3. 网格吸附
4. 显示小地图
5. 默认模型（图片/视频/文本/音频）
6. 生成并发数
7. 生成完成系统通知
8. AutoLink 默认开启
9. 生成历史保留条数
10. 减少动效
11. 打开数据目录 + 重置设置

## 实现

- `src/shared/preferences.ts`：偏好类型、默认值、逐字段校验
- `src/main/settings/preferences.ts`：`userData/preferences.json` 读写与串行写盘
- IPC：`settings:get-preferences` / `save-preferences` / `reset-preferences` / `open-data-dir`
- `src/renderer/src/stores/preferences.ts`：渲染层偏好 store，乐观更新 + 串行写盘
- 主进程启动时应用生成并发；`project:bootstrap` 读取「启动打开最近项目」
- `project` store 读取自动保存间隔
- `generation` store 在窗口不在前台时发送系统通知
- `generation-history` 按偏好裁剪并持久化
- `PromptBar` 读取默认模型与 AutoLink，切换模型时写回偏好
- `StatusBar` 吸附/小地图改为读写偏好
- `App` 加载偏好并应用减少动效、历史裁剪

## 实测

隔离实例 `dev:isolated`，测试项目 `general-test.cinelab`：

- 设置页出现「通用」且默认打开，15 个设置行
- 同时切换网格吸附、小地图、减少动效：
  - `preferences.json` 三个值都为 true
  - 小地图出现
  - `<html data-reduce-motion="true">`
- 自动保存间隔改为 300 毫秒，偏好文件写入 300
- 生成历史改为 20 条，偏好写入 20
- AutoLink 改为关闭，偏好写入 false；Prompt Bar 高级开关显示关闭
- 配置测试图片模型并设为默认图片模型：
  - 偏好写入 `providerId/general-image`
  - Prompt Bar 模型 chip 显示「通用测试图片模型」
- 点击「重置通用设置」并确认：
  - 所有偏好恢复默认
  - 小地图关闭、减少动效关闭、启动开关恢复开启
  - 模型配置和资产库路径未受影响
- 关闭「启动时打开最近项目」后重启实例：
  - 进入欢迎页
  - 不自动打开最近项目
- 打开数据目录：IPC 已接入 `shell.openPath(userData)`

## 验证

```text
corepack pnpm typecheck  通过
corepack pnpm test       7 files / 21 tests 通过
corepack pnpm build      通过
```

新增 `src/shared/__tests__/preferences.test.ts`，覆盖默认值、合法值、非法值回退。

## 说明

- 生成完成通知按「窗口不在前台」触发，需要真实生成任务验证系统通知外观。
- 生成并发数在保存偏好时同步到主进程队列；未做运行时并发压力测试。
- 主题仍由「外观」分区管理，后续在该分区扩展连线颜色等自定义。
