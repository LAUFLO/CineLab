# 更新源兜底方案

> 状态：现行
> 日期：2026-11-17
> 适用版本：v0.2.2
> 最后核对：2026-11-17
> 关联：`electron-builder.yml`、`src/main/update/service.ts`、`src/shared/update.ts`、`src/renderer/src/panels/SettingsPanel.tsx`

## 0. 结论

主更新源保持 GitHub Releases 不变，不迁移、不自建 CDN、不产生费用。

只在**失败路径**上加出口：

- 检查更新失败 → 给「打开发布页」按钮，指向 GitHub Releases 页面。
- 下载安装包失败 → 给「浏览器下载」按钮，优先指向国内镜像代理的安装包直链，镜像全部不可用时退回 GitHub 原始链接。

自动更新在能连 GitHub 的环境里行为不变；连不上的用户至少有一条能走通的路。

## 1. 背景

当前更新源写在 `electron-builder.yml`：

```yaml
publish:
  provider: generic
  url: https://github.com/LAUFLO/CineLab/releases/latest/download
```

国内用户的实际表现是「检查得到、下不下来」：`latest.yml` 只有约 1 KB，通常能过；安装包 164 MB，经常超时或断流。`src/main/update/service.ts` 目前把这类错误统一转成「无法连接更新服务器」，没有后续动作，用户卡死在这一步。

`CINELAB_UPDATE_URL` 已经支持运行时覆盖 feed，但那是给 mock 测试用的，终端用户不会用。

## 2. 非目标

- 不做完整镜像托管（OSS / R2 / CDN），不引入流量成本。
- 不自动切换主更新源。GitHub 仍是唯一主源。
- 不做差分更新、灰度、强制更新。
- 不解决 macOS 自动更新（未签名，Squirrel.Mac 不可用，仍只支持手动下载）。
- 不保证镜像代理的长期可用性，只保证「镜像失效时还有 GitHub 兜底」。

## 3. 源优先级

| 场景 | 顺序 |
|---|---|
| 检查更新 | GitHub Releases（`latest.yml`） |
| 下载安装包（自动） | GitHub Releases |
| 下载安装包（兜底，用户点击） | 镜像代理 1 → 镜像代理 2 → … → GitHub 原始链接 |

镜像列表内置在代码里，可用环境变量 `CINELAB_UPDATE_MIRRORS`（逗号分隔）覆盖，便于域名失效时本地验证，不需要重新发版就能测试。

初始列表：

```
https://gh-proxy.com
https://ghproxy.net
https://ghproxy.cn
```

> 这三个都是第三方公共服务，域名可能变动。发布前必须用第 7 节的命令实际验证，把失效项删掉或替换。
>
> 2026-11-17 实测：`gh-proxy.com` 约 1.1 s；`ghproxy.net` 约 3.5 s；`ghproxy.cn` 约 4.7 s。同时测试的 `ghfast.top`、`ghproxy.cc`、`gh-proxy.net`、`ghp.ci`、`github.moeyy.xyz`、`hub.gitmirror.com` 当前不可用。

## 4. 数据结构

`src/shared/update.ts` 增加：

```ts
export type FallbackKind = 'releases-page' | 'installer'

export interface UpdateFallback {
  kind: FallbackKind
  url: string
  /** 镜像名或 'github'，用于界面提示来源 */
  source: string
  /** installer 场景下的文件名，如 CineLab-0.2.2-x64.exe */
  fileName?: string
}

export interface UpdateStatus {
  // ...现有字段
  fallback?: UpdateFallback
}
```

`UpdateState` 不新增状态值。兜底入口挂在现有的 `error` 态上，避免影响已有的状态机和 UI 分支。

## 5. 主进程逻辑

改动集中在 `src/main/update/service.ts`。

### 5.1 记录候选安装包

`update-available` 事件里从 `info.files` 取第一个文件：

```ts
const file = info.files?.[0]
const fileName = file?.url?.split('/').pop()
```

存到模块级变量 `pendingInstaller`：

```ts
{ version, fileName, githubUrl }
```

`githubUrl` 的构造：

- `file.url` 是绝对地址时直接用；
- 否则拼 `https://github.com/LAUFLO/CineLab/releases/download/v${version}/${fileName}`。

### 5.2 检查更新失败

`handleError` 里若当前不在下载阶段，设置：

```ts
fallback = { kind: 'releases-page', url: 'https://github.com/LAUFLO/CineLab/releases/latest', source: 'github' }
```

### 5.3 下载失败

两处都要捕获，因为 `downloadUpdate()` 有的错误会抛、有的只发事件：

- `downloadUpdate()` 的 `catch`
- `autoUpdater.on('error')` 且 `status.state === 'downloading'`

处理流程：

1. 若已有 `fallback`，直接复用，不重复探测。
2. 并行探测镜像（`probeMirror`），5 秒超时，**谁先成功用谁**（`Promise.any` 竞速）。
3. 探测目标是 1 KB 的 `latest.yml`，不是安装包，避免探测时误拉整个文件。
4. 全部失败则 `fallback = { kind: 'installer', url: githubUrl, source: 'github' }`。
5. 写回 status 并广播。

### 5.4 镜像探测

```ts
async function probeMirror(url: string): Promise<boolean> {
  // 先 HEAD；非 2xx 再试 Range: bytes=0-0
  // 任一成功即视为可用；无论结果都立即取消 body，绝不下载整个文件
}
```

注意点：

- 必须 `redirect: 'follow'`，代理通常 302 到真实地址。
- 必须 `AbortController` 超时，避免某个镜像卡住整个探测。
- `fetch` 返回后立刻 `response.body?.cancel()`，防止意外拉流。
- 探测并发执行并用 `Promise.any` 竞速，总耗时约等于最快的可用镜像，不超过 5 秒。

### 5.5 打开兜底链接

新增 `openFallbackDownload()`：

```ts
export async function openFallbackDownload(): Promise<void> {
  const url = status.fallback?.url
  if (!url) return
  await shell.openExternal(url)
}
```

**不接受渲染进程传入的 URL**，只用主进程自己存的那个，避免变成任意 URL 打开器。

## 6. 界面

`SettingsPanel` 的 `AboutSection`，在现有 `error` 文案下方增加：

```
状态文案（错误原因）
[浏览器下载]  CineLab-0.2.2-x64.exe · 经 gh-proxy.com
```

- `kind === 'releases-page'` 时按钮文案为「打开发布页」，不显示文件名。
- `kind === 'installer'` 时显示文件名和镜像来源；`source === 'github'` 时提示「GitHub 直连」。
- 按钮样式用 `secondary`，不与「下载更新」抢主按钮位置。
- 手动下载的包不经过 `electron-updater`，**不校验 sha512**。文案里提示「下载后请核对 SHA256SUMS.txt」。

## 7. 验证方法

镜像可用性（发布前手工跑一次）：

```powershell
$url = 'https://github.com/LAUFLO/CineLab/releases/latest/download/latest.yml'
foreach ($m in 'https://gh-proxy.com','https://ghfast.top','https://ghproxy.net') {
  try {
    $r = Invoke-WebRequest "$m/$url" -Method Head -MaximumRedirection 5 -TimeoutSec 5
    "{0} -> {1}" -f $m, $r.StatusCode
  } catch {
    "{0} -> FAIL" -f $m
  }
}
```

本地功能验证：

1. `CINELAB_UPDATE_URL=http://127.0.0.1:8788` 指向 `scripts/mock-update-server.mjs`，确认能正常下载。
2. 关掉 mock 服务器再点「下载更新」，确认出现兜底按钮。
3. 断网后点「检查更新」，确认出现「打开发布页」。

## 8. 风险

| 风险 | 处理 |
|---|---|
| 镜像域名全部失效 | 自动退回 GitHub 链接，按钮仍可用 |
| 镜像返回错误内容或投毒 | 提示核对 `SHA256SUMS.txt`；镜像只做兜底，不是默认下载路径 |
| 探测拖慢错误提示 | 2.5 秒超时，且只在下一次失败时探测；已有 fallback 直接复用 |
| 用户误以为手动下载能自动安装 | 文案写明「用浏览器下载，安装后需手动覆盖」 |

## 9. 回滚

方案不改动发布流程、不新增依赖、不改 `electron-builder.yml`。回滚方式是移除 `UpdateStatus.fallback` 字段和界面按钮，主进程的 GitHub 更新路径不受影响。

## 10. 实施清单

- [x] `src/shared/update.ts`：`UpdateFallback`、`fallback` 字段
- [x] `src/main/update/service.ts`：候选安装包、镜像探测、错误分支、`openFallbackDownload`
- [x] `src/main/ipc/update.ts`：`update:open-fallback`
- [x] `src/preload/index.ts`：`update.openFallback`
- [x] `src/renderer/src/stores/update.ts`：`openFallback`
- [x] `src/renderer/src/panels/SettingsPanel.tsx`：错误态按钮
- [x] `docs/README.md`：登记本文档
