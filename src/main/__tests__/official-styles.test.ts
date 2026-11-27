import { existsSync, readFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { STYLE_CATEGORIES, styleNameKey } from '@shared/style-schema'

interface OfficialStyle {
  id: string
  name: string
  category: string
  cover: string
  prompt: string
  version: number
  source: string
}

const root = join(process.cwd(), 'docs/style-library')
const styles = JSON.parse(
  readFileSync(join(root, 'styles.json'), 'utf8')
) as OfficialStyle[]

const ADDED_IDS = [
  'shaw-brothers-wuxia',
  'hollywood-teal-orange',
  'hk-kung-fu-70s',
  'republican-shanghai',
  'korean-crime-cold',
  'showa-japan-nostalgia',
  'northwest-china-epic'
]

describe('官方风格库', () => {
  it('至少包含 42 个官方风格', () => {
    expect(styles.length).toBeGreaterThanOrEqual(42)
  })

  it('id 唯一', () => {
    const ids = styles.map((style) => style.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('名称唯一（忽略全半角、大小写和空白）', () => {
    const keys = styles.map((style) => styleNameKey(style.name))
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('分类全部合法', () => {
    for (const style of styles) {
      expect(STYLE_CATEGORIES).toContain(style.category)
    }
  })

  it('提示词非空且不超过 300 字', () => {
    for (const style of styles) {
      expect(style.prompt.trim().length).toBeGreaterThan(0)
      expect(style.prompt.trim().length).toBeLessThanOrEqual(300)
    }
  })

  it('封面存在且为 webp', () => {
    for (const style of styles) {
      expect(style.cover.startsWith('covers/')).toBe(true)
      expect(extname(style.cover).toLowerCase()).toBe('.webp')
      expect(existsSync(join(root, style.cover))).toBe(true)
    }
  })

  it('包含本次新增的 7 个风格', () => {
    const ids = new Set(styles.map((style) => style.id))
    for (const id of ADDED_IDS) {
      expect(ids.has(id)).toBe(true)
    }
  })
})
