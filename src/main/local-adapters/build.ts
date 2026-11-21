import { build } from 'esbuild'
import { existsSync, promises as fs } from 'node:fs'
import { join } from 'node:path'
import type { LocalAdapterManifest } from './manifest'

export type LocalAdapterBuildResult =
  | { ok: true; outfile: string; entry: string }
  | { ok: false; error: string }

/** 解析入口：manifest.entry 优先，否则按常见文件名查找 */
export function resolveLocalAdapterEntry(
  dir: string,
  manifest: LocalAdapterManifest
): string | null {
  const candidates = manifest.entry
    ? [manifest.entry]
    : ['adapter.ts', 'adapter.js', 'adapter.mjs', 'adapter.cjs']

  for (const entry of candidates) {
    const absolute = join(dir, entry)
    if (existsSync(absolute)) return absolute
  }
  return null
}

/** 用 esbuild 把适配器入口构建成 CommonJS，供 utilityProcess 加载 */
export async function buildLocalAdapter(
  dir: string,
  manifest: LocalAdapterManifest
): Promise<LocalAdapterBuildResult> {
  const entry = resolveLocalAdapterEntry(dir, manifest)
  if (!entry) {
    return {
      ok: false,
      error: '找不到适配器入口（manifest.entry / adapter.ts / adapter.js）'
    }
  }

  const buildDir = join(dir, '.build')
  const outfile = join(buildDir, 'adapter.cjs')

  try {
    await fs.mkdir(buildDir, { recursive: true })
    await build({
      entryPoints: [entry],
      outfile,
      absWorkingDir: dir,
      bundle: true,
      platform: 'node',
      format: 'cjs',
      target: 'node22',
      packages: 'external',
      sourcemap: 'inline',
      logLevel: 'silent'
    })
    return { ok: true, outfile, entry }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}
