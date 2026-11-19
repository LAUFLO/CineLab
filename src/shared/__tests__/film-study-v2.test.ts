import { describe, expect, it } from 'vitest'
import {
  emptyFilmStudyV2,
  isFilmStudyV2,
  parseFilmStudyV2,
  sortScenes,
  type FilmStudyScene,
  type FilmStudyShot,
  type FilmStudyV2
} from '../film-study-v2'

function shot(index: number, start: number, end: number): FilmStudyShot {
  return {
    index,
    startTime: start,
    endTime: end,
    duration: end - start,
    firstFrame: `frames/${index}_first.jpg`,
    lastFrame: `frames/${index}_last.jpg`
  }
}

function study(overrides: Partial<FilmStudyV2> = {}): FilmStudyV2 {
  return {
    schemaVersion: 2,
    id: 'study-1',
    sourceNodeId: 'node-1',
    sourcePath: 'assets/ref.mp4',
    sourceName: '参考片',
    duration: 10,
    fps: 30,
    frameInterval: 0.5,
    frames: [],
    shots: [shot(1, 0, 5), shot(2, 5, 10)],
    scenes: [
      { id: 'S1', name: '室内', shots: [1, 2] }
    ],
    cast: [],
    createdAt: '2026-11-18T00:00:00.000Z',
    updatedAt: '2026-11-18T00:00:00.000Z',
    ...overrides
  }
}

describe('isFilmStudyV2', () => {
  it('accepts v2 data', () => {
    expect(isFilmStudyV2(study())).toBe(true)
  })

  it('rejects v1 data with segments', () => {
    expect(
      isFilmStudyV2({ schemaVersion: 1, segments: [], frames: [] })
    ).toBe(false)
  })

  it('rejects non-objects', () => {
    expect(isFilmStudyV2(null)).toBe(false)
    expect(isFilmStudyV2('v2')).toBe(false)
  })
})

describe('parseFilmStudyV2', () => {
  it('accepts a valid study', () => {
    const parsed = parseFilmStudyV2(study())
    expect(parsed.shots).toHaveLength(2)
    expect(parsed.scenes[0].shots).toEqual([1, 2])
  })

  it('rejects a wrong schema version', () => {
    expect(() =>
      parseFilmStudyV2({ ...study(), schemaVersion: 1 })
    ).toThrow(/schemaVersion/)
  })

  it('rejects an empty shot list', () => {
    expect(() => parseFilmStudyV2(study({ shots: [] }))).toThrow(/至少有一个镜头/)
  })

  it('rejects non-contiguous shot indexes', () => {
    expect(() =>
      parseFilmStudyV2(study({ shots: [shot(1, 0, 5), shot(3, 5, 10)] }))
    ).toThrow(/应为 2/)
  })

  it('rejects an end time not after the start', () => {
    expect(() =>
      parseFilmStudyV2(study({ shots: [shot(1, 5, 5)] }))
    ).toThrow(/大于 startTime/)
  })

  it('rejects a missing first frame', () => {
    const broken = shot(1, 0, 10)
    delete (broken as Partial<FilmStudyShot>).firstFrame
    expect(() => parseFilmStudyV2(study({ shots: [broken] }))).toThrow(
      /firstFrame/
    )
  })

  it('rejects a scene range beyond the last shot', () => {
    expect(() =>
      parseFilmStudyV2(
        study({
          scenes: [{ id: 'S1', name: '室内', shots: [1, 3] }]
        })
      )
    ).toThrow(/shots\[1\]/)
  })

  it('rejects overlapping scenes', () => {
    expect(() =>
      parseFilmStudyV2(
        study({
          scenes: [
            { id: 'S1', name: '室内', shots: [1, 2] },
            { id: 'S2', name: '室外', shots: [2, 2] }
          ]
        })
      )
    ).toThrow(/重叠/)
  })

  it('rejects cast shot indexes out of range', () => {
    expect(() =>
      parseFilmStudyV2(
        study({
          cast: [
            {
              id: 'lin',
              name: '林小雨',
              importance: 'lead',
              shotIndexes: [3]
            }
          ]
        })
      )
    ).toThrow(/shotIndexes/)
  })
})

describe('emptyFilmStudyV2', () => {
  it('fills defaults', () => {
    const empty = emptyFilmStudyV2({
      id: 's',
      sourceNodeId: 'n',
      sourcePath: 'a.mp4',
      sourceName: '片',
      duration: 12,
      fps: 24,
      frameInterval: 1
    })
    expect(empty.schemaVersion).toBe(2)
    expect(empty.shots).toEqual([])
    expect(empty.scenes).toEqual([])
    expect(empty.cast).toEqual([])
    expect(empty.createdAt).toBe(empty.updatedAt)
  })
})

describe('sortScenes', () => {
  const scene = (id: string, start: number, end: number): FilmStudyScene => ({
    id,
    name: id,
    shots: [start, end]
  })

  it('sorts scenes by their first shot', () => {
    const out = sortScenes([scene('b', 6, 10), scene('a', 1, 5)], 10)
    expect(out.map((item) => item.shots)).toEqual([
      [1, 5],
      [6, 10]
    ])
    expect(out.map((item) => item.id)).toEqual(['S1', 'S2'])
  })

  it('extends the previous scene over a gap', () => {
    const out = sortScenes([scene('a', 1, 3), scene('b', 6, 8)], 10)
    expect(out.map((item) => item.shots)).toEqual([
      [1, 5],
      [6, 10]
    ])
  })

  it('starts at shot 1 when the first scene begins later', () => {
    const out = sortScenes([scene('a', 4, 10)], 10)
    expect(out[0].shots).toEqual([1, 10])
  })

  it('extends the last scene to the end', () => {
    const out = sortScenes([scene('a', 1, 4)], 10)
    expect(out[0].shots).toEqual([1, 10])
  })

  it('falls back to one scene covering the film', () => {
    const out = sortScenes([], 10)
    expect(out).toEqual([{ id: 'S1', name: '全片', shots: [1, 10] }])
  })

  it('trims overlapping ranges', () => {
    const out = sortScenes([scene('a', 1, 6), scene('b', 4, 10)], 10)
    expect(out.map((item) => item.shots)).toEqual([
      [1, 6],
      [7, 10]
    ])
  })

  it('drops out-of-range scenes', () => {
    const out = sortScenes([scene('a', 0, 4), scene('b', 5, 20)], 10)
    expect(out.map((item) => item.shots)).toEqual([
      [1, 10]
    ])
  })
})
