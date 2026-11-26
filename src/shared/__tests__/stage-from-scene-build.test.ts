import { describe, expect, it } from 'vitest'
import { buildStageFromDraft } from '../stage-from-scene-build'
import type { SceneAnalyzeResult } from '../scene-analyze'

function result(
  overrides: Partial<SceneAnalyzeResult> = {}
): SceneAnalyzeResult {
  return {
    draft: {
      set: { kind: 'indoor', description: '' },
      room: { type: '办公室', widthM: 6, depthM: 5, heightM: 3 },
      objects: [
        {
          label: 'desk',
          sizeClass: 'large',
          relativeX: 0.25,
          depthLayer: 'near',
          facing: 'left'
        },
        {
          label: 'person',
          sizeClass: 'medium',
          relativeX: 0.75,
          depthLayer: 'far',
          facing: 'toward_camera'
        }
      ],
      camera: { heightHint: 'eye', pitchHint: 'down', fovHintDeg: 50 }
    },
    calibration: {
      camera: { heightM: 1.6, pitchDeg: 10, fovDeg: 50 },
      scale: 1,
      confidence: 'high'
    },
    confidence: 'high',
    ...overrides
  }
}

describe('buildStageFromDraft', () => {
  it('消费 sizeClass / facing：大件更大，朝向写入 Y 轴旋转', () => {
    const built = buildStageFromDraft(result(), 1)
    const [desk, person] = built.objects
    expect(built.objects).toHaveLength(7) // 2 主体 + 4 墙 + 天花板
    expect(desk!.transform.rotation[1]).toBeCloseTo(Math.PI / 2)
    expect(person!.transform.rotation[1]).toBe(0)
    expect(desk!.transform.scale[1]).toBeGreaterThan(person!.transform.scale[1])
  })

  it('室内生成墙与天花板，前墙默认隐藏以免遮挡机位', () => {
    const built = buildStageFromDraft(result(), 2)
    const walls = built.objects.filter((object) => object.name.includes('墙'))
    const ceiling = built.objects.find((object) => object.name.includes('天花板'))
    expect(walls).toHaveLength(4)
    expect(walls[1]!.visible).toBe(false)
    expect(ceiling).toBeDefined()
  })

  it('calibration.scale 影响位置与尺寸，pitchDeg 影响机位注视点', () => {
    const base = buildStageFromDraft(result(), 3)
    const built = buildStageFromDraft(
      result({
        calibration: {
          camera: { heightM: 1.6, pitchDeg: 10, fovDeg: 50 },
          scale: 2,
          confidence: 'high'
        }
      }),
      3
    )
    expect(built.objects[0]!.transform.position[0]).toBeCloseTo(
      base.objects[0]!.transform.position[0] * 2
    )
    expect(built.objects[0]!.transform.scale[1]).toBeCloseTo(
      base.objects[0]!.transform.scale[1] * 2
    )
    expect(built.camera.target[1]).toBeGreaterThan(1.6)
  })

  it('低置信度给出提示', () => {
    const built = buildStageFromDraft(
      result({
        confidence: 'low',
        calibration: {
          camera: { heightM: 1.6, pitchDeg: 0, fovDeg: 50 },
          scale: 1,
          confidence: 'low'
        }
      }),
      4
    )
    expect(built.warnings).toHaveLength(1)
  })
})
