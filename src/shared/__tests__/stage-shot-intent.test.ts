import { describe, expect, it } from 'vitest'
import type {
  DirectorStageDoc,
  StageShotIntent,
  StageShotIntentKey
} from '../stage-schema'
import { solveStageShotIntent } from '../stage-shot-intent'

function makeDoc(): DirectorStageDoc {
  return {
    version: 1,
    stageId: 'stage_test',
    name: 'test',
    background: { kind: 'color', value: '#000000' },
    objects: [
      {
        id: 'a',
        type: 'human',
        name: 'A',
        transform: {
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1]
        }
      },
      {
        id: 'b',
        type: 'human',
        name: 'B',
        transform: {
          position: [2, 0, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1]
        }
      }
    ],
    cameras: [
      {
        id: 'cam',
        name: 'cam',
        position: [0, 2, 5],
        target: [0, 1, 0],
        fov: 50
      }
    ],
    shots: [
      {
        id: 'shot',
        cameraId: 'cam',
        durationMs: 2000,
        aspect: '16:9'
      }
    ],
    updatedAt: '2026-11-18T00:00:00.000Z'
  }
}

function key(
  overrides: Partial<StageShotIntentKey> = {}
): StageShotIntentKey {
  return {
    timeMs: 0,
    subjectIds: ['a'],
    framing: 'single',
    relation: 'front',
    side: 'right',
    distance: 'medium',
    height: 'eye',
    aim: 'body',
    ...overrides
  }
}

function intent(keys: StageShotIntentKey[]): StageShotIntent {
  return { version: 1, keys }
}

describe('solveStageShotIntent', () => {
  it('places a front camera in front of the subject', () => {
    const doc = makeDoc()
    const result = solveStageShotIntent(doc, {
      ...doc.shots[0],
      intent: intent([key()])
    })
    expect(result.track.length).toBeGreaterThan(1)
    expect(result.track[0].position[0]).toBeCloseTo(0)
    expect(result.track[0].position[1]).toBeCloseTo(1.6)
    expect(result.track[0].position[2]).toBeCloseTo(-2.5)
    expect(result.track[0].target[2]).toBeCloseTo(0)
  })

  it('honours the side for a front-side shot', () => {
    const doc = makeDoc()
    const left = solveStageShotIntent(doc, {
      ...doc.shots[0],
      intent: intent([key({ relation: 'front_side', side: 'left' })])
    })
    const right = solveStageShotIntent(doc, {
      ...doc.shots[0],
      intent: intent([key({ relation: 'front_side', side: 'right' })])
    })
    expect(left.track[0].position[0]).toBeLessThan(0)
    expect(right.track[0].position[0]).toBeGreaterThan(0)
  })

  it('keeps both actors in a two shot', () => {
    const doc = makeDoc()
    const result = solveStageShotIntent(doc, {
      ...doc.shots[0],
      intent: intent([
        key({
          framing: 'two_shot',
          subjectIds: ['a', 'b'],
          relation: 'front',
          distance: 'close'
        })
      ])
    })
    const position = result.track[0].position
    expect(Math.abs(position[2])).toBeGreaterThan(1.5)
    expect(result.notes.length).toBeGreaterThan(0)
  })

  it('looks at the toward actor for an over-shoulder shot', () => {
    const doc = makeDoc()
    const result = solveStageShotIntent(doc, {
      ...doc.shots[0],
      intent: intent([
        key({
          relation: 'over_shoulder',
          towardId: 'b'
        })
      ])
    })
    const target = result.track[0].target
    expect(target[0]).toBeCloseTo(2)
    expect(result.track[0].position[2]).toBeGreaterThan(0)
  })

  it('rejects a missing subject', () => {
    const doc = makeDoc()
    expect(() =>
      solveStageShotIntent(doc, {
        ...doc.shots[0],
        intent: intent([key({ subjectIds: ['missing'] })])
      })
    ).toThrow()
  })

  it('rejects towardId outside over_shoulder', () => {
    const doc = makeDoc()
    expect(() =>
      solveStageShotIntent(doc, {
        ...doc.shots[0],
        intent: intent([key({ towardId: 'b' })])
      })
    ).toThrow()
  })

  it('does not change the shot duration', () => {
    const doc = makeDoc()
    const shot = { ...doc.shots[0], intent: intent([key()]) }
    const result = solveStageShotIntent(doc, shot)
    expect(result.track[0].timeMs).toBe(0)
    expect(result.track[result.track.length - 1].timeMs).toBe(
      shot.durationMs
    )
    expect(result.track.length).toBeLessThanOrEqual(100)
  })

  it('tracks a moving subject between keys', () => {
    const doc = makeDoc()
    doc.shots[0].actionTracks = [
      {
        objectId: 'a',
        keys: [
          { timeMs: 0, position: [0, 0, 0] },
          { timeMs: 2000, position: [2, 0, 0] }
        ]
      }
    ]
    const result = solveStageShotIntent(doc, {
      ...doc.shots[0],
      intent: intent([key()])
    })
    expect(result.track[0].target[0]).toBeCloseTo(0)
    expect(result.track[result.track.length - 1].target[0]).toBeCloseTo(2)
  })
})
