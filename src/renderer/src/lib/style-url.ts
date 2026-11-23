import type { StyleCard } from '@shared/style-schema'
import { assetUrl } from './asset-url'

/** 官方封面走 style host，自定义封面走全局素材库。 */
export function styleCoverUrl(style: StyleCard): string {
  return assetUrl(style.cover, style.source === 'official' ? 'style' : 'global')
}
