import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = join(process.cwd(), 'src/renderer/src')
const uiDir = join(root, 'components/ui')
const nativeTag = /<(button|input|textarea|select)\b/

function collectTsx(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (full === uiDir) continue
      collectTsx(full, files)
    } else if (entry.isFile() && entry.name.endsWith('.tsx')) {
      files.push(full)
    }
  }
  return files
}

describe('native controls', () => {
  it('feature code only uses shared UI controls', () => {
    const offenders = collectTsx(root)
      .filter((file) => nativeTag.test(readFileSync(file, 'utf8')))
      .map((file) => relative(root, file).replace(/\\/g, '/'))

    expect(offenders).toEqual([])
  })
})
