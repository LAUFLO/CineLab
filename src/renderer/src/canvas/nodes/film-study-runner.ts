import { NODE_META, type NodeKind } from '@shared/canvas-schema'
import type { FilmStudyOutputOptions } from '@shared/film-study'
import { selectedNodeOutput, useCanvasStore } from '../../stores/canvas'
import { useFilmStudyStore } from '../../stores/film-study'

/**
 * 从视频节点创建拉片节点并接线。
 * UI 工具栏和 Agent 的 film_study_auto 共用这一个入口。
 */
export function createStudyNodeFromVideo(
  videoNodeId: string,
  interval = 0
): string | null {
  const state = useCanvasStore.getState()
  const sourceEntry = state.nodes.find((entry) => entry.id === videoNodeId)
  if (
    !sourceEntry ||
    sourceEntry.type !== 'cine' ||
    sourceEntry.data.kind !== 'video'
  ) {
    return null
  }

  const current = selectedNodeOutput(sourceEntry)
  if (!current || current.kind !== 'video') return null

  const sourceKind: NodeKind = sourceEntry.data.kind
  const sourceHeight =
    sourceEntry.measured?.height ?? NODE_META[sourceKind].height
  const studyNodeId = state.addNode('study', {
    x: sourceEntry.position.x,
    y: sourceEntry.position.y + sourceHeight + 80
  })

  state.patchNodeData(studyNodeId, {
    title: `${sourceEntry.data.title} · 拉片`,
    status: 'queued',
    progress: 0,
    error: undefined,
    sourceNodeId: videoNodeId,
    sourcePath: current.path,
    sourceScope: current.scope,
    sourceName: sourceEntry.data.title,
    studyInterval: interval,
    studyOutputs: { storyboard: true, sheet: true }
  })
  state.onConnect({ source: videoNodeId, target: studyNodeId })
  return studyNodeId
}

/** 跑一轮自动拉片；UI 和 Agent 共用 */
export async function runFilmStudyAuto(
  studyNodeId: string,
  options: {
    interval?: number
    modelKey?: string
    outputs?: FilmStudyOutputOptions
  } = {}
): Promise<void> {
  await useFilmStudyStore.getState().runAuto(studyNodeId, options)
}
