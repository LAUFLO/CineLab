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
import type { FilmStudyMapping } from '@shared/film-study-v2'
import {
  absolutePosition,
  nodeSize,
  useCanvasStore
} from './canvas'
import { useUIStore } from './ui'
import {
  buildRemakePrompt,
  buildShotMarkdown,
  buildStudyTableMarkdown,
  buildStyleMarkdown
} from '../canvas/nodes/study-sheet'

interface StudyRunConfig {
  interval?: number
  modelKey?: string
  outputs?: FilmStudyOutputOptions
}

interface FilmStudyState {
  study: FilmStudy | null
  sheetNodeId: string | null
  sheetStudy: FilmStudy | null
  sheetLoading: boolean
  subscribe: () => () => void
  start: (input: FilmStudyExtractRequest) => Promise<void>
  runAuto: (nodeId: string, config?: StudyRunConfig) => Promise<void>
  cancel: (nodeId: string) => Promise<void>
  retry: (nodeId: string) => Promise<void>
  rerunShot: (nodeId: string) => Promise<void>
  addStudyGroup: (
    nodeId: string,
    kind: 'cast' | 'scene' | 'style' | 'audio'
  ) => Promise<void>
  remake: { nodeId: string; study: FilmStudy } | null
  remakeShot: (nodeId: string) => Promise<void>
  remakeAll: (nodeId: string) => Promise<void>
  remakeShots: (
    nodeIds: string[],
    choices?: Record<string, string>
  ) => Promise<void>
  confirmRemake: (choices: Record<string, string>) => Promise<void>
  cancelRemake: () => void
  openSheet: (nodeId: string) => Promise<void>
  closeSheet: () => void
  updateStudy: (updater: (study: FilmStudy) => FilmStudy) => void
  replaceStudy: (study: FilmStudy) => void
  rememberFilmTurn: (turnId: string, study: FilmStudy) => void
  undoFilmTurn: (turnId: string) => Promise<boolean>
  saveNow: () => Promise<void>
}

let saveTimer: ReturnType<typeof setTimeout> | null = null
const MAX_FILM_TURN_SNAPSHOTS = 10
const filmTurnSnapshots = new Map<string, FilmStudy>()

function patchNode(nodeId: string, patch: Partial<CineNodeData>): void {
  useCanvasStore.getState().patchNodeData(nodeId, patch)
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

/** 任意 cine 节点的 data：镜头文本、首尾帧、拉片节点都用它。 */
function cineNode(nodeId: string): CineNodeData | null {
  const node = useCanvasStore
    .getState()
    .nodes.find((entry) => entry.id === nodeId)
  if (!node || node.type !== 'cine') return null
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
      text: buildStudyTableMarkdown(study),
      status: 'done',
      assetOnly: true
    })
    canvas.resizeNode(sheetId, 520)
    canvas.onConnect({ source: nodeId, target: sheetId })
    created.push(sheetId)
  }

  if (outputs.storyboard !== false && (study.shots?.length ?? 0) > 0) {
    const ids = canvas.addShotNodes(
      study,
      { x: origin.x + 420, y: origin.y },
      nodeId
    )
    created.push(...ids)
  } else if (outputs.storyboard !== false && study.frames.length > 0) {
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
      },
      true
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
      },
      true
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
      nodeId,
      undefined,
      true
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
  study: null,
  sheetNodeId: null,
  sheetStudy: null,
  sheetLoading: false,
  remake: null,

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
          fps: study.fps,
          ...(study.shots?.length ? { shotCount: study.shots.length } : {}),
          ...(study.scenes?.length ? { sceneCount: study.scenes.length } : {}),
          ...(study.cast?.length ? { castCount: study.cast.length } : {}),
          ...(study.frames.length > 0
            ? {
                coverPaths: study.frames
                  .slice(0, 3)
                  .map((frame) => frame.file)
              }
            : {})
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

  rerunShot: async (nodeId) => {
    const data = cineNode(nodeId)
    if (!data) return
    const ref = data.studyRef
    if (!ref || ref.kind !== 'shot-text' || !ref.index) return

    const study = await window.api.filmStudy.rerunShot(
      ref.studyId,
      ref.index,
      data.studyModelKey
    )
    const shot = study.shots?.find((item) => item.index === ref.index)
    if (!shot) return
    const scene = study.scenes?.find(
      (item) =>
        shot.index >= item.shots[0] && shot.index <= item.shots[1]
    )

    const canvas = useCanvasStore.getState()
    for (const node of canvas.nodes) {
      if (node.type !== 'cine') continue
      const nodeRef = node.data.studyRef
      if (
        !nodeRef ||
        nodeRef.studyId !== ref.studyId ||
        nodeRef.index !== ref.index
      ) {
        continue
      }

      if (nodeRef.kind === 'shot') {
        const outputs = node.data.outputs
        if (!outputs?.length) continue
        const isFirst = String(node.data.title ?? '').endsWith('首')
        canvas.patchNodeData(node.id, {
          outputs: [
            { ...outputs[0], path: isFirst ? shot.firstFrame : shot.lastFrame }
          ]
        })
      } else if (nodeRef.kind === 'shot-text') {
        canvas.patchNodeData(node.id, {
          text: buildShotMarkdown(shot, scene, study.cast ?? [])
        })
      }
    }
  },

  remakeShot: async (nodeId) => {
    const data = cineNode(nodeId)
    const ref = data?.studyRef
    if (!ref || ref.kind !== 'shot-text' || !ref.index) return
    const study = await window.api.filmStudy.load(ref.studyId)
    set({ remake: { nodeId, study } })
  },

  remakeAll: async (nodeId) => {
    const data = studyNode(nodeId)
    if (!data?.studyId) return
    const study = await window.api.filmStudy.load(data.studyId)
    const canvas = useCanvasStore.getState()
    const ids = canvas.nodes
      .filter(
        (node) =>
          node.type === 'cine' &&
          node.data.studyRef?.studyId === study.id &&
          node.data.studyRef.kind === 'shot-text'
      )
      .map((node) => node.id)
    if (ids.length === 0) {
      useUIStore.getState().showToast('还没有镜头节点')
      return
    }
    await get().remakeShots(ids)
  },

  remakeShots: async (nodeIds, choices = {}) => {
    if (nodeIds.length === 0) return
    const first = cineNode(nodeIds[0])
    const ref = first?.studyRef
    if (!ref) return
    const study = await window.api.filmStudy.load(ref.studyId)
    const valid = nodeIds.filter((id) => {
      const node = useCanvasStore
        .getState()
        .nodes.find((item) => item.id === id)
      return (
        node?.type === 'cine' &&
        node.data.studyRef?.studyId === study.id &&
        node.data.studyRef.kind === 'shot-text'
      )
    })
    for (const id of valid) {
      set({ remake: { nodeId: id, study } })
      await get().confirmRemake(choices)
    }
  },

  cancelRemake: () => set({ remake: null }),

  confirmRemake: async (choices) => {
    const current = get().remake
    if (!current) return
    const { nodeId, study } = current
    const ref = cineNode(nodeId)?.studyRef
    const shot = study.shots?.find((item) => item.index === ref?.index)
    const source = useCanvasStore
      .getState()
      .nodes.find((node) => node.id === nodeId)
    if (!shot || !source) {
      set({ remake: null })
      return
    }

    const canvas = useCanvasStore.getState()
    const position = absolutePosition(source, canvas.nodes)
    const size = nodeSize(source)
    const videoPosition = {
      x: position.x + size.width + 80,
      y: position.y
    }
    const videoId = canvas.addNode('video', videoPosition)
    canvas.patchNodeData(videoId, {
      title: `镜 ${String(shot.index).padStart(2, '0')} 复刻`,
      status: 'idle',
      studyRef: {
        studyId: study.id,
        kind: 'shot',
        index: shot.index
      }
    })

    const next = useCanvasStore.getState()
    const frames = next.nodes
      .filter(
        (node) =>
          node.type === 'cine' &&
          node.data.kind === 'image' &&
          node.data.studyRef?.studyId === study.id &&
          node.data.studyRef.index === shot.index &&
          node.data.studyRef.kind === 'shot'
      )
      .sort((a, b) =>
        String(a.data.title ?? '').endsWith('首') ? -1 : 1
      )
    for (const frame of frames) {
      next.onConnect({ source: frame.id, target: videoId })
    }
    next.onConnect({ source: nodeId, target: videoId })

    const mapping: FilmStudyMapping = { cast: {}, scenes: {} }
    let prompt = buildRemakePrompt(shot)
    let offset = 0

    for (const item of study.cast ?? []) {
      const choice = choices[`cast:${item.id}`] ?? 'original'
      if (choice === 'original') {
        mapping.cast[item.id] = { kind: 'original' }
        continue
      }
      if (choice === 'new') {
        const id = useCanvasStore.getState().addNode('image', {
          x: videoPosition.x - 320,
          y: videoPosition.y + offset
        })
        offset += 220
        useCanvasStore.getState().patchNodeData(id, {
          title: `${item.name} · 待生成`,
          status: 'idle',
          prompt: item.appearance ?? '',
          studyRef: {
            studyId: study.id,
            kind: 'cast',
            key: item.id
          }
        })
        useCanvasStore.getState().onConnect({ source: id, target: videoId })
        mapping.cast[item.id] = {
          kind: 'node',
          nodeId: id,
          name: item.name
        }
        continue
      }
      if (choice.startsWith('asset:')) {
        const path = choice.slice('asset:'.length)
        const name =
          path.split('/').pop()?.replace(/\.[^.]+$/, '') ?? item.name
        const ids = useCanvasStore.getState().addAssetNodes(
          'image',
          { x: videoPosition.x - 320, y: videoPosition.y + offset },
          [
            {
              id: `${study.id}-map-${item.id}`,
              path,
              kind: 'image',
              createdAt: new Date().toISOString(),
              model: '资产库'
            }
          ],
          name,
          undefined,
          { scope: 'global', cellWidth: 240 },
          true
        )
        offset += 220
        if (ids[0]) {
          useCanvasStore
            .getState()
            .onConnect({ source: ids[0], target: videoId })
        }
        mapping.cast[item.id] = { kind: 'asset', path, name }
      }
    }

    for (const scene of study.scenes ?? []) {
      const choice = choices[`scene:${scene.id}`] ?? 'original'
      if (choice === 'original') {
        mapping.scenes[scene.id] = { kind: 'original' }
        continue
      }
      if (choice.startsWith('asset:')) {
        const path = choice.slice('asset:'.length)
        const name =
          path.split('/').pop()?.replace(/\.[^.]+$/, '') ?? scene.name
        const ids = useCanvasStore.getState().addAssetNodes(
          'image',
          { x: videoPosition.x - 320, y: videoPosition.y + offset },
          [
            {
              id: `${study.id}-scene-map-${scene.id}`,
              path,
              kind: 'image',
              createdAt: new Date().toISOString(),
              model: '资产库'
            }
          ],
          name,
          undefined,
          { scope: 'global', cellWidth: 240 },
          true
        )
        offset += 220
        if (ids[0]) {
          useCanvasStore
            .getState()
            .onConnect({ source: ids[0], target: videoId })
        }
        mapping.scenes[scene.id] = { kind: 'asset', path, name }
      }
    }

    for (const item of study.cast ?? []) {
      const target = mapping.cast[item.id]
      if (
        target?.name &&
        target.kind !== 'original' &&
        target.name !== item.name
      ) {
        prompt = prompt.split(item.name).join(target.name)
      }
    }
    for (const scene of study.scenes ?? []) {
      const target = mapping.scenes[scene.id]
      if (
        target?.name &&
        target.kind !== 'original' &&
        target.name !== scene.name
      ) {
        prompt = prompt.split(scene.name).join(target.name)
      }
    }

    useCanvasStore.getState().patchNodeData(videoId, { prompt })
    void window.api.filmStudy
      .save({ ...study, mapping, updatedAt: new Date().toISOString() })
      .catch(() => undefined)
    set({ remake: null })
  },

  addStudyGroup: async (nodeId, kind) => {
    const data = studyNode(nodeId)
    if (!data?.studyId) return
    const study = await window.api.filmStudy.load(data.studyId)
    const canvas = useCanvasStore.getState()
    const origin = studyOrigin(nodeId)

    if (kind === 'cast') {
      const items = (study.cast ?? []).filter((item) => item.facePath)
      if (items.length === 0) {
        useUIStore.getState().showToast('还没有角色数据')
        return
      }
      const assets: GeneratedAsset[] = items.map((item) => ({
        id: `${study.id}-cast-${item.id}`,
        path: item.facePath as string,
        kind: 'image',
        createdAt: study.updatedAt,
        model: '逐帧拉片',
        width: 480,
        height: 270
      }))
      const ids = canvas.addAssetNodes(
        'image',
        { x: origin.x - 460, y: origin.y },
        assets,
        '角色',
        nodeId,
        {
          groupTitle: '角色',
          groupColor: 'teal',
          columns: 4,
          cellWidth: 200,
          scope: 'project',
          connectGroup: true
        },
        true
      )
      ids.forEach((id, index) => {
        const item = items[index]
        canvas.patchNodeData(id, {
          title: item.name,
          studyRef: { studyId: study.id, kind: 'cast', key: item.id }
        })
      })
      return
    }

    if (kind === 'scene') {
      const items = (study.scenes ?? []).filter((item) => item.basePath)
      if (items.length === 0) {
        useUIStore.getState().showToast('还没有场景数据')
        return
      }
      const assets: GeneratedAsset[] = items.map((item) => ({
        id: `${study.id}-scene-${item.id}`,
        path: item.basePath as string,
        kind: 'image',
        createdAt: study.updatedAt,
        model: '逐帧拉片',
        width: 480,
        height: 270
      }))
      const ids = canvas.addAssetNodes(
        'image',
        { x: origin.x - 460, y: origin.y + 420 },
        assets,
        '场景',
        nodeId,
        {
          groupTitle: '场景',
          groupColor: 'green',
          columns: 4,
          cellWidth: 220,
          scope: 'project',
          connectGroup: true
        },
        true
      )
      ids.forEach((id, index) => {
        const item = items[index]
        canvas.patchNodeData(id, {
          title: `${item.id} · ${item.name}`,
          studyRef: { studyId: study.id, kind: 'scene', key: item.id }
        })
      })
      return
    }

    if (kind === 'style') {
      if (!study.style) {
        useUIStore.getState().showToast('还没有风格数据')
        return
      }
      const id = canvas.addNode('text', {
        x: origin.x - 460,
        y: origin.y + 840
      })
      canvas.patchNodeData(id, {
        title: '风格档案',
        text: buildStyleMarkdown(study.style),
        status: 'done',
        assetOnly: true,
        studyRef: { studyId: study.id, kind: 'style' }
      })
      canvas.resizeNode(id, 360)
      canvas.onConnect({ source: nodeId, target: id })
      return
    }

    const assets: GeneratedAsset[] = []
    if (study.audio?.bgmPath) {
      assets.push({
        id: `${study.id}-bgm`,
        path: study.audio.bgmPath,
        kind: 'audio',
        createdAt: study.updatedAt,
        model: '逐帧拉片',
        hasAudio: true
      })
    }
    for (const item of study.cast ?? []) {
      if (!item.voicePath) continue
      assets.push({
        id: `${study.id}-voice-${item.id}`,
        path: item.voicePath,
        kind: 'audio',
        createdAt: study.updatedAt,
        model: '逐帧拉片',
        hasAudio: true
      })
    }
    if (assets.length === 0) {
      useUIStore.getState().showToast('还没有音频数据')
      return
    }
    const ids = canvas.addAssetNodes(
      'audio',
      { x: origin.x - 460, y: origin.y + 840 },
      assets,
      '音频',
      nodeId,
      {
        groupTitle: '音频',
        groupColor: 'amber',
        columns: 3,
        cellWidth: 260,
        scope: 'project',
        connectGroup: true
      },
      true
    )
    ids.forEach((id, index) => {
      canvas.patchNodeData(id, {
        title:
          index === 0 && study.audio?.bgmPath
            ? 'BGM'
            : `声音样本 ${index + 1}`,
        studyRef: { studyId: study.id, kind: 'audio' }
      })
    })
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

    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      saveTimer = null
      void window.api.filmStudy.save(next).catch(() => undefined)
    }, 600)
  },

  replaceStudy: (study) => set({ study }),

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
    } catch {
      // 本地编辑保留，下一次保存重试
    }
  }
}))
