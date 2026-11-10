import { create } from 'zustand'
import type { CineNodeData } from '@shared/canvas-schema'
import type { GeneratedAsset } from '@shared/generation'
import type {
  FilmStudy,
  FilmStudyAutoResult,
  FilmStudyExtractRequest,
  FilmStudyOutputOptions,
  FilmStudyProgress
} from '@shared/film-study'
import {
  absolutePosition,
  nodeSize,
  useCanvasStore
} from './canvas'
import { useUIStore } from './ui'
import { buildStudySheetMarkdown } from '../canvas/nodes/study-sheet'

interface StudyRunConfig {
  interval?: number
  modelKey?: string
  outputs?: FilmStudyOutputOptions
}

interface FilmStudyState {
  roomNodeId: string | null
  study: FilmStudy | null
  opening: boolean
  sheetNodeId: string | null
  sheetStudy: FilmStudy | null
  sheetLoading: boolean
  subscribe: () => () => void
  start: (input: FilmStudyExtractRequest) => Promise<void>
  runAuto: (nodeId: string, config?: StudyRunConfig) => Promise<void>
  cancel: (nodeId: string) => Promise<void>
  retry: (nodeId: string) => Promise<void>
  openRoom: (nodeId: string) => Promise<void>
  openSheet: (nodeId: string) => Promise<void>
  closeSheet: () => void
  updateStudy: (updater: (study: FilmStudy) => FilmStudy) => void
  replaceStudy: (study: FilmStudy) => void
  rememberFilmTurn: (turnId: string, study: FilmStudy) => void
  undoFilmTurn: (turnId: string) => Promise<boolean>
  saveNow: () => Promise<void>
  closeRoom: () => void
}

let saveTimer: ReturnType<typeof setTimeout> | null = null
const MAX_FILM_TURN_SNAPSHOTS = 10
const filmTurnSnapshots = new Map<string, FilmStudy>()

function patchNode(nodeId: string, patch: Partial<CineNodeData>): void {
  useCanvasStore.getState().patchNodeData(nodeId, patch)
}

function patchSummary(nodeId: string, study: FilmStudy): void {
  patchNode(nodeId, {
    studySummary: {
      studyId: study.id,
      frameCount: study.frames.length,
      segmentCount: study.segments.length,
      interval: study.frameInterval,
      duration: study.duration,
      fps: study.fps
    }
  })
}

function applyProgress(progress: FilmStudyProgress): void {
  if (progress.status === 'running') {
    patchNode(progress.nodeId, {
      status: 'running',
      progress: progress.percent,
      error: undefined
    })
    return
  }

  if (progress.status === 'done') {
    const existingNode = useCanvasStore
      .getState()
      .nodes.find((node) => node.id === progress.nodeId)
    const existing = (existingNode?.data as CineNodeData | undefined)
      ?.studySummary
    const keepSummary =
      Boolean(existing) &&
      Boolean(progress.studyId) &&
      existing?.studyId === progress.studyId

    patchNode(progress.nodeId, {
      status: 'done',
      progress: 100,
      error: undefined,
      studyId: progress.studyId,
      ...(keepSummary
        ? {}
        : {
            studySummary: progress.studyId
              ? {
                  studyId: progress.studyId,
                  frameCount: progress.frameCount ?? progress.current ?? 0,
                  segmentCount: 0,
                  interval: progress.interval ?? 1,
                  duration: progress.duration ?? 0,
                  fps: progress.fps ?? 0
                }
              : undefined
          })
    })
    return
  }

  if (progress.status === 'error') {
    patchNode(progress.nodeId, {
      status: 'error',
      progress: 0,
      error: progress.error ?? '拉片失败'
    })
    return
  }

  patchNode(progress.nodeId, { status: 'idle', progress: 0 })
}

function studyNode(nodeId: string): CineNodeData | null {
  const node = useCanvasStore
    .getState()
    .nodes.find((entry) => entry.id === nodeId)
  if (!node || node.data.kind !== 'study') return null
  return node.data as CineNodeData
}

function studyOrigin(nodeId: string): { x: number; y: number } {
  const state = useCanvasStore.getState()
  const node = state.nodes.find((entry) => entry.id === nodeId)
  if (!node) return { x: 200, y: 200 }
  const absolute = absolutePosition(node, state.nodes)
  const size = nodeSize(node)
  return { x: absolute.x + size.width + 80, y: absolute.y }
}

function createStudyOutputs(
  nodeId: string,
  data: CineNodeData,
  study: FilmStudy,
  outputs: FilmStudyOutputOptions,
  result: FilmStudyAutoResult
): string[] {
  const canvas = useCanvasStore.getState()
  const origin = studyOrigin(nodeId)
  const sourceName = data.sourceName ?? study.sourceName ?? '参考视频'
  const created: string[] = []

  if (outputs.sheet !== false) {
    const studyEntry = canvas.nodes.find((entry) => entry.id === nodeId)
    const studyHeight = studyEntry ? nodeSize(studyEntry).height : 336
    const sheetId = canvas.addNode('text', {
      x: origin.x,
      y: origin.y + studyHeight + 40
    })
    canvas.patchNodeData(sheetId, {
      title: `${sourceName} · 分镜表`,
      text: buildStudySheetMarkdown(study),
      status: 'done'
    })
    canvas.resizeNode(sheetId, 520)
    canvas.onConnect({ source: nodeId, target: sheetId })
    created.push(sheetId)
  }

  if (outputs.storyboard !== false && study.frames.length > 0) {
    const assets: GeneratedAsset[] = study.frames.map((frame) => ({
      id: `${study.id}-${frame.index}`,
      path: frame.file,
      kind: 'image',
      createdAt: study.updatedAt,
      model: '逐帧拉片',
      width: 640,
      height: 360
    }))
    const ids = canvas.addAssetNodes(
      'image',
      { x: origin.x + 420, y: origin.y },
      assets,
      '镜',
      nodeId,
      {
        groupTitle: `${sourceName} · 分镜`,
        groupColor: 'blue',
        columns: 4,
        cellWidth: 240,
        scope: 'project',
        connectGroup: true,
        onGroupCreated: (groupId) => created.push(groupId)
      }
    )
    ids.forEach((id, index) => {
      const segment = study.segments[index]
      canvas.patchNodeData(id, {
        title: segment?.title ?? `镜 ${String(index + 1).padStart(2, '0')}`
      })
    })
    created.push(...ids)
  }

  if (outputs.motion && result.motionClips?.length) {
    const assets: GeneratedAsset[] = result.motionClips.map((clip) => ({
      id: `${study.id}-${clip.path}`,
      path: clip.path,
      kind: 'video',
      createdAt: study.updatedAt,
      model: '逐帧拉片',
      duration: clip.duration,
      width: clip.width,
      height: clip.height,
      fps: clip.fps,
      hasAudio: clip.hasAudio
    }))
    const ids = canvas.addAssetNodes(
      'video',
      { x: origin.x + 420, y: origin.y + 700 },
      assets,
      '切片',
      nodeId,
      {
        groupTitle: `${sourceName} · 动态切片`,
        groupColor: 'violet',
        columns: 3,
        cellWidth: 320,
        scope: 'project',
        connectGroup: true,
        onGroupCreated: (groupId) => created.push(groupId)
      }
    )
    ids.forEach((id, index) => {
      canvas.patchNodeData(id, {
        title: result.motionClips?.[index]?.title ?? `切片 ${index + 1}`
      })
    })
    created.push(...ids)
  }

  if (outputs.music && result.music) {
    const asset: GeneratedAsset = {
      id: `${study.id}-bgm`,
      path: result.music.path,
      kind: 'audio',
      createdAt: study.updatedAt,
      model: '逐帧拉片',
      duration: result.music.duration,
      hasAudio: true
    }
    const ids = canvas.addAssetNodes(
      'audio',
      { x: origin.x, y: origin.y + 1080 },
      [asset],
      'BGM',
      nodeId
    )
    ids.forEach((id) =>
      canvas.patchNodeData(id, {
        title: `${sourceName} · BGM`
      })
    )
    created.push(...ids)
  }

  return created
}

function removeStudyOutputs(nodeId: string): void {
  const node = useCanvasStore
    .getState()
    .nodes.find((entry) => entry.id === nodeId)
  const ids = (node?.data as CineNodeData | undefined)?.studyOutputNodeIds
  if (!ids || ids.length === 0) return

  const canvas = useCanvasStore.getState()
  // 记录顺序为分组 → 子节点，删除时倒序先删子节点再删分组
  for (const id of [...ids].reverse()) {
    canvas.removeNode(id)
  }
}

export const useFilmStudyStore = create<FilmStudyState>((set, get) => ({
  roomNodeId: null,
  study: null,
  opening: false,
  sheetNodeId: null,
  sheetStudy: null,
  sheetLoading: false,

  subscribe: () => window.api.filmStudy.onProgress(applyProgress),

  start: async (input) => {
    try {
      const result = await window.api.filmStudy.extract(input)
      if (result.cancelled) {
        patchNode(input.nodeId, { status: 'idle', progress: 0 })
        return
      }
      if (result.summary) {
        const summary = result.summary
        patchNode(input.nodeId, {
          status: 'done',
          progress: 100,
          error: undefined,
          studyId: summary.studyId,
          studySummary: summary
        })
      }
    } catch (error) {
      patchNode(input.nodeId, {
        status: 'error',
        progress: 0,
        error: error instanceof Error ? error.message : String(error)
      })
    }
  },

  runAuto: async (nodeId, config) => {
    const data = studyNode(nodeId)
    if (!data) return
    if (!data.sourcePath) {
      patchNode(nodeId, { status: 'error', error: '拉片节点没有源视频' })
      return
    }

    const interval = config?.interval ?? data.studyInterval ?? 0
    const modelKey = config?.modelKey ?? data.studyModelKey
    const outputs = config?.outputs ??
      data.studyOutputs ?? { storyboard: true, sheet: true }

    patchNode(nodeId, {
      status: 'queued',
      progress: 0,
      error: undefined,
      studyInterval: interval,
      studyModelKey: modelKey,
      studyOutputs: outputs,
      studyAnalyzed: undefined,
      studyAnalysisError: undefined
    })

    try {
      const result = await window.api.filmStudy.auto({
        nodeId,
        path: data.sourcePath,
        scope: data.sourceScope,
        sourceName: data.sourceName,
        sourceNodeId: data.sourceNodeId,
        interval,
        modelKey,
        outputs
      })

      if (result.cancelled) {
        patchNode(nodeId, { status: 'idle', progress: 0 })
        return
      }
      if (!result.study) throw new Error('拉片没有返回结果')

      const study = result.study
      patchNode(nodeId, {
        status: 'done',
        progress: 100,
        error: undefined,
        studyId: study.id,
        studySummary: {
          studyId: study.id,
          frameCount: study.frames.length,
          segmentCount: study.segments.length,
          interval: study.frameInterval,
          duration: study.duration,
          fps: study.fps
        },
        studyAnalyzed: result.analyzed,
        studyAnalysisError: result.analysisError
      })

      removeStudyOutputs(nodeId)
      const outputIds = createStudyOutputs(
        nodeId,
        data,
        study,
        outputs,
        result
      )
      patchNode(nodeId, { studyOutputNodeIds: outputIds })

      const toast = useUIStore.getState().showToast
      if (result.analysisError) {
        toast(`分镜已生成，AI 描述失败：${result.analysisError}`, 'error')
      } else if (result.analyzed) {
        toast(`已拆出 ${study.segments.length} 个分镜并完成 AI 描述`)
      } else {
        toast(`已拆出 ${study.segments.length} 个分镜`)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      patchNode(nodeId, { status: 'error', progress: 0, error: message })
      useUIStore.getState().showToast(message, 'error')
    }
  },

  cancel: async (nodeId) => {
    await window.api.filmStudy.cancel(nodeId)
    patchNode(nodeId, { status: 'idle', progress: 0 })
  },

  retry: async (nodeId) => {
    const data = studyNode(nodeId)
    if (!data) return
    await get().runAuto(nodeId, {
      interval: data.studyInterval ?? 0,
      modelKey: data.studyModelKey,
      outputs: data.studyOutputs
    })
  },

  openRoom: async (nodeId) => {
    const data = studyNode(nodeId)
    if (!data?.studyId) return

    set({ opening: true })
    try {
      const study = await window.api.filmStudy.load(data.studyId)
      set({ roomNodeId: nodeId, study, opening: false })
    } catch (error) {
      set({ opening: false })
      patchNode(nodeId, {
        status: 'error',
        error: error instanceof Error ? error.message : String(error)
      })
    }
  },

  openSheet: async (nodeId) => {
    const data = studyNode(nodeId)
    if (!data?.studyId) return

    set({ sheetNodeId: nodeId, sheetLoading: true })
    try {
      const study = await window.api.filmStudy.load(data.studyId)
      set({ sheetStudy: study, sheetLoading: false })
    } catch (error) {
      set({ sheetLoading: false, sheetStudy: null })
      patchNode(nodeId, {
        status: 'error',
        error: error instanceof Error ? error.message : String(error)
      })
    }
  },

  closeSheet: () => set({ sheetNodeId: null, sheetStudy: null }),

  updateStudy: (updater) => {
    const current = get().study
    if (!current) return

    const next: FilmStudy = {
      ...updater(current),
      updatedAt: new Date().toISOString()
    }
    set({ study: next })
    const nodeId = get().roomNodeId
    if (nodeId) patchSummary(nodeId, next)

    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      saveTimer = null
      void window.api.filmStudy.save(next).catch(() => undefined)
    }, 600)
  },

  replaceStudy: (study) => {
    set({ study })
    const nodeId = get().roomNodeId
    if (nodeId) patchSummary(nodeId, study)
  },

  rememberFilmTurn: (turnId, study) => {
    if (!turnId) return
    filmTurnSnapshots.set(turnId, structuredClone(study))
    while (filmTurnSnapshots.size > MAX_FILM_TURN_SNAPSHOTS) {
      const oldest = filmTurnSnapshots.keys().next().value
      if (!oldest) break
      filmTurnSnapshots.delete(oldest)
    }
  },

  undoFilmTurn: async (turnId) => {
    const snapshot = filmTurnSnapshots.get(turnId)
    if (!snapshot) return false
    filmTurnSnapshots.delete(turnId)

    try {
      const saved = await window.api.filmStudy.save(snapshot)
      if (get().study?.id === saved.id) set({ study: saved })
      const nodeId = get().roomNodeId
      if (nodeId) patchSummary(nodeId, saved)
      return true
    } catch {
      return false
    }
  },

  saveNow: async () => {
    if (saveTimer) {
      clearTimeout(saveTimer)
      saveTimer = null
    }
    const current = get().study
    if (!current) return

    try {
      const saved = await window.api.filmStudy.save(current)
      if (get().study?.id === saved.id) set({ study: saved })
      const nodeId = get().roomNodeId
      if (nodeId) patchSummary(nodeId, saved)
    } catch {
      // 本地编辑保留，下一次保存重试
    }
  },

  closeRoom: () => {
    void get().saveNow()
    set({ roomNodeId: null, study: null })
  }
}))
