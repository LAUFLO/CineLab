import { describe, expect, it } from 'vitest'
import type { FilmStudy, FilmStudySegment } from '@shared/film-study'
import { buildScenePrompt, fallbackScenes, parseScenes } from '../scenes'

function segment(index: number): FilmStudySegment {
  return {
    id: `seg-${index}`,
    startTime: (index - 1) * 2,
    endTime: index * 2,
    title: `镜 ${index}`,
    type: '分镜',
    visualDescription: `第 ${index} 镜画面`
  }
}

function study(count = 30): FilmStudy {
  return {
    schemaVersion: 1,
    id: 'study-1',
    sourceNodeId: 'node-1',
    sourcePath: 'ref.mp4',
    sourceName: '参考片',
    duration: count * 2,
    fps: 30,
    frameInterval: 2,
    frames: [],
    segments: Array.from({ length: count }, (_, index) => segment(index + 1)),
    createdAt: '2026-11-18T00:00:00.000Z',
    updatedAt: '2026-11-18T00:00:00.000Z'
  }
}

describe('buildScenePrompt', () => {
  it('lists shots and the scene definition', () => {
    const prompt = buildScenePrompt(study(3))
    expect(prompt).toContain('同一地点、同一时间、同一组人物')
    expect(prompt).toContain('镜 1')
    expect(prompt).toContain('镜 3')
    expect(prompt).toContain('全片共 3 个镜头')
  })
})

describe('fallbackScenes', () => {
  it('splits every ten shots', () => {
    expect(fallbackScenes(30).map((scene) => scene.shots)).toEqual([
      [1, 10],
      [11, 20],
      [21, 30]
    ])
  })

  it('keeps a short film in one scene', () => {
    expect(fallbackScenes(6)).toEqual([
      { id: 'S1', name: '第 1 段', shots: [1, 6] }
    ])
  })

  it('returns empty for no shots', () => {
    expect(fallbackScenes(0)).toEqual([])
  })
})

describe('parseScenes', () => {
  it('parses and orders scenes', () => {
    const raw = JSON.stringify({
      scenes: [
        { shots: [11, 20], location: '餐厅', daypart: '夜' },
        { shots: [1, 10], location: '办公室', daypart: '日' }
      ]
    })
    const scenes = parseScenes(raw, 20)
    expect(scenes.map((scene) => scene.shots)).toEqual([
      [1, 10],
      [11, 20]
    ])
    expect(scenes[0].name).toBe('办公室 · 日')
    expect(scenes[0].id).toBe('S1')
  })

  it('keeps an explicit scene name', () => {
    const raw = JSON.stringify({
      scenes: [{ shots: [1, 10], name: '开场', location: '办公室' }]
    })
    expect(parseScenes(raw, 10)[0].name).toBe('开场')
  })

  it('extends a gap and the tail', () => {
    const raw = JSON.stringify({
      scenes: [
        { shots: [1, 3], location: 'A' },
        { shots: [6, 8], location: 'B' }
      ]
    })
    expect(parseScenes(raw, 10).map((scene) => scene.shots)).toEqual([
      [1, 5],
      [6, 10]
    ])
  })

  it('falls back on invalid JSON', () => {
    expect(parseScenes('not json', 12).map((scene) => scene.shots)).toEqual([
      [1, 10],
      [11, 12]
    ])
  })

  it('falls back when no scene is valid', () => {
    const raw = JSON.stringify({ scenes: [{ shots: [0, 99] }] })
    expect(parseScenes(raw, 5).map((scene) => scene.shots)).toEqual([[1, 5]])
  })

  it('accepts a fenced code block', () => {
    const raw = '```json\n{"scenes":[{"shots":[1,5]}]}\n```'
    expect(parseScenes(raw, 5)).toHaveLength(1)
  })
})
