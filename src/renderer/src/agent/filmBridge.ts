import type { AgentToolCallRequest, AgentTurnChange } from '@shared/agent'
import type {
  FilmStudy,
  FilmStudyOutputOptions,
  FilmStudySegment
} from '@shared/film-study'
import type { FilmStudyMapping, FilmStudyShot } from '@shared/film-study-v2'
import {
  createStudyNodeFromVideo,
  runFilmStudyAuto
} from '../canvas/nodes/film-study-runner'
import { createStudioFromNodes } from '../studio/nodes'
import { useCanvasStore, type CanvasNode } from '../stores/canvas'
import {
  refreshStudySheetNode,
  useFilmStudyStore
} from '../stores/film-study'
import { useStudioStore } from '../stores/studio'

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

function shotIndexOf(node: CanvasNode): number | undefined {
  if (node.type !== 'cine') return undefined
  const ref = node.data.studyRef as { index?: number } | undefined
  return typeof ref?.index === 'number' ? ref.index : undefined
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

function resolveStudy(nodeId?: string, studyId?: string): StudyRef {
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

function studySummaryV2(study: FilmStudy): Record<string, unknown> {
  const shots = study.shots ?? []
  const scenes = study.scenes ?? []
  const cast = study.cast ?? []
  const weights = { live: 0, ai: 0, cg: 0, code: 0 }
  let total = 0

  for (const shot of shots) {
    const label = shot.production?.label
    const weight = shot.production?.confidence ?? 0
    if (!weight) continue
    if (label === 'live_action') weights.live += weight
    else if (label === 'ai_video' || label === 'avatar') weights.ai += weight
    else if (label === 'cg_3d') weights.cg += weight
    else if (label === 'code_render' || label === 'screen_capture')
      weights.code += weight
    total += weight
  }

  const share = (value: number): number =>
    total > 0 ? Math.round((value / total) * 100) / 100 : 0
  const generated = shots.filter((shot) => shot.status === 'generated').length

  return {
    studyId: study.id,
    sourceName: study.sourceName,
    duration: Math.round(study.duration * 10) / 10,
    shotCount: shots.length || study.segments.length,
    sceneCount: scenes.length,
    ...(total > 0
      ? {
          production: {
            live: share(weights.live),
            ai: share(weights.ai),
            cg: share(weights.cg),
            code: share(weights.code)
          }
        }
      : {}),
    cast: cast.slice(0, 5).map((item) => ({
      id: item.id,
      name: item.name,
      ...(item.role ? { role: item.role } : {})
    })),
    scenes: scenes.slice(0, 8).map((scene) => ({
      id: scene.id,
      name: scene.name,
      shots: scene.shots
    })),
    remake: {
      total: shots.length,
      generated,
      pending: Math.max(0, shots.length - generated)
    },
    ...(study.analysisModel ? { analysisModel: study.analysisModel } : {}),
    ...(study.mapping ? { mapping: study.mapping } : {})
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

    const handlers: Record<
      string,
      (call: AgentToolCallRequest) => Promise<FilmToolResult>
    > = {
      film_study_get: async (call) => {
        const ref = resolveStudy(nodeId, studyId)
        const study = await window.api.filmStudy.load(ref.studyId)
        return {
          ok: true,
          result: {
            ...studySummaryV2(study),
            ...(ref.studyNodeId ? { studyNodeId: ref.studyNodeId } : {})
          }
        }
      },

      film_study_get_shot: async (call) => {
        const ref = resolveStudy(nodeId, studyId)
        const study = await window.api.filmStudy.load(ref.studyId)
        const index = Number(call.args.index)
        const shot = study.shots?.find((item) => item.index === index)
        if (!shot) {
          return { ok: false, error: '找不到该镜头' }
        }
        const scene = study.scenes?.find(
          (item) => index >= item.shots[0] && index <= item.shots[1]
        )
        const cast = (shot.castIds ?? []).map((id) => {
          const item = study.cast?.find((member) => member.id === id)
          return {
            id,
            name: item?.name ?? id,
            ...(item?.role ? { role: item.role } : {})
          }
        })
        return {
          ok: true,
          result: {
            ...shot,
            ...(scene ? { scene } : {}),
            cast
          }
        }
      },

      film_study_update_shot: async (call) => {
        const ref = resolveStudy(nodeId, studyId)
        const study = await window.api.filmStudy.load(ref.studyId)
        const index = Number(call.args.index)
        const shot = study.shots?.find((item) => item.index === index)
        if (!shot) return { ok: false, error: '找不到该镜头' }

        const raw = call.args.patch
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
          return { ok: false, error: 'patch 不能为空' }
        }
        const fields = [
          'shotSize',
          'cameraAngle',
          'cameraMove',
          'lighting',
          'visualDescription',
          'actionSummary',
          'emotion',
          'imagePrompt',
          'videoPrompt'
        ] as const
        const patch: Partial<FilmStudyShot> = {}
        for (const field of fields) {
          const value = (raw as Record<string, unknown>)[field]
          if (typeof value === 'string') patch[field] = value
        }
        const status = (raw as Record<string, unknown>).status
        if (
          status === 'pending' ||
          status === 'generated' ||
          status === 'edited'
        ) {
          patch.status = status
        }
        if (Object.keys(patch).length === 0) {
          return { ok: false, error: 'patch 没有可修改的字段' }
        }

        useFilmStudyStore.getState().rememberFilmTurn(call.turnId, study)
        const saved = await window.api.filmStudy.save({
          ...study,
          shots: study.shots?.map((item) =>
            item.index === index ? { ...item, ...patch, index } : item
          ),
          updatedAt: new Date().toISOString()
        })
        if (useFilmStudyStore.getState().study?.id === saved.id) {
          useFilmStudyStore.getState().replaceStudy(saved)
        }
        refreshStudySheetNode(saved)
        return {
          ok: true,
          result: {
            studyId: saved.id,
            index,
            shot: saved.shots?.find((item) => item.index === index) ?? null
          },
          change: filmChange()
        }
      },

      film_study_remake: async (call) => {
        const ref = resolveStudy(nodeId, studyId)
        const study = await window.api.filmStudy.load(ref.studyId)
        const raw = call.args.indices
        const indexes = Array.isArray(raw)
          ? raw.map((value) => Number(value)).filter(Number.isInteger)
          : []
        const canvas = useCanvasStore.getState()
        const targets = canvas.nodes
          .filter(
            (node) =>
              node.type === 'cine' &&
              node.data.studyRef?.studyId === study.id &&
              node.data.studyRef?.kind === 'shot-text'
          )
          .filter((node) => {
            const index = shotIndexOf(node)
            return (
              indexes.length === 0 ||
              (index !== undefined && indexes.includes(index))
            )
          })
          .map((node) => node.id)
        if (targets.length === 0) {
          return { ok: false, error: '没有镜头文本节点，请先拉片' }
        }

        const choices =
          call.args.choices &&
          typeof call.args.choices === 'object' &&
          !Array.isArray(call.args.choices)
            ? (call.args.choices as Record<string, string>)
            : {}
        const before = {
          nodeIds: new Set(canvas.nodes.map((node) => node.id)),
          edgeIds: new Set(canvas.edges.map((edge) => edge.id))
        }
        await useFilmStudyStore.getState().remakeShots(targets, choices)
        return {
          ok: true,
          result: { count: targets.length },
          change: nodeChange(before)
        }
      },

      film_study_split_scenes: async (call) => {
        const ref = resolveStudy(nodeId, studyId)
        const modelKey =
          typeof call.args.modelKey === 'string'
            ? call.args.modelKey
            : undefined
        const saved = await window.api.filmStudy.splitScenes(
          ref.studyId,
          modelKey
        )
        if (useFilmStudyStore.getState().study?.id === saved.id) {
          useFilmStudyStore.getState().replaceStudy(saved)
        }
        return {
          ok: true,
          result: { studyId: saved.id, scenes: saved.scenes ?? [] },
          change: filmChange()
        }
      },

      film_study_map_cast: async (call) => {
        const ref = resolveStudy(nodeId, studyId)
        const study = await window.api.filmStudy.load(ref.studyId)
        const mapping: FilmStudyMapping = {
          cast: { ...(study.mapping?.cast ?? {}) },
          scenes: { ...(study.mapping?.scenes ?? {}) }
        }

        const apply = (target: unknown, key: 'cast' | 'scenes'): void => {
          if (!target || typeof target !== 'object' || Array.isArray(target)) {
            return
          }
          for (const [id, value] of Object.entries(target)) {
            if (!value || typeof value !== 'object' || Array.isArray(value)) {
              continue
            }
            const item = value as Record<string, unknown>
            const kind =
              item.kind === 'node'
                ? 'node'
                : item.kind === 'asset'
                  ? 'asset'
                  : 'original'
            mapping[key][id] = {
              kind,
              ...(typeof item.path === 'string' ? { path: item.path } : {}),
              ...(typeof item.nodeId === 'string'
                ? { nodeId: item.nodeId }
                : {}),
              ...(typeof item.name === 'string' ? { name: item.name } : {})
            }
          }
        }
        apply(call.args.cast, 'cast')
        apply(call.args.scenes, 'scenes')

        const saved = await window.api.filmStudy.save({
          ...study,
          mapping,
          updatedAt: new Date().toISOString()
        })
        if (useFilmStudyStore.getState().study?.id === saved.id) {
          useFilmStudyStore.getState().replaceStudy(saved)
        }
        return {
          ok: true,
          result: { studyId: saved.id, mapping },
          change: filmChange()
        }
      },

      film_study_build_timeline: async (call) => {
        const ref = resolveStudy(nodeId, studyId)
        const study = await window.api.filmStudy.load(ref.studyId)
        const raw = call.args.indices
        const indexes = Array.isArray(raw)
          ? raw.map((value) => Number(value)).filter(Number.isInteger)
          : []
        const canvas = useCanvasStore.getState()
        const videos = canvas.nodes
          .filter(
            (node) =>
              node.type === 'cine' &&
              node.data.kind === 'video' &&
              node.data.studyRef?.studyId === study.id &&
              node.data.studyRef?.kind === 'shot'
          )
          .filter((node) => {
            const index = shotIndexOf(node)
            return (
              indexes.length === 0 ||
              (index !== undefined && indexes.includes(index))
            )
          })
          .sort((a, b) => (shotIndexOf(a) ?? 0) - (shotIndexOf(b) ?? 0))
          .map((node) => node.id)
        if (videos.length === 0) {
          return { ok: false, error: '还没有复刻生成的视频节点' }
        }

        const studioId = createStudioFromNodes(videos)
        if (!studioId) return { ok: false, error: '创建剪辑室失败' }
        useStudioStore.getState().openStudio(studioId)
        return {
          ok: true,
          result: { studioId, count: videos.length },
          change: filmChange()
        }
      },

      film_study_export: async (call) => {
        const ref = resolveStudy(nodeId, studyId)
        const format =
          call.args.format === 'analysis' || call.args.format === 'bundle'
            ? call.args.format
            : 'markdown'
        const exported = await exportStudy(ref.studyId, format)
        return {
          ...exported,
          ...(exported.ok
            ? {
                result: { ...(exported.result as object), studyId: ref.studyId }
              }
            : {})
        }
      },

      film_study_update_segment: async (call) => {
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
        refreshStudySheetNode(saved)
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
      },

      film_study_extract_subtitles: async (call) => {
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
      },

      film_study_auto: async (call) => {
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
              ? (node.data.studyInterval ?? 0)
              : 0
        const modelKey =
          typeof call.args.modelKey === 'string'
            ? call.args.modelKey
            : isStudy
              ? node.data.studyModelKey
              : undefined
        const defaults: FilmStudyOutputOptions = isStudy
          ? (node.data.studyOutputs ?? { storyboard: true, sheet: true })
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
    }

    const handler = handlers[call.name]
    if (handler) return handler(call)

    return { ok: false, error: `未实现的拉片工具：${call.name}` }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : '拉片工具执行失败'
    }
  }
}
