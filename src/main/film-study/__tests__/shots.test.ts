import { describe, expect, it } from 'vitest'
import type { FilmStudy } from '@shared/film-study'
import type { FilmStudyShot } from '@shared/film-study-v2'
import { buildShotPrompt, parseShotAnalysis } from '../shots'

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
    duration: 10,
    fps: 30,
    frameInterval: 2,
    frames: [],
    segments: [
      {
        id: 'seg-1',
        startTime: 0,
        endTime: 2,
        title: '镜 1',
        type: '分镜',
        voiceOver: '第一句台词'
      }
    ],
    shots: [shot(1), shot(2)],
    createdAt: '2026-11-18T00:00:00.000Z',
    updatedAt: '2026-11-18T00:00:00.000Z'
  }
}

describe('buildShotPrompt', () => {
  it('lists shots, image ranges and the schema', () => {
    const prompt = buildShotPrompt(study(), [shot(1), shot(2)])
    expect(prompt).toContain('镜 1')
    expect(prompt).toContain('镜 2')
    expect(prompt).toContain('图 1–3 是镜 1')
    expect(prompt).toContain('图 4–6 是镜 2')
    expect(prompt).toContain('第一句台词')
    expect(prompt).toContain('shotSize')
  })
})

describe('parseShotAnalysis', () => {
  const batch = [shot(1), shot(2)]

  it('parses shot fields', () => {
    const raw = JSON.stringify({
      shots: [
        {
          index: 1,
          shotSize: '中景',
          cameraAngle: '平视',
          cameraMove: '手持跟拍',
          lighting: '室内暖光',
          visualDescription: '女子站在门口',
          actionSummary: '从门口走向沙发',
          emotion: '压抑',
          imagePrompt: 'cinematic, medium shot',
          videoPrompt: 'she walks in'
        }
      ]
    })
    const parsed = parseShotAnalysis(raw, batch)
    expect(parsed.get(1)).toMatchObject({
      shotSize: '中景',
      cameraMove: '手持跟拍',
      emotion: '压抑'
    })
  })

  it('ignores an index outside the batch', () => {
    const raw = JSON.stringify({
      shots: [{ index: 9, shotSize: '特写' }]
    })
    expect(parseShotAnalysis(raw, batch).size).toBe(0)
  })

  it('drops empty strings', () => {
    const raw = JSON.stringify({
      shots: [{ index: 1, shotSize: '  ', lighting: '' }]
    })
    expect(parseShotAnalysis(raw, batch).get(1)).toEqual({})
  })

  it('filters dialogue lines without text', () => {
    const raw = JSON.stringify({
      shots: [
        {
          index: 2,
          dialogue: [
            { speaker: '女主', text: '你瞒了我多久' },
            { speaker: '男主', text: '  ' },
            { text: 42 }
          ]
        }
      ]
    })
    const parsed = parseShotAnalysis(raw, batch)
    expect(parsed.get(2)?.dialogue).toEqual([
      { speaker: '女主', text: '你瞒了我多久' }
    ])
  })

  it('returns an empty map for invalid JSON', () => {
    expect(parseShotAnalysis('not json', batch).size).toBe(0)
  })

  it('accepts a fenced code block', () => {
    const raw = '```json\n{"shots":[{"index":1,"shotSize":"近景"}]}\n```'
    expect(parseShotAnalysis(raw, batch).get(1)?.shotSize).toBe('近景')
  })
})
