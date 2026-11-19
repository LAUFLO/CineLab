import { describe, expect, it } from 'vitest'
import type { FilmStudy } from '@shared/film-study'
import type { FilmStudyShot } from '@shared/film-study-v2'
import { attachCastFrames, buildCastPrompt, parseCast } from '../cast'

function shot(index: number): FilmStudyShot {
  return {
    index,
    startTime: (index - 1) * 2,
    endTime: index * 2,
    duration: 2,
    firstFrame: `frames/${index}_first.jpg`,
    midFrame: `frames/${index}_mid.jpg`,
    lastFrame: `frames/${index}_last.jpg`
  }
}

function study(): FilmStudy {
  return {
    schemaVersion: 1,
    id: 'study-1',
    sourceNodeId: 'node-1',
    sourcePath: 'ref.mp4',
    sourceName: '参考片',
    duration: 12,
    fps: 30,
    frameInterval: 2,
    frames: [
      { index: 1, time: 1, file: 'frames/frame_1.jpg' },
      { index: 2, time: 3, file: 'frames/frame_2.jpg' }
    ],
    segments: [],
    shots: [shot(1), shot(2), shot(3)],
    createdAt: '2026-11-18T00:00:00.000Z',
    updatedAt: '2026-11-18T00:00:00.000Z'
  }
}

describe('buildCastPrompt', () => {
  it('lists shots and casting rules', () => {
    const prompt = buildCastPrompt(study())
    expect(prompt).toContain('镜 1')
    expect(prompt).toContain('镜 3')
    expect(prompt).toContain('乔装')
    expect(prompt).toContain('crowd')
    expect(prompt).toContain('shotIndexes')
  })
})

describe('parseCast', () => {
  it('parses characters and sorts shot indexes', () => {
    const raw = JSON.stringify({
      cast: [
        {
          id: 'Lin',
          name: '林小雨',
          role: '女主',
          importance: 'lead',
          shotIndexes: [3, 1, 1]
        }
      ]
    })
    const cast = parseCast(raw, 3)
    expect(cast).toHaveLength(1)
    expect(cast[0].id).toBe('lin')
    expect(cast[0].importance).toBe('lead')
    expect(cast[0].shotIndexes).toEqual([1, 3])
  })

  it('drops out-of-range shot indexes', () => {
    const raw = JSON.stringify({
      cast: [{ id: 'lin', name: '林小雨', shotIndexes: [0, 1, 9] }]
    })
    expect(parseCast(raw, 3)[0].shotIndexes).toEqual([1])
  })

  it('defaults importance to supporting', () => {
    const raw = JSON.stringify({ cast: [{ id: 'lin', name: '林小雨' }] })
    expect(parseCast(raw, 3)[0].importance).toBe('supporting')
  })

  it('deduplicates character ids', () => {
    const raw = JSON.stringify({
      cast: [
        { id: 'lin', name: '林小雨' },
        { id: 'lin', name: '重复' }
      ]
    })
    expect(parseCast(raw, 3)).toHaveLength(1)
  })

  it('returns an empty list for invalid JSON', () => {
    expect(parseCast('not json', 3)).toEqual([])
  })

  it('accepts a fenced code block', () => {
    const raw = '```json\n{"cast":[{"id":"lin","name":"林小雨"}]}\n```'
    expect(parseCast(raw, 3)).toHaveLength(1)
  })
})

describe('attachCastFrames', () => {
  it('uses the middle frame of the first appearance as the face', () => {
    const cast = attachCastFrames(
      [
        {
          id: 'lin',
          name: '林小雨',
          importance: 'lead',
          shotIndexes: [1, 2]
        }
      ],
      study()
    )
    expect(cast[0].facePath).toBe('frames/1_mid.jpg')
    expect(cast[0].lookPaths).toEqual([
      'frames/1_mid.jpg',
      'frames/2_mid.jpg'
    ])
  })
})
