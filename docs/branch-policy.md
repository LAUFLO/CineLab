# CineLab 分支规范

日期：2026-11-13
状态：现行
适用版本：v0.1.0
最后核对：2026-11-13

## 1. 原则

- 只保留 `main` 一条长期分支。
- 所有改动走短生命周期分支 + Pull Request。
- 功能合并后立即删除 head branch。
- 不使用 `develop`；当前节奏不需要额外的集成分支。
- 发布用 tag，不长期保留 `release/*` 分支。

## 2. 分支类型

| 分支 | 用途 | 生命周期 |
|---|---|---|
| `main` | 唯一长期分支，始终可发布 | 永久 |
| `feat/<scope>` | 新功能 | PR 合并后删除 |
| `fix/<scope>` | Bug 修复 | PR 合并后删除 |
| `docs/<scope>` | 文档 | PR 合并后删除 |
| `chore/<scope>` | CI、构建、依赖、脚本 | PR 合并后删除 |
| `hotfix/<scope>` | 线上紧急修复 | 发布后删除 |
| `spike/<scope>` | 实验/验证 | 结论后删除或转正式分支 |

示例：

```text
feat/agent-generation-ops
fix/timeline-audio-sync
docs/branch-policy
chore/docs-drift-check
hotfix/v0.1.1-install
spike/seedance-2-adapter
```

### 命名规则

- 小写 kebab-case。
- 不带日期、人名、`wip`、`backup`、`new`、`final`。
- 一个分支只做一件事，不把多个 PR 逻辑混在一起。
- 分支名尽量不超过 40 个字符。

## 3. main 保护

`main` 已设置以下保护：

- 禁止直接 push。
- 禁止 force push。
- 禁止删除。
- 必须通过 Pull Request。
- 必须通过 `Build Windows` 的 `build` 检查。
- 检查通过前分支必须与 main 保持一致（strict）。
- 允许管理员绕过，但日常不使用。

## 4. PR 规则

- PR 标题统一使用 conventional commit 前缀：
  - `feat:`
  - `fix:`
  - `docs:`
  - `chore:`
- PR 描述写清：改了什么、为什么、验证方式。
- 涉及 UI 的 PR 附截图或录屏。
- 涉及数据格式的 PR 说明迁移和兼容性。
- 合并后由 GitHub 自动删除 head branch。

## 5. 合并方式

默认使用 merge commit，保留完整 PR 历史。

- 小范围文档/工具改动可以 squash。
- 大功能保持 merge commit，方便回滚和 review。
- 不使用 rebase 合并已推送的共享分支。

## 6. 清理流程

每个里程碑或每周执行一次：

```bash
# 查看远端已合并分支
git fetch --prune
git branch -r --merged main

# 删除已合并远端分支
git push origin --delete <branch>

# 删除本地已合并分支
git branch -d <branch>

# 清理已删除 worktree 的记录
git worktree prune
```

规则：

- 已合并分支不保留远端副本。
- 实验分支不推送远端；需要保留时打本地 tag，例如 `archive/wip-video-operations`。
- 长期未合并的 `wip/*` 不留在远端。
- 正在被 worktree 占用的分支，等对应会话结束后再删。

## 7. 当前清理记录

2026-11-12 已删除 12 条已合并远端分支，`origin` 只保留 `main`。

仍被 worktree 占用的本地分支：

```text
feat/agent-runtime
feat/clip-studio
film-study
```

等对应 worktree 结束后再删除。`wip/video-operations` 如不再使用，先打 `archive/wip-video-operations` tag 再删除。

## 8. 发布

- 版本使用 tag：`v0.1.0`、`v0.1.1`。
- 安装包由 GitHub Actions `Build Windows` 产出并下载。
- 需要冻结版本时临时创建 `release/vX.Y.Z`，发布后删除。
- 不把 `release/*` 作为长期分支。
