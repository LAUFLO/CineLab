/**
 * 资产作用域：
 * - project：相对当前项目根，例如 assets/img/xxx.png
 * - global：相对全局资产库根，例如 场景/雪夜街道.png
 */
export type AssetScope = 'project' | 'global'

export function isGlobalScope(scope?: AssetScope): boolean {
  return scope === 'global'
}

export interface AssetRef {
  path: string
  scope?: AssetScope
}
