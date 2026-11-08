import { promises as fs } from 'node:fs'
import { resolve } from 'node:path'
import { getLibraryRoot } from '../library/config'

export function resolveInside(root: string, relative: string): string {
  const absolute = resolve(root, relative)
  const rootResolved = resolve(root)

  const inside =
    absolute === rootResolved ||
    absolute.startsWith(`${rootResolved}\\`) ||
    absolute.startsWith(`${rootResolved}/`)

  if (!inside) throw new Error('路径不在当前项目内')
  return absolute
}

/**
 * 媒体输入路径解析：优先项目内，找不到再按全局资产库根解析。
 * 画布节点的 output 可能来自全局资产库，调用方只带相对路径。
 */
export async function resolveMediaPath(
  projectRoot: string,
  relative: string,
  scope?: 'project' | 'global'
): Promise<string> {
  const libraryRoot = await getLibraryRoot()
  const candidates =
    scope === 'global'
      ? [resolveInside(libraryRoot, relative), resolveInside(projectRoot, relative)]
      : [resolveInside(projectRoot, relative), resolveInside(libraryRoot, relative)]

  for (const candidate of candidates) {
    try {
      await fs.access(candidate)
      return candidate
    } catch {
      // 继续尝试下一个根目录
    }
  }

  throw new Error('素材文件不存在或已被移动')
}
