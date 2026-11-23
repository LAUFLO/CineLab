import type { AssetScope } from '@shared/asset-schema'

/**
 * 生成 cinelab-asset:// 地址。
 * 每一段单独编码，避免中文、空格和 # ? 等字符破坏 URL 结构。
 *
 * host 约定：
 * - local：当前项目根目录
 * - global：全局素材库根目录
 * - style：官方风格库根目录
 */
export function assetUrl(
  path: string,
  scope: AssetScope | 'style' = 'project'
): string {
  const host =
    scope === 'global' ? 'global' : scope === 'style' ? 'style' : 'local'
  const encoded = path
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/')

  return `cinelab-asset://${host}/${encoded}`
}
