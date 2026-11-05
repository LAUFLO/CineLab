import type { AssetScope } from '@shared/asset-schema'

/**
 * 生成 cinelab-asset:// 地址。
 * 每一段单独编码，避免中文、空格和 # ? 等字符破坏 URL 结构。
 */
export function assetUrl(path: string, scope: AssetScope = 'project'): string {
  const host = scope === 'global' ? 'global' : 'local'
  const encoded = path
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/')

  return `cinelab-asset://${host}/${encoded}`
}
