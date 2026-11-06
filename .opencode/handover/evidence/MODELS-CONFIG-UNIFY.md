# MODELS-CONFIG-UNIFY · 验证记录

日期：2026-11-06
范围：模型供应商配置统一（P0/P1 以外的设置项重构）

## 目标

- `models.json` 成为唯一的供应商/模型清单
- `settings.json` 只保存加密 Key/Secret
- 设置页不再区分配置来源，新增/编辑/删除直接写 `models.json`
- 迁移旧 `settings.json` 的 `providers`，迁移后删除旧字段

## 变更文件

- `docs/models-config-unify-plan.md`（新增）
- `docs/models.md`
- `src/shared/models-file.ts`
- `src/shared/provider-schema.ts`
- `src/shared/ipc-contract.ts`
- `src/main/settings/models-config.ts`
- `src/main/settings/store.ts`
- `src/main/settings/models-watch.ts`（新增）
- `src/main/index.ts`
- `src/preload/index.ts`
- `src/renderer/src/panels/SettingsPanel.tsx`
- `src/renderer/src/styles/global.css`
- `scripts/models-check.mjs`

## 验证结果

### 类型与构建

- `node scripts/typecheck.mjs`：通过（TypeScript 7）
- `corepack pnpm build`：通过（main / preload / renderer 均成功）

### 迁移（隔离实例）

测试环境：临时 userData，复制真实旧版 `settings.json`（2 个 provider）与空 `models.json`。

迁移后：

- `settings.json` 变为 `version: 2`，仅保留 `providerKeys`，两个加密 Key 原样保留
- `models.json` 写入 Mock OpenAI、MOSS 两个供应商，共 3 个模型
- 旧 `providers` 字段已删除

### UI

- 顶部标题显示「模型供应商配置」
- 路径、供应商/模型计数、重新加载、打开文件按钮保留
- 供应商卡片不再显示 `models.json` 标记和「只读」
- 计数正确显示「2 个供应商 · 3 个模型」

### 保存 / 删除

- 通过设置 API 新建 `E2E Test` 供应商（带测试 Key）：
  - `models.json` 新增该供应商，且不包含 `apiKey` 字段
  - `settings.json` 的 `providerKeys` 新增对应加密 Key
  - `models.json` 中未出现明文 `sk-test-secret`
- 删除该供应商后，`models.json` 与 `providerKeys` 均清理

### 手工编辑与监听

- 手工向 `models.json` 追加带明文 `apiKey` 的供应商：
  - 设置页自动刷新出 `Manual Test`
  - 显示警告：`providers[2].apiKey 是明文 Key，已忽略；请在设置页填写 Key，或改用 apiKeyEnv`
- 删除后列表恢复

### 校验脚本

- `node scripts/models-check.mjs <迁移后的 models.json>`：通过
- 带明文 `apiKey` 的文件：输出警告，退出码 0

## 未验证 / 后续

- 真实用户数据目录的迁移：下次启动应用时自动执行（测试使用隔离目录）
- 打包态：本次只做了 build，未重新打安装包
- `state.json` 尚未加入该完成项
