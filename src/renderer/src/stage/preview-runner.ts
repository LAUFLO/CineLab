import type { GeneratedAsset } from '@shared/generation'
import type {
  StageExportFrame,
  StageExportInput,
  StageExportResult
} from '@shared/ipc-contract'
import { GROUP_COLORS, type GroupColor } from '@shared/canvas-schema'
import { isStageNode, nodeSize, useCanvasStore } from '../stores/canvas'

export interface StagePreviewExportResult extends StageExportResult {
  nodeIds: string[]
}

function shotLabel(index: number): string {
  return `第${String(index).padStart(2, '0')}镜`
}

/**
 * 导出白模预演并回画布：
 * - 整场组：整片 + 鸟瞰
 * - 每镜组：片段 + 首/中/尾分镜图
 * UI 的 StageWindow 和 Agent 的 stage_export_preview 共用。
 */
export async function exportStagePreviewToCanvas(input: {
  stageNodeId: string
  stageId: string
  scope?: StageExportInput['scope']
  shotId?: string
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

  const addGroup = (
    ids: string[],
    title: string,
    color: GroupColor,
    columns: number
  ): void => {
    if (ids.length === 0) return
    const groupId = canvas.createGroupFromNodes(ids, {
      title,
      color,
      columns,
      allowSingle: true
    })
    if (groupId) nodeIds.push(groupId)
    nodeIds.push(...ids)
  }

  try {
    const wholeNodes: string[] = []
    const wholeVideo = canvas.addAssetNodes(
      'video',
      { x: baseX, y: baseY },
      [result.asset],
      '整片预演',
      stageNode.id,
      undefined,
      true
    )
    for (const id of wholeVideo) {
      canvas.patchNodeData(id, { title: '整片预演' })
    }
    wholeNodes.push(...wholeVideo)

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
      wholeNodes.push(...overviewNodes)
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
      wholeNodes.push(...ids)
    })

    addGroup(wholeNodes, '整场 · 白模预演', 'slate', 2)

    const framesByShot = new Map<string, StageExportFrame[]>()
    for (const frame of result.frames ?? []) {
      const list = framesByShot.get(frame.shotId) ?? []
      list.push(frame)
      framesByShot.set(frame.shotId, list)
    }

    for (const [index, clip] of (result.clips ?? []).entries()) {
      const y = baseY + (index + 1) * 420
      const nodes: string[] = []
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
      nodes.push(...videoNodes)

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
        nodes.push(...frameNodes)
      }

      addGroup(
        nodes,
        shotLabel(clip.index),
        GROUP_COLORS[(clip.index - 1) % GROUP_COLORS.length]!,
        Math.max(2, nodes.length)
      )
    }

    return { ...result, nodeIds }
  } finally {
    if (withTurn) canvas.endToolTurn()
  }
}
