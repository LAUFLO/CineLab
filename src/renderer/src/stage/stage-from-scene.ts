import type { AssetScope } from '@shared/asset-schema'
import type { SceneAnalyzeResult } from '@shared/scene-analyze'
import type { StageCommand } from '@shared/stage-commands'
import {
  buildStageFromDraft,
  type StageDraftBuild
} from '@shared/stage-from-scene-build'
import { useStageStore } from './stageStore'

export { buildStageFromDraft, type StageDraftBuild }

export interface GenerateStageFromSceneInput {
  imagePath: string
  imageScope?: AssetScope
  modelKey?: string
}

export interface GenerateStageFromSceneResult {
  objectCount: number
  cameraId: string
  confidence: SceneAnalyzeResult['confidence']
  warnings?: string[]
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

  const built = buildStageFromDraft(result)
  const commands: StageCommand[] = [
    ...built.objects.map((object) => ({ type: 'addObject' as const, object })),
    { type: 'addCamera', camera: built.camera },
    { type: 'setActiveCamera', cameraId: built.camera.id }
  ]

  if (!store.applyCommands(commands)) {
    throw new Error('场景生成结果无法写入导演台')
  }

  return {
    objectCount: built.objects.length,
    cameraId: built.camera.id,
    confidence: result.confidence,
    warnings: built.warnings
  }
}
