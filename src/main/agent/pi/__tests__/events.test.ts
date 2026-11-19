import { describe, expect, it } from 'vitest'
import type { AgentTurnChange } from '@shared/agent'
import { looksLikePreamble, mergeChange, usageOf } from '../events'

describe('pi events helpers', () => {
  it('recognizes short preamble text', () => {
    expect(looksLikePreamble('我先查一下当前场景：')).toBe(true)
    expect(looksLikePreamble('接下来我会读取画布')).toBe(true)
    expect(looksLikePreamble('这是最终答案。')).toBe(false)
    expect(looksLikePreamble('')).toBe(false)
    expect(looksLikePreamble('我先说一句'.repeat(30))).toBe(false)
  })

  it('merges changes without duplicating ids', () => {
    const target: AgentTurnChange = {
      createdNodeIds: ['a'],
      updatedNodeIds: [],
      deletedNodeIds: [],
      createdEdgeIds: [],
      deletedEdgeIds: [],
      previousTitles: { a: 'old' },
      previousPositions: {}
    }
    mergeChange(target, {
      createdNodeIds: ['a', 'b'],
      updatedNodeIds: ['c'],
      deletedNodeIds: [],
      createdEdgeIds: ['e1'],
      deletedEdgeIds: [],
      previousTitles: { a: 'ignored', b: 'old-b' },
      previousPositions: { c: { x: 1, y: 2 } },
      timelineUpdated: true
    })
    expect(target.createdNodeIds).toEqual(['a', 'b'])
    expect(target.updatedNodeIds).toEqual(['c'])
    expect(target.createdEdgeIds).toEqual(['e1'])
    expect(target.previousTitles).toEqual({ a: 'old', b: 'old-b' })
    expect(target.previousPositions).toEqual({ c: { x: 1, y: 2 } })
    expect(target.timelineUpdated).toBe(true)
  })

  it('maps pi usage to AgentUsage', () => {
    expect(
      usageOf({
        input: 10,
        output: 5,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 15,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 }
      })
    ).toEqual({ input: 10, output: 5, total: 15 })
    expect(usageOf(undefined)).toBeUndefined()
  })
})
