import type { AssetScope } from '@shared/asset-schema'
import type { SceneAnalyzeResult } from '@shared/scene-analyze'
import type { StageCamera, StageObject, StageVec3 } from '@shared/stage-schema'
import type { StageCommand } from '@shared/stage-commands'
import {
  FALLBACK_OBJECT_PRESET,
  builtinObjectPresets,
  findObjectPreset
} from '@shared/scene-object-presets'
import { useStageStore } from './stageStore'

export interface GenerateStageFromSceneInput {
  imagePath: string
  imageScope?: AssetScope
  modelKey?: string
}

export interface GenerateStageFromSceneResult {
  objectCount: number
  cameraId: string
  confidence: SceneAnalyzeResult['confidence']
}

export async function generateStageFromScene(
  input: GenerateStageFromSceneInput
): Promise<GenerateStageFromSceneResult> {
  const store = useStageStore.getState()
  const doc = store.doc
  if (!doc) throw new Error('导演台没有打开')

  const result = await window.api.scene.analyze({
    imagePath: input.imagePath,
    imageScope: input.imageScope,
    modelKey: input.modelKey
  })

  const presets = builtinObjectPresets()
  const width = 20
  const depth = 20
  const stamp = Date.now()
  const objects: StageObject[] = result.draft.objects.map((item, index) => {
    const preset =
      findObjectPreset(presets, item.label) ?? FALLBACK_OBJECT_PRESET
    const x = (item.relativeX - 0.5) * width * 0.8
    const z =
      item.depthLayer === 'near'
        ? -depth * 0.3
        : item.depthLayer === 'far'
          ? depth * 0.3
          : 0
    const scale: StageVec3 =
      preset.shape === 'human' || preset.shape === 'crowd'
        ? [1, preset.h / 2, 1]
        : [preset.w, preset.h, preset.d]
    return {
      id: `object_${stamp}_${index}`,
      type: preset.shape,
      name: item.label,
      transform: {
        position: [x, 0, z],
        rotation: [0, 0, 0],
        scale
      },
      color: preset.color
    }
  })

  const camera: StageCamera = {
    id: `camera_${stamp}`,
    name: '场景图机位',
    position: [0, result.calibration.camera.heightM, -depth * 0.55],
    target: [0, 1.2, 0],
    fov: result.calibration.camera.fovDeg
  }

  const commands: StageCommand[] = [
    ...objects.map((object) => ({ type: 'addObject' as const, object })),
    { type: 'addCamera', camera },
    { type: 'setActiveCamera', cameraId: camera.id }
  ]

  if (!store.applyCommands(commands)) {
    throw new Error('场景生成结果无法写入导演台')
  }

  return {
    objectCount: objects.length,
    cameraId: camera.id,
    confidence: result.confidence
  }
}
