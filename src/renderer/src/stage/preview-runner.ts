import type { GeneratedAsset } from '@shared/generation'
import type {
  StageExportFrame,
  StageExportInput,
  StageExportResult
} from '@shared/ipc-contract'
import { STAGE_PREVIS_REFERENCE_PROMPT } from '@shared/stage-previs-reference'
import { isStageNode, nodeSize, useCanvasStore } from '../stores/canvas'

export interface StagePreviewExportResult extends StageExportResult {
  nodeIds: string[]
}

function shotLabel(index: number): string {
  return `第${String(index).padStart(2, '0')}镜`
}

function videoTitleFor(input: {
  scope: StageExportInput['scope']
  shotName?: string
  stageName?: string
}): string {
  if (input.scope !== 'program') {
    return input.shotName?.trim() || '镜头预演'
  }
  const stageName = input.stageName?.trim()
  return stageName ? `${stageName} · 成片` : '成片预演'
}

/**
 * 导出白模预演并回画布：
 * - 单镜：视频标题为镜头名；
 * - 整片：视频标题为「<导演台名> · 成片」；
 * - 不自动成组，节点直接落画布。
 * UI 的 StageWindow 和 Agent 的 stage_export_preview 共用。
 */
export async function exportStagePreviewToCanvas(input: {
  stageNodeId: string
  stageId: string
  scope?: StageExportInput['scope']
  shotId?: string
  shotName?: string
  stageName?: string
  resolution: StageExportInput['resolution']
  fps: StageExportInput['fps']
  items?: StageExportInput['items']
  frameDensity?: StageExportInput['frameDensity']
  turnId?: string
}): Promise<StagePreviewExportResult> {
  const stageNode = useCanvasStore
    .getState()
    .nodes.find((node) => node.id === input.stageNodeId)
  if (!stageNode || !isStageNode(stageNode)) {
    throw new Error('找不到导演台节点')
  }

  const scope = input.scope === 'program' ? 'program' : 'shot'
  if (scope === 'shot' && !input.shotId) {
    throw new Error('请先选择一个镜头')
  }

  const result = await window.api.stage.exportPreview({
    stageId: input.stageId,
    scope,
    ...(scope === 'shot' ? { shotId: input.shotId } : {}),
    resolution: input.resolution,
    fps: input.fps,
    ...(input.items ? { items: input.items } : {}),
    ...(input.frameDensity ? { frameDensity: input.frameDensity } : {})
  })

  const canvas = useCanvasStore.getState()
  const size = nodeSize(stageNode)
  const baseX = stageNode.position.x + size.width + 120
  const baseY = stageNode.position.y + 80
  const nodeIds: string[] = []
  const withTurn = Boolean(input.turnId)
  if (withTurn) canvas.beginToolTurn(input.turnId!)

  const videoTitle = videoTitleFor({
    scope,
    ...(input.shotName ? { shotName: input.shotName } : {}),
    ...(input.stageName ? { stageName: input.stageName } : {})
  })

  try {
    const wholeVideo = canvas.addAssetNodes(
      'video',
      { x: baseX, y: baseY },
      [result.asset],
      videoTitle,
      stageNode.id,
      undefined,
      true
    )
    for (const id of wholeVideo) {
      canvas.patchNodeData(id, {
        title: videoTitle,
        prompt: STAGE_PREVIS_REFERENCE_PROMPT
      })
    }
    nodeIds.push(...wholeVideo)

    if (result.overview) {
      const overviewNodes = canvas.addAssetNodes(
        'image',
        { x: baseX + 560, y: baseY },
        [result.overview.asset],
        '场景鸟瞰',
        stageNode.id,
        undefined,
        true
      )
      for (const id of overviewNodes) {
        canvas.patchNodeData(id, { title: '场景鸟瞰' })
      }
      nodeIds.push(...overviewNodes)
    }

    const documents = (result.documents ?? []).filter(
      (document) => !document.label.endsWith('.csv')
    )
    documents.forEach((document, index) => {
      const ids = canvas.addAssetNodes(
        'text',
        { x: baseX + 1120, y: baseY + index * 380 },
        [
          {
            id: `doc_${Date.now()}_${index}`,
            path: '',
            kind: 'text',
            createdAt: new Date().toISOString(),
            model: '导演台',
            text: document.text
          }
        ],
        document.label,
        stageNode.id,
        undefined,
        true
      )
      for (const id of ids) {
        canvas.patchNodeData(id, {
          text: document.text,
          title: document.label
        })
      }
      nodeIds.push(...ids)
    })

    const framesByShot = new Map<string, StageExportFrame[]>()
    for (const frame of result.frames ?? []) {
      const list = framesByShot.get(frame.shotId) ?? []
      list.push(frame)
      framesByShot.set(frame.shotId, list)
    }

    for (const [index, clip] of (result.clips ?? []).entries()) {
      const y = baseY + (index + 1) * 420
      const videoNodes = canvas.addAssetNodes(
        'video',
        { x: baseX, y },
        [clip.asset],
        shotLabel(clip.index),
        stageNode.id,
        undefined,
        true
      )
      for (const id of videoNodes) {
        canvas.patchNodeData(id, { title: shotLabel(clip.index) })
      }
      nodeIds.push(...videoNodes)

      const frames = framesByShot.get(clip.shotId) ?? []
      if (frames.length > 0) {
        const frameNodes = canvas.addAssetNodes(
          'image',
          { x: baseX + 560, y },
          frames.map((frame) => frame.asset) as GeneratedAsset[],
          `${shotLabel(clip.index)} · 分镜`,
          stageNode.id,
          { columns: 3, cellWidth: 240 },
          true
        )
        frameNodes.forEach((id, index) => {
          const label = frames[index]?.label
          if (label) canvas.patchNodeData(id, { title: label })
        })
        nodeIds.push(...frameNodes)
      }
    }

    return { ...result, nodeIds }
  } finally {
    if (withTurn) canvas.endToolTurn()
  }
}
