import { resolve } from 'node:path'

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
