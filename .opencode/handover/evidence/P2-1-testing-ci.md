# P2-1 最小测试与 CI

日期：2026-11-07

## 实现

- 引入 `vitest 5.1.0`
- `vitest.config.ts`：Node 环境，`@shared` alias
- 新增测试（4 文件 / 15 用例）：
  - `src/shared/__tests__/canvas-schema.test.ts`：节点默认尺寸、标题高度、模板
  - `src/main/media/__tests__/paths.test.ts`：路径穿越与绝对路径拦截
  - `src/main/providers/__tests__/headers.test.ts`：自定义请求头合并与环境变量插值
  - `src/main/settings/__tests__/models-config.test.ts`：models.json 校验、明文 Key 警告、重复 ID、headers 类型
- `package.json` 增加 `test: vitest run`
- `.github/workflows/build-win.yml` 增加 `pnpm test`

## 验证

`corepack pnpm test`：4 passed，15 passed。
