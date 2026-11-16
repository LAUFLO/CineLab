# Contributing to CineLab

CineLab is a local-first Electron app. Contributions should keep the app runnable offline and must not add a required server component.

## Setup

Requirements:

- Node.js 24
- pnpm 12 through Corepack
- Windows for the packaged build; development on other platforms is not currently verified

```bash
corepack pnpm install
corepack pnpm dev
```

Use `corepack pnpm dev:isolated` for a test instance with its own CDP port and temporary user data.

## Before opening a pull request

```bash
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test:coverage
corepack pnpm check:docs
corepack pnpm build
```

For dependency changes also run:

```bash
corepack pnpm audit --prod --audit-level high
```

## Branches and commits

Follow [docs/branch-policy.md](docs/branch-policy.md):

- `feat/<scope>`, `fix/<scope>`, `docs/<scope>`, `chore/<scope>`, `hotfix/<scope>`, `spike/<scope>`
- one concern per pull request
- conventional commit prefixes such as `feat:`, `fix:`, `docs:`, `chore:`

`main` is protected. Open a pull request and wait for the `build` check.

## Pull request expectations

- CI must pass.
- Update the current document affected by the change; use the checklist in the PR template.
- Add tests for behavior changes, especially security boundaries, IPC, file paths, and archive handling.
- Do not commit `.opencode/`, `models.json`, `*.cinelab/`, logs, generated installers, or local absolute paths.
- Keep changes focused; avoid mixing refactors with behavior changes.

## Documentation

The documentation index is [docs/README.md](docs/README.md). Current documents use:

```text
日期：YYYY-MM-DD
状态：现行
适用版本：vX.Y.Z
最后核对：YYYY-MM-DD
```

Completed plans should be marked `状态：历史` instead of being rewritten as current behavior.

## Release

Releases are built from `v*` tags by the `Release` workflow. The tag must match `package.json` version. The current Windows build is unsigned; do not represent it as code-signed.

发布后必须通知飞书群：

- 自动：`Release` workflow 的 `publish` job 末尾执行 `scripts/notify-feishu.mjs`，读取仓库 Secret `FEISHU_WEBHOOK`。通知失败不会阻塞发布（`continue-on-error`）。
- 手动补发：`CINELAB_FEISHU_WEBHOOK=<webhook> pnpm notify:release`。
- 预演：`pnpm notify:release --dry-run` 只打印卡片 JSON，不发送。

Webhook 不写入仓库、文档、日志或提交信息。卡片模板见 `scripts/notify-feishu.mjs`（版本、下载产物、CHANGELOG 摘要、Release 按钮）。
