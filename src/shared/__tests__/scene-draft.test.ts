import { describe, expect, it } from 'vitest'
import { parseSceneDraft } from '../scene-draft'
import {
  builtinObjectPresets,
  findObjectPreset,
  mergeObjectPresets
} from '../scene-object-presets'
import { calibrateScene } from '../scene-calibrate'

describe('parseSceneDraft', () => {
  it('normalizes a valid draft', () => {
    const draft = parseSceneDraft({
      set: { kind: 'indoor', description: 'office' },
      room: { type: 'office', widthM: 99, depthM: 4, heightM: 2.8 },
      objects: [
        {
          label: 'desk',
          sizeClass: 'large',
          relativeX: 1.5,
          depthLayer: 'mid'
        }
      ],
      camera: { fovHintDeg: 200, horizonY: -1 }
    })
    expect(draft.set.kind).toBe('indoor')
    expect(draft.room?.widthM).toBe(40)
    expect(draft.objects[0].relativeX).toBe(1)
    expect(draft.camera.fovHintDeg).toBe(90)
    expect(draft.camera.horizonY).toBe(0)
  })

  it('drops invalid objects and caps the list', () => {
    const objects = Array.from({ length: 40 }, (_, index) => ({
      label: `item ${index}`,
      sizeClass: 'medium',
      relativeX: 0.5,
      depthLayer: 'mid'
    }))
    const draft = parseSceneDraft({
      set: { kind: 'outdoor' },
      room: null,
      objects: [{ label: '' }, ...objects],
      camera: {}
    })
    expect(draft.objects.length).toBe(32)
  })
})

describe('scene object presets', () => {
  it('finds Chinese aliases', () => {
    const presets = builtinObjectPresets()
    expect(findObjectPreset(presets, '沙发')?.name).toBe('sofa')
    expect(findObjectPreset(presets, '路灯')?.shape).toBe('box')
  })

  it('falls back to partial matches', () => {
    const presets = builtinObjectPresets()
    expect(findObjectPreset(presets, '木制长椅')?.name).toBe('bench')
    expect(findObjectPreset(presets, 'unknown thing')).toBeNull()
  })

  it('lets the user override a preset', () => {
    const merged = mergeObjectPresets(builtinObjectPresets(), [
      { name: 'desk', w: 2, d: 1, h: 1.2, shape: 'box', color: '#123456' },
      { name: 'bad', shape: 'nope' }
    ])
    expect(merged.find((item) => item.name === 'desk')?.w).toBe(2)
    expect(merged.some((item) => item.name === 'bad')).toBe(false)
  })
})

describe('calibrateScene', () => {
  it('uses hints for high confidence', () => {
    const draft = parseSceneDraft({
      set: { kind: 'outdoor' },
      room: null,
      objects: [],
      camera: { fovHintDeg: 40, horizonY: 0.4, heightHint: 'eye' }
    })
    const result = calibrateScene(draft, {
      width: 1280,
      height: 720,
      horizonY: 0.42
    })
    expect(result.confidence).toBe('high')
    expect(result.camera.fovDeg).toBe(40)
    expect(result.camera.heightM).toBe(1.6)
  })

  it('falls back when the draft has no hints', () => {
    const draft = parseSceneDraft({
      set: { kind: 'outdoor' },
      room: null,
      objects: [],
      camera: {}
    })
    const result = calibrateScene(draft, { width: 1280, height: 720 })
    expect(result.confidence).toBe('low')
    expect(result.camera.heightM).toBe(1.6)
    expect(result.scale).toBe(1)
  })
})
