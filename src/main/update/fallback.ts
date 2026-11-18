import type { UpdateFallback } from '@shared/update'

export const RELEASES_URL = 'https://github.com/LAUFLO/CineLab/releases/latest'
export const REPOSITORY_URL = 'https://github.com/LAUFLO/CineLab'
export const PROBE_URL = `${REPOSITORY_URL}/releases/latest/download/latest.yml`
export const MIRROR_TIMEOUT = 5000

/**
 * 第三方 GitHub 加速代理。域名会变，失效时用 CINELAB_UPDATE_MIRRORS 覆盖。
 * 2026-11-17 实测：gh-proxy.com / ghproxy.net / ghproxy.cn 可用。
 */
export const DEFAULT_MIRRORS = [
  'https://gh-proxy.com',
  'https://ghproxy.net',
  'https://ghproxy.cn'
]

export interface PendingInstaller {
  fileName: string
  githubUrl: string
}

export interface UpdateFileLike {
  url?: string
}

export interface UpdateInfoLike {
  version: string
  files?: UpdateFileLike[]
}

export function mirrorPrefixes(env: NodeJS.ProcessEnv = process.env): string[] {
  const override = env.CINELAB_UPDATE_MIRRORS
  if (!override) return DEFAULT_MIRRORS

  const items = override
    .split(',')
    .map((item) => item.trim().replace(/\/+$/, ''))
    .filter(Boolean)

  return items.length > 0 ? items : DEFAULT_MIRRORS
}

export function installerFor(info: UpdateInfoLike): PendingInstaller | null {
  const rawUrl = info.files?.[0]?.url
  if (!rawUrl) return null

  const fileName = rawUrl.split('/').pop() ?? rawUrl
  const githubUrl = /^https?:\/\//i.test(rawUrl)
    ? rawUrl
    : `${REPOSITORY_URL}/releases/download/v${info.version}/${fileName}`

  return { fileName, githubUrl }
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

export function releasesFallback(): UpdateFallback {
  return { kind: 'releases-page', url: RELEASES_URL, source: 'github' }
}

export function installerFallback(installer: PendingInstaller): UpdateFallback {
  return {
    kind: 'installer',
    url: installer.githubUrl,
    source: 'github',
    fileName: installer.fileName
  }
}

/**
 * 判断镜像是否可用。只探测 1 KB 的 latest.yml，绝不拉取完整安装包。
 */
export async function probeMirror(
  url: string,
  timeout = MIRROR_TIMEOUT
): Promise<boolean> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)

  try {
    const head = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: controller.signal
    })
    try {
      await head.body?.cancel()
    } catch {
      // 探测只需要状态码
    }
    if (head.ok) return true

    const ranged = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: { Range: 'bytes=0-0' }
    })
    try {
      await ranged.body?.cancel()
    } catch {
      // 探测只需要状态码
    }
    return ranged.ok || ranged.status === 206
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 并行探测镜像，先成功者胜出；全部失败时回退到 GitHub 原始链接。
 */
export async function resolveInstallerFallback(
  installer: PendingInstaller,
  prefixes: string[] = mirrorPrefixes()
): Promise<UpdateFallback> {
  const attempts = prefixes.map(async (prefix) => {
    const ok = await probeMirror(`${prefix}/${PROBE_URL}`)
    if (!ok) throw new Error(`mirror unavailable: ${prefix}`)
    return {
      url: `${prefix}/${installer.githubUrl}`,
      source: hostOf(prefix)
    }
  })

  try {
    const hit = await Promise.any(attempts)
    return {
      kind: 'installer',
      url: hit.url,
      source: hit.source,
      fileName: installer.fileName
    }
  } catch {
    return installerFallback(installer)
  }
}
