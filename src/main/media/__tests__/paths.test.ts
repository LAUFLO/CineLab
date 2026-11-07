import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: {
    getPath: () => process.cwd()
  }
}))

import { resolveInside } from '../paths'

const root = 'C:\\projects\\demo'

describe('resolveInside', () => {
  it('resolves a relative path inside the project', () => {
    const result = resolveInside(root, 'assets/image.png')
    expect(result).toContain('assets')
    expect(result).toContain('image.png')
  })

  it('rejects parent traversal', () => {
    expect(() => resolveInside(root, '../secret.txt')).toThrow(
      '路径不在当前项目内'
    )
  })

  it('rejects absolute paths outside the project', () => {
    expect(() => resolveInside(root, 'C:\\Windows\\win.ini')).toThrow(
      '路径不在当前项目内'
    )
  })
})
