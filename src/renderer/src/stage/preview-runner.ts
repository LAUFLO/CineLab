import type { GeneratedAsset } from '@shared/generation'
import type {
  StageExportInput,
  StageExportResult
} from '@shared/ipc-contract'
import {
  isStageNode,
  nodeSize,
  useCanvasStore
} from '../stores/canvas'

export interface StagePreviewExportResult extends StageExportResult {
  nodeIds: string[]
}

/**
 * 导出白模预演并把生成的视频节点放到导演台节点右侧。
 * UI 的 StageWindow 和 Agent 的 stage_export_preview 共用这个执行器。
 */
export async function exportStagePreviewToCanvas(input: {
  stageNodeId: string
  stageId: string
  shotId: string
  resolution: StageExportInput['resolution']
  fps: StageExportInput['fps']
  turnId?: string
}): Promise<StagePreviewExportResult> {
  const stageNode = useCanvasStore
    .getState()
    .nodes.find((node) => node.id === input.stageNodeId)
  if (!stageNode || !isStageNode(stageNode)) {
    throw new Error('找不到导演台节点')
  }

  const result = await window.api.stage.exportPreview({
    stageId: input.stageId,
    shotId: input.shotId,
    resolution: input.resolution,
    fps: input.fps
  })

  const canvas = useCanvasStore.getState()
  const size = nodeSize(stageNode)
  const withTurn = Boolean(input.turnId)
  if (withTurn) canvas.beginToolTurn(input.turnId)
  try {
    const nodeIds: string[] = canvas.addAssetNodes(
      'video' as const,
      {
        x: stageNode.position.x + size.width + 80,
        y: stageNode.position.y + size.height + 40
      },
      [result.asset] as GeneratedAsset[],
      '白模预演',
      stageNode.id
    )
    return { ...result, nodeIds }
  } finally {
    if (withTurn) canvas.endToolTurn()
  }
}
