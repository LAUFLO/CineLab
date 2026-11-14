import { describe, expect, it } from 'vitest'
import { normalizeTags } from '../tag-utils'

describe('normalizeTags', () => {
  it('trims, removes empties and de-duplicates tags', () => {
    expect(normalizeTags([' 人物 ', '人物', '', '夜景'])).toEqual([
      '人物',
      '夜景'
    ])
  })

  it('limits the tag count to 20', () => {
    const tags = Array.from({ length: 25 }, (_, index) => `tag-${index}`)
    expect(normalizeTags(tags)).toHaveLength(20)
  })
})
