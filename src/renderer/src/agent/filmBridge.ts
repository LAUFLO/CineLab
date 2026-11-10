import type {
  AgentToolCallRequest,
  AgentTurnChange
} from '@shared/agent'
import type {
  FilmStudy,
  FilmStudyOutputOptions,
  FilmStudySegment
} from '@shared/film-study'
import { createStudyNodeFromVideo, runFilmStudyAuto } from '../canvas/nodes/film-study-runner'
import { useCanvasStore } from '../stores/canvas'
import { useFilmStudyStore } from '../stores/film-study'

export interface FilmToolResult {
  ok: boolean
  result?: unknown
  error?: string
  change?: AgentTurnChange
}

interface StudyRef {
  studyId: string
  studyNodeId?: string
}

function emptyChange(): AgentTurnChange {
  return {
    createdNodeIds: [],
    updatedNodeIds: [],
    deletedNodeIds: [],
    createdEdgeIds: [],
    deletedEdgeIds: [],
    previousTitles: {},
    previousPositions: {}
  }
}

function filmChange(): AgentTurnChange {
  return { ...emptyChange(), filmUpdated: true }
}

function nodeById(nodeId: string) {
  return useCanvasStore.getState().nodes.find((node) => node.id === nodeId)
}

function downstreamStudyNodeId(videoNodeId: string): string | undefined {
  const { nodes, edges } = useCanvasStore.getState()
  const targetIds = edges
    .filter((edge) => edge.source === videoNodeId)
    .map((edge) => edge.target)
  return nodes.find(
    (node) =>
      targetIds.includes(node.id) &&
      node.type === 'cine' &&
      node.data.kind === 'study' &&
      typeof node.data.studyId === 'string' &&
      Boolean(node.data.studyId)
  )?.id
}

function resolveStudy(
  nodeId?: string,
  studyId?: string
): StudyRef {
  if (studyId) return { studyId }

  if (!nodeId) throw new Error('需要 nodeId 或 studyId')
  const node = nodeById(nodeId)
  if (!node || node.type !== 'cine') {
    throw new Error('找不到这个画布节点')
  }

  if (node.data.kind === 'study') {
    if (!node.data.studyId) {
      throw new Error('这个拉片节点还没有拉片结果')
    }
    return { studyId: node.data.studyId, studyNodeId: node.id }
  }

  if (node.data.kind === 'video') {
    const studyNodeId = downstreamStudyNodeId(node.id)
    if (!studyNodeId) {
      throw new Error('这个视频还没有拉片，请先执行逐帧拉片')
    }
    const studyNode = nodeById(studyNodeId)
    const id =
      studyNode && studyNode.type === 'cine'
        ? String(studyNode.data.studyId ?? '')
        : ''
    if (!id) throw new Error('拉片节点缺少拉片数据')
    return { studyId: id, studyNodeId }
  }

  throw new Error('只能从视频节点或拉片节点读取拉片数据')
}

function truncate(value: string | undefined, max = 300): string | undefined {
  if (!value) return undefined
  return value.length > max ? `${value.slice(0, max)}…` : value
}

function studySummary(study: FilmStudy): Record<string, unknown> {
  return {
    studyId: study.id,
    sourceName: study.sourceName,
    sourcePath: study.sourcePath,
    duration: study.duration,
    fps: study.fps,
    frameInterval: study.frameInterval,
    frameCount: study.frames.length,
    segmentCount: study.segments.length,
    analyzed: Boolean(study.autoAnalyzedAt || study.analysisModel),
    ...(study.analysisModel ? { analysisModel: study.analysisModel } : {}),
    ...(study.macroAnalysis
      ? {
          macroAnalysis: {
            ...(truncate(study.macroAnalysis.overallStructure, 800)
              ? {
                  overallStructure: truncate(
                    study.macroAnalysis.overallStructure,
                    800
                  )
                }
              : {}),
            ...(truncate(study.macroAnalysis.narrativeStrategy, 800)
              ? {
                  narrativeStrategy: truncate(
                    study.macroAnalysis.narrativeStrategy,
                    800
                  )
                }
              : {}),
            ...(truncate(study.macroAnalysis.rhythmPattern, 800)
              ? {
                  rhythmPattern: truncate(
                    study.macroAnalysis.rhythmPattern,
                    800
                  )
                }
              : {}),
            ...(truncate(study.macroAnalysis.informationStrategy, 800)
              ? {
                  informationStrategy: truncate(
                    study.macroAnalysis.informationStrategy,
                    800
                  )
                }
              : {}),
            ...(truncate(study.macroAnalysis.coreCreativeIntent, 800)
              ? {
                  coreCreativeIntent: truncate(
                    study.macroAnalysis.coreCreativeIntent,
                    800
                  )
                }
              : {})
          }
        }
      : {}),
    storyLineCount: study.storyLines?.length ?? 0,
    audiencePointCount: study.audienceCurvePoints?.length ?? 0,
    subtitleCount: study.subtitles?.length ?? 0,
    segments: study.segments.slice(0, 24).map((segment) => ({
      id: segment.id,
      startTime: segment.startTime,
      endTime: segment.endTime,
      title: segment.title,
      type: segment.type,
      ...(segment.shotSize ? { shotSize: segment.shotSize } : {}),
      ...(segment.cameraAngle ? { cameraAngle: segment.cameraAngle } : {}),
      ...(segment.cameraMove ? { cameraMove: segment.cameraMove } : {}),
      ...(segment.structureRole
        ? { structureRole: segment.structureRole }
        : {}),
      ...(truncate(segment.visualDescription)
        ? { visualDescription: truncate(segment.visualDescription) }
        : {}),
      ...(truncate(segment.imagePrompt)
        ? { imagePrompt: truncate(segment.imagePrompt) }
        : {}),
      ...(truncate(segment.voiceOver)
        ? { voiceOver: truncate(segment.voiceOver) }
        : {}),
      ...(truncate(segment.musicCue)
        ? { musicCue: truncate(segment.musicCue) }
        : {})
    })),
    ...(study.segments.length > 24 ? { segmentsTruncated: true } : {})
  }
}

function nodeChange(before: {
  nodeIds: Set<string>
  edgeIds: Set<string>
}): AgentTurnChange {
  const state = useCanvasStore.getState()
  const change = emptyChange()
  const afterNodeIds = new Set(state.nodes.map((node) => node.id))
  const afterEdgeIds = new Set(state.edges.map((edge) => edge.id))

  change.createdNodeIds.push(
    ...[...afterNodeIds].filter((id) => !before.nodeIds.has(id))
  )
  change.deletedNodeIds.push(
    ...[...before.nodeIds].filter((id) => !afterNodeIds.has(id))
  )
  change.createdEdgeIds.push(
    ...[...afterEdgeIds].filter((id) => !before.edgeIds.has(id))
  )
  change.deletedEdgeIds.push(
    ...[...before.edgeIds].filter((id) => !afterEdgeIds.has(id))
  )
  return change
}

async function exportStudy(
  studyId: string,
  format: string
): Promise<{ ok: boolean; result?: unknown; error?: string }> {
  try {
    const result =
      format === 'analysis'
        ? await window.api.filmStudy.exportAnalysisPackage(studyId)
        : format === 'bundle'
          ? await window.api.filmStudy.exportBundle(studyId)
          : await window.api.filmStudy.exportMarkdown(studyId)

    if (result.canceled) {
      return { ok: true, result: { canceled: true } }
    }
    return { ok: true, result: { path: result.path ?? null, format } }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : '导出拉片结果失败'
    }
  }
}

export async function executeFilmTool(
  call: AgentToolCallRequest
): Promise<FilmToolResult> {
  try {
    const nodeId =
      typeof call.args.nodeId === 'string' ? call.args.nodeId : undefined
    const studyId =
      typeof call.args.studyId === 'string' ? call.args.studyId : undefined

    if (call.name === 'film_study_get') {
      const ref = resolveStudy(nodeId, studyId)
      const study = await window.api.filmStudy.load(ref.studyId)
      return {
        ok: true,
        result: {
          ...studySummary(study),
          ...(ref.studyNodeId ? { studyNodeId: ref.studyNodeId } : {})
        }
      }
    }

    if (call.name === 'film_study_export') {
      const ref = resolveStudy(nodeId, studyId)
      const format =
        call.args.format === 'analysis' || call.args.format === 'bundle'
          ? call.args.format
          : 'markdown'
      const exported = await exportStudy(ref.studyId, format)
      return {
        ...exported,
        ...(exported.ok
          ? { result: { ...(exported.result as object), studyId: ref.studyId } }
          : {})
      }
    }

    if (call.name === 'film_study_update_segment') {
      const ref = resolveStudy(nodeId, studyId)
      const study = await window.api.filmStudy.load(ref.studyId)
      const segmentId = String(call.args.segmentId ?? '')
      const segment = study.segments.find((item) => item.id === segmentId)
      if (!segment) {
        return { ok: false, error: '找不到这个拉片段落' }
      }
      const patch =
        call.args.patch &&
        typeof call.args.patch === 'object' &&
        !Array.isArray(call.args.patch)
          ? (call.args.patch as Partial<FilmStudySegment>)
          : {}
      if (Object.keys(patch).length === 0) {
        return { ok: false, error: 'patch 不能为空' }
      }

      useFilmStudyStore.getState().rememberFilmTurn(call.turnId, study)
      const next: FilmStudy = {
        ...study,
        segments: study.segments.map((item) =>
          item.id === segmentId ? { ...item, ...patch, id: item.id } : item
        ),
        updatedAt: new Date().toISOString()
      }
      const saved = await window.api.filmStudy.save(next)
      if (useFilmStudyStore.getState().study?.id === saved.id) {
        useFilmStudyStore.getState().replaceStudy(saved)
      }
      const updated = saved.segments.find((item) => item.id === segmentId)
      return {
        ok: true,
        result: {
          studyId: saved.id,
          segmentId,
          segment: updated ?? null
        },
        change: filmChange()
      }
    }

    if (call.name === 'film_study_extract_subtitles') {
      const ref = resolveStudy(nodeId, studyId)
      const before = await window.api.filmStudy.load(ref.studyId)
      useFilmStudyStore.getState().rememberFilmTurn(call.turnId, before)
      const saved = await window.api.filmStudy.extractSubtitles(ref.studyId)
      if (useFilmStudyStore.getState().study?.id === saved.id) {
        useFilmStudyStore.getState().replaceStudy(saved)
      }
      return {
        ok: true,
        result: {
          studyId: saved.id,
          subtitleCount: saved.subtitles?.length ?? 0
        },
        change: filmChange()
      }
    }

    if (call.name === 'film_study_auto') {
      if (!nodeId) return { ok: false, error: '缺少 nodeId' }
      const node = nodeById(nodeId)
      if (!node || node.type !== 'cine') {
        return { ok: false, error: '找不到这个画布节点' }
      }

      const isStudy = node.data.kind === 'study'
      const isVideo = node.data.kind === 'video'
      if (!isStudy && !isVideo) {
        return { ok: false, error: '只能对视频节点或拉片节点执行拉片' }
      }

      const interval =
        typeof call.args.interval === 'number'
          ? call.args.interval
          : isStudy
            ? node.data.studyInterval ?? 0
            : 0
      const modelKey =
        typeof call.args.modelKey === 'string'
          ? call.args.modelKey
          : isStudy
            ? node.data.studyModelKey
            : undefined
      const defaults: FilmStudyOutputOptions = isStudy
        ? node.data.studyOutputs ?? { storyboard: true, sheet: true }
        : { storyboard: true, sheet: true }
      const outputs: FilmStudyOutputOptions = {
        ...defaults,
        ...(call.args.outputs &&
        typeof call.args.outputs === 'object' &&
        !Array.isArray(call.args.outputs)
          ? (call.args.outputs as FilmStudyOutputOptions)
          : {})
      }

      const before = {
        nodeIds: new Set(
          useCanvasStore.getState().nodes.map((item) => item.id)
        ),
        edgeIds: new Set(
          useCanvasStore.getState().edges.map((item) => item.id)
        )
      }

      const canvas = useCanvasStore.getState()
      canvas.beginToolTurn(call.turnId)
      try {
        let studyNodeId = nodeId
        if (isVideo) {
          const created = createStudyNodeFromVideo(nodeId, interval)
          if (!created) {
            return {
              ok: false,
              error: '当前视频还没有可用的视频输出'
            }
          }
          studyNodeId = created
        }

        await runFilmStudyAuto(studyNodeId, {
          interval,
          ...(modelKey ? { modelKey } : {}),
          outputs
        })

        const finished = nodeById(studyNodeId)
        const data = finished?.type === 'cine' ? finished.data : undefined
        const change = nodeChange(before)
        change.updatedNodeIds.push(studyNodeId)

        if (!data?.studyId) {
          return {
            ok: false,
            error: data?.error ?? '拉片没有返回结果',
            change
          }
        }

        return {
          ok: true,
          result: {
            studyNodeId,
            studyId: data.studyId,
            frameCount: data.studySummary?.frameCount ?? 0,
            segmentCount: data.studySummary?.segmentCount ?? 0,
            analyzed: data.studyAnalyzed === true,
            ...(data.studyAnalysisError
              ? { analysisError: data.studyAnalysisError }
              : {})
          },
          change
        }
      } finally {
        canvas.endToolTurn()
      }
    }

    return { ok: false, error: `未实现的拉片工具：${call.name}` }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : '拉片工具执行失败'
    }
  }
}
