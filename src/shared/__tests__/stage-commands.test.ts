import { describe, expect, it } from 'vitest'
import {
  applyStageCommand,
  applyStageCommands,
  createStageHistory,
  emptyStageChange,
  pushStageHistory,
  redoStageHistory,
  undoStageHistory
} from '../stage-commands'
import {
  createStageDoc,
  validateStageDoc,
  type StageCamera,
  type StageObject,
  type StageShot,
  type StageVec3
} from '../stage-schema'

function human(id: string, position: StageVec3 = [0, 0, 0]): StageObject {
  return {
    id,
    type: 'human',
    name: id,
    transform: { position, rotation: [0, 0, 0], scale: [1, 1, 1] }
  }
}

function camera(id: string): StageCamera {
  return {
    id,
    name: id,
    position: [0, 1.6, 5],
    target: [0, 1, 0],
    fov: 50
  }
}

function shot(
  id: string,
  cameraId: string,
  durationMs = 5000
): StageShot {
  return { id, cameraId, durationMs, aspect: '16:9' }
}

function baseDoc(): ReturnType<typeof createStageDoc> {
  return createStageDoc('stage_test', '测试场景')
}

describe('stage object commands', () => {
  it('adds, transforms, styles and removes an object', () => {
    let doc = baseDoc()

    const added = applyStageCommand(doc, {
      type: 'addObject',
      object: human('human_a')
    })
    expect(added.ok).toBe(true)
    expect(added.doc.objects).toHaveLength(1)
    expect(added.change.createdObjectIds).toEqual(['human_a'])
    doc = added.doc

    const transformed = applyStageCommand(doc, {
      type: 'transformObject',
      objectId: 'human_a',
      transform: { position: [1, 0, 2] }
    })
    expect(transformed.ok).toBe(true)
    expect(transformed.doc.objects[0]?.transform.position).toEqual([1, 0, 2])
    doc = transformed.doc

    const styled = applyStageCommand(doc, {
      type: 'setPose',
      objectId: 'human_a',
      pose: 'sit'
    })
    expect(styled.doc.objects[0]?.pose).toBe('sit')
    doc = styled.doc

    const colored = applyStageCommand(doc, {
      type: 'setColor',
      objectId: 'human_a',
      color: '#ff0000'
    })
    expect(colored.doc.objects[0]?.color).toBe('#ff0000')
    doc = colored.doc

    const hidden = applyStageCommand(doc, {
      type: 'setVisible',
      objectId: 'human_a',
      visible: false
    })
    expect(hidden.doc.objects[0]?.visible).toBe(false)
    doc = hidden.doc

    const removed = applyStageCommand(doc, {
      type: 'removeObject',
      objectId: 'human_a'
    })
    expect(removed.ok).toBe(true)
    expect(removed.doc.objects).toHaveLength(0)
    expect(removed.change.deletedObjectIds).toEqual(['human_a'])
  })

  it('rejects duplicate ids and unknown objects', () => {
    const doc = applyStageCommand(baseDoc(), {
      type: 'addObject',
      object: human('human_a')
    }).doc

    expect(
      applyStageCommand(doc, {
        type: 'addObject',
        object: human('human_a')
      }).ok
    ).toBe(false)

    expect(
      applyStageCommand(doc, {
        type: 'transformObject',
        objectId: 'missing',
        transform: { position: [0, 0, 0] }
      }).ok
    ).toBe(false)
  })

  it('clears child parentId and action tracks when removing a parent', () => {
    let doc = baseDoc()
    doc = applyStageCommand(doc, {
      type: 'addObject',
      object: human('parent')
    }).doc
    doc = applyStageCommand(doc, {
      type: 'addObject',
      object: { ...human('child'), parentId: 'parent' }
    }).doc
    doc = applyStageCommand(doc, {
      type: 'addCamera',
      camera: camera('cam_1')
    }).doc
    doc = applyStageCommand(doc, {
      type: 'addShot',
      shot: {
        ...shot('shot_1', 'cam_1'),
        actionTracks: [
          {
            objectId: 'parent',
            keys: [{ timeMs: 0, position: [0, 0, 0] }]
          }
        ]
      }
    }).doc

    const removed = applyStageCommand(doc, {
      type: 'removeObject',
      objectId: 'parent'
    })

    expect(removed.ok).toBe(true)
    expect(removed.doc.objects.find((item) => item.id === 'child')?.parentId).toBeUndefined()
    expect(removed.doc.shots[0]?.actionTracks).toEqual([])
    expect(removed.change.updatedObjectIds).toContain('child')
  })
})

describe('stage camera commands', () => {
  it('adds the first camera as active and updates it', () => {
    let doc = baseDoc()
    const added = applyStageCommand(doc, {
      type: 'addCamera',
      camera: camera('cam_1')
    })
    expect(added.ok).toBe(true)
    expect(added.doc.activeCameraId).toBe('cam_1')
    expect(added.change.activeCameraChanged).toBe(true)
    doc = added.doc

    const updated = applyStageCommand(doc, {
      type: 'updateCamera',
      cameraId: 'cam_1',
      patch: { fov: 35 }
    })
    expect(updated.doc.cameras[0]?.fov).toBe(35)
    expect(updated.change.updatedCameraIds).toEqual(['cam_1'])
  })

  it('rejects invalid fov and missing cameras', () => {
    let doc = baseDoc()
    doc = applyStageCommand(doc, {
      type: 'addCamera',
      camera: camera('cam_1')
    }).doc

    expect(
      applyStageCommand(doc, {
        type: 'updateCamera',
        cameraId: 'cam_1',
        patch: { fov: 200 }
      }).ok
    ).toBe(false)

    expect(
      applyStageCommand(doc, {
        type: 'removeCamera',
        cameraId: 'missing'
      }).ok
    ).toBe(false)
  })

  it('blocks removing a camera referenced by a shot', () => {
    let doc = baseDoc()
    doc = applyStageCommand(doc, {
      type: 'addCamera',
      camera: camera('cam_1')
    }).doc
    doc = applyStageCommand(doc, {
      type: 'addShot',
      shot: shot('shot_1', 'cam_1')
    }).doc

    expect(
      applyStageCommand(doc, { type: 'removeCamera', cameraId: 'cam_1' }).ok
    ).toBe(false)

    const withoutShot = applyStageCommand(doc, {
      type: 'removeShot',
      shotId: 'shot_1'
    }).doc
    expect(
      applyStageCommand(withoutShot, {
        type: 'removeCamera',
        cameraId: 'cam_1'
      }).ok
    ).toBe(true)
  })

  it('switches and clears the active camera', () => {
    let doc = baseDoc()
    doc = applyStageCommand(doc, {
      type: 'addCamera',
      camera: camera('cam_1')
    }).doc
    doc = applyStageCommand(doc, {
      type: 'addCamera',
      camera: camera('cam_2')
    }).doc

    const switched = applyStageCommand(doc, {
      type: 'setActiveCamera',
      cameraId: 'cam_2'
    })
    expect(switched.doc.activeCameraId).toBe('cam_2')

    const cleared = applyStageCommand(switched.doc, {
      type: 'setActiveCamera',
      cameraId: null
    })
    expect(cleared.doc.activeCameraId).toBeUndefined()
  })
})

describe('stage shot commands', () => {
  function withCamera(): ReturnType<typeof createStageDoc> {
    let doc = baseDoc()
    doc = applyStageCommand(doc, {
      type: 'addCamera',
      camera: camera('cam_1')
    }).doc
    return doc
  }

  it('adds a shot and sorts camera keyframes', () => {
    const doc = withCamera()
    const added = applyStageCommand(doc, {
      type: 'addShot',
      shot: {
        ...shot('shot_1', 'cam_1'),
        cameraTrack: [
          {
            timeMs: 4000,
            position: [2, 1.6, 5],
            target: [0, 1, 0],
            fov: 50
          },
          {
            timeMs: 0,
            position: [0, 1.6, 5],
            target: [0, 1, 0],
            fov: 50
          }
        ]
      }
    })

    expect(added.ok).toBe(true)
    expect(added.doc.shots[0]?.cameraTrack?.map((key) => key.timeMs)).toEqual([
      0, 4000
    ])
  })

  it('rejects missing cameras, invalid duration and keyframes out of range', () => {
    const doc = withCamera()

    expect(
      applyStageCommand(doc, {
        type: 'addShot',
        shot: shot('shot_1', 'missing')
      }).ok
    ).toBe(false)

    expect(
      applyStageCommand(doc, {
        type: 'addShot',
        shot: shot('shot_1', 'cam_1', 20_000)
      }).ok
    ).toBe(false)

    expect(
      applyStageCommand(doc, {
        type: 'addShot',
        shot: {
          ...shot('shot_1', 'cam_1'),
          cameraTrack: [
            {
              timeMs: 6000,
              position: [0, 1.6, 5],
              target: [0, 1, 0],
              fov: 50
            }
          ]
        }
      }).ok
    ).toBe(false)
  })

  it('sets and replaces action tracks', () => {
    let doc = withCamera()
    doc = applyStageCommand(doc, {
      type: 'addObject',
      object: human('human_a')
    }).doc
    doc = applyStageCommand(doc, {
      type: 'addShot',
      shot: shot('shot_1', 'cam_1')
    }).doc

    const first = applyStageCommand(doc, {
      type: 'setActionTrack',
      shotId: 'shot_1',
      track: {
        objectId: 'human_a',
        keys: [
          { timeMs: 3000, position: [2, 0, 0] },
          { timeMs: 0, position: [0, 0, 0] }
        ]
      }
    })
    expect(first.ok).toBe(true)
    expect(first.doc.shots[0]?.actionTracks).toHaveLength(1)
    expect(
      first.doc.shots[0]?.actionTracks?.[0]?.keys.map((key) => key.timeMs)
    ).toEqual([0, 3000])

    const replaced = applyStageCommand(first.doc, {
      type: 'setActionTrack',
      shotId: 'shot_1',
      track: {
        objectId: 'human_a',
        keys: [{ timeMs: 1000, pose: 'walk' }]
      }
    })
    expect(replaced.doc.shots[0]?.actionTracks).toHaveLength(1)
    expect(replaced.doc.shots[0]?.actionTracks?.[0]?.keys[0]?.pose).toBe('walk')

    expect(
      applyStageCommand(first.doc, {
        type: 'setActionTrack',
        shotId: 'shot_1',
        track: {
          objectId: 'missing',
          keys: [{ timeMs: 0 }]
        }
      }).ok
    ).toBe(false)
  })

  it('updates and removes shots', () => {
    let doc = withCamera()
    doc = applyStageCommand(doc, {
      type: 'addShot',
      shot: shot('shot_1', 'cam_1')
    }).doc

    const updated = applyStageCommand(doc, {
      type: 'updateShot',
      shotId: 'shot_1',
      patch: { durationMs: 8000, aspect: '9:16' }
    })
    expect(updated.ok).toBe(true)
    expect(updated.doc.shots[0]?.durationMs).toBe(8000)
    expect(updated.doc.shots[0]?.aspect).toBe('9:16')

    const removed = applyStageCommand(updated.doc, {
      type: 'removeShot',
      shotId: 'shot_1'
    })
    expect(removed.ok).toBe(true)
    expect(removed.doc.shots).toHaveLength(0)
    expect(removed.change.deletedShotIds).toEqual(['shot_1'])
  })
})

describe('stage batch and effects', () => {
  it('applies a batch atomically and updates updatedAt', () => {
    const now = Date.parse('2026-01-01T00:00:00.000Z')
    const result = applyStageCommands(
      baseDoc(),
      [
        { type: 'addCamera', camera: camera('cam_1') },
        { type: 'addObject', object: human('human_a') },
        { type: 'addShot', shot: shot('shot_1', 'cam_1') }
      ],
      now
    )

    expect(result.ok).toBe(true)
    expect(result.applied).toBe(3)
    expect(result.doc.updatedAt).toBe(new Date(now).toISOString())
    expect(result.change.createdCameraIds).toEqual(['cam_1'])
    expect(result.change.createdObjectIds).toEqual(['human_a'])
    expect(result.change.createdShotIds).toEqual(['shot_1'])
    expect(validateStageDoc(result.doc)).toEqual([])
  })

  it('rolls back the whole batch when a command fails', () => {
    const doc = baseDoc()
    const result = applyStageCommands(doc, [
      { type: 'addCamera', camera: camera('cam_1') },
      { type: 'removeObject', objectId: 'missing' }
    ])

    expect(result.ok).toBe(false)
    expect(result.doc).toBe(doc)
    expect(result.applied).toBe(1)
    expect(result.change).toEqual(emptyStageChange())
    expect(result.error).toContain('对象不存在')
  })

  it('returns capture and preview effects without mutating the doc', () => {
    let doc = baseDoc()
    doc = applyStageCommand(doc, {
      type: 'addCamera',
      camera: camera('cam_1')
    }).doc
    doc = applyStageCommand(doc, {
      type: 'addShot',
      shot: shot('shot_1', 'cam_1')
    }).doc

    const captured = applyStageCommand(doc, {
      type: 'captureFrame',
      cameraId: 'cam_1',
      shotId: 'shot_1'
    })
    expect(captured.ok).toBe(true)
    expect(captured.change).toEqual(emptyStageChange())
    expect(captured.effects).toEqual([
      { type: 'capture-frame', cameraId: 'cam_1', shotId: 'shot_1' }
    ])

    const preview = applyStageCommand(doc, {
      type: 'renderPreview',
      shotId: 'shot_1',
      options: { resolution: '1080p', fps: 30, format: 'mp4' }
    })
    expect(preview.effects).toEqual([
      {
        type: 'render-preview',
        shotId: 'shot_1',
        options: { resolution: '1080p', fps: 30, format: 'mp4' }
      }
    ])
  })
})

describe('stage history', () => {
  it('pushes, undoes and redoes snapshots', () => {
    let doc = baseDoc()
    const history = pushStageHistory(createStageHistory(), doc)

    doc = applyStageCommand(doc, {
      type: 'addObject',
      object: human('human_a')
    }).doc

    const undone = undoStageHistory(history, doc)
    expect(undone).not.toBeNull()
    expect(undone?.doc.objects).toHaveLength(0)

    const redone = redoStageHistory(undone!.history, undone!.doc)
    expect(redone).not.toBeNull()
    expect(redone?.doc.objects).toHaveLength(1)
  })

  it('returns null when there is nothing to undo or redo', () => {
    const doc = baseDoc()
    expect(undoStageHistory(createStageHistory(), doc)).toBeNull()
    expect(redoStageHistory(createStageHistory(), doc)).toBeNull()
  })

  it('caps the history length', () => {
    let history = createStageHistory()
    for (let index = 0; index < 5; index += 1) {
      history = pushStageHistory(history, baseDoc(), 3)
    }
    expect(history.past).toHaveLength(3)
  })
})
