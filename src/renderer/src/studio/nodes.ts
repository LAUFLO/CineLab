import { NODE_META } from '@shared/canvas-schema'
import type { GeneratedAsset } from '@shared/generation'
import type { LibraryAsset } from '@shared/library-schema'
import { docDurationMs } from '@shared/timeline-layout'
import type { TimelineDoc } from '@shared/timeline-schema'
import {
  absolutePosition,
  isGroupNode,
  isStudioNode,
  nodeSize,
  useCanvasStore,
  type CanvasNode
} from '../stores/canvas'
import { useLibraryStore } from '../stores/library'
import { referencesFromDoc } from './references'

/** 在画布坐标创建剪辑室节点 */
export function createStudioAt(flow: { x: number; y: number }): string {
  return useCanvasStore.getState().addStudioNode(flow)
}

/** 在视口中心创建剪辑室，用于快捷键入口 */
export function createStudioAtViewportCenter(): string {
  const state = useCanvasStore.getState()
  const { viewport } = state
  const meta = NODE_META.studio
  const titleHeight = 28
  return state.addStudioNode({
    x: (window.innerWidth / 2 - viewport.x) / viewport.zoom - meta.width / 2,
    y:
      (window.innerHeight / 2 - viewport.y) / viewport.zoom -
      (meta.height + titleHeight) / 2
  })
}

/**
 * 从素材节点创建剪辑室：右侧 80px，自动连线，返回剪辑室节点 id。
 * 分组内的节点按绝对坐标计算。
 */
export function createStudioFromNode(nodeId: string): string | null {
  const state = useCanvasStore.getState()
  const node = state.nodes.find((entry) => entry.id === nodeId)
  if (!node || node.type === 'group' || node.type === 'studio') return null

  const absolute = absolutePosition(node, state.nodes)
  const width = nodeSize(node).width
  const studioId = state.addStudioNode({
    x: absolute.x + width + 80,
    y: absolute.y
  })
  state.onConnect({ source: nodeId, target: studioId })
  return studioId
}

function studioMaterials(nodes: CanvasNode[], nodeIds: string[]): CanvasNode[] {
  const result: CanvasNode[] = []
  const seen = new Set<string>()

  const push = (node: CanvasNode): void => {
    if (seen.has(node.id)) return
    if (node.type === 'group' || node.type === 'studio') return
    seen.add(node.id)
    result.push(node)
  }

  for (const id of nodeIds) {
    const node = nodes.find((entry) => entry.id === id)
    if (!node) continue
    if (isGroupNode(node)) {
      for (const child of nodes.filter((entry) => entry.parentId === node.id)) {
        push(child)
      }
    } else {
      push(node)
    }
  }

  return result
}

/**
 * 多选 / 分镜组创建剪辑室：按选择顺序展开分组子节点，
 * 在包围盒右侧 80px 创建，并依次连线。
 */
export function createStudioFromNodes(
  nodeIds: string[],
  title?: string
): string | null {
  const state = useCanvasStore.getState()
  const materials = studioMaterials(state.nodes, nodeIds)
  if (materials.length === 0) return null

  const absolute = materials.map((node) => absolutePosition(node, state.nodes))
  const minY = Math.min(...absolute.map((item) => item.y))
  const maxRight = Math.max(
    ...materials.map((node, index) => absolute[index].x + nodeSize(node).width)
  )

  const studioId = state.addStudioNode(
    { x: maxRight + 80, y: minY },
    title
  )

  for (const node of materials) {
    useCanvasStore.getState().onConnect({ source: node.id, target: studioId })
  }

  return studioId
}

function nodeKindOfLibraryAsset(kind: LibraryAsset['kind']): 'image' | 'video' | 'audio' {
  if (kind === 'video') return 'video'
  if (kind === 'audio') return 'audio'
  return 'image'
}

/**
 * 把已导入资产库的素材写入画布：
 * 1. 探测尺寸/时长
 * 2. 按类型创建素材节点并成组
 * 3. 每个节点自动连到剪辑室
 */
export async function uploadAssetsToStudio(
  studioNodeId: string,
  assets: LibraryAsset[]
): Promise<number> {
  if (assets.length === 0) return 0

  const state = useCanvasStore.getState()
  const studio = state.nodes.find((node) => node.id === studioNodeId)
  if (!studio || !isStudioNode(studio)) return 0

  const absolute = absolutePosition(studio, state.nodes)
  const origin = { x: absolute.x - 520, y: absolute.y }
  const created: string[] = []

  for (const kind of ['image', 'video', 'audio'] as const) {
    const group = assets.filter(
      (asset) => nodeKindOfLibraryAsset(asset.kind) === kind
    )
    if (group.length === 0) continue

    const generated: GeneratedAsset[] = []
    for (const asset of group) {
      const probe = await window.api.media.probe(asset.path).catch(() => null)
      generated.push({
        id: asset.path,
        path: asset.path,
        kind,
        createdAt: asset.modifiedAt,
        model: '资产库',
        width: probe?.width,
        height: probe?.height,
        duration: probe?.duration,
        fps: probe?.fps,
        hasAudio: probe?.hasAudio
      })
    }

    const ids = useCanvasStore.getState().addAssetNodes(
      kind,
      origin,
      generated,
      '剪辑室素材',
      undefined,
      { columns: 2, cellWidth: 240, scope: 'global' }
    )
    ids.forEach((id, index) => {
      useCanvasStore
        .getState()
        .patchNodeData(id, { title: group[index]?.name ?? `剪辑室素材 ${index + 1}` })
    })
    created.push(...ids)
  }

  if (created.length > 0) {
    const groupCount = useCanvasStore
      .getState()
      .nodes.filter(isGroupNode).length
    useCanvasStore.getState().createGroupFromNodes(created, {
      title: `剪辑室素材 ${groupCount + 1}`,
      color: 'cyan',
      columns: 2,
      allowSingle: true
    })
  }

  for (const id of created) {
    useCanvasStore.getState().onConnect({ source: id, target: studioNodeId })
  }

  void useLibraryStore.getState().refresh()
  return created.length
}

export async function uploadToStudio(studioNodeId: string): Promise<number> {
  const assets = await window.api.library.importAssets('剪辑室素材')
  return uploadAssetsToStudio(studioNodeId, assets)
}

if (import.meta.env.DEV) {
  ;(
    window as unknown as {
      __uploadAssetsToStudio?: typeof uploadAssetsToStudio
    }
  ).__uploadAssetsToStudio = uploadAssetsToStudio
}

/**
 * 保存时间线后同步剪辑室摘要与成片状态：
 * - 时间线为空：成片标记 empty
 * - 成片已完成且时间线有改动：标记 stale
 */
export function syncStudioAfterSave(
  studioNodeId: string,
  doc: TimelineDoc,
  options: { markStale?: boolean } = {}
): void {
  const markStale = options.markStale ?? true
  const state = useCanvasStore.getState()
  const studio = state.nodes.find((node) => node.id === studioNodeId)
  if (!studio || !isStudioNode(studio)) return

  const clipCount = doc.clips.length

  state.patchStudioNode(studioNodeId, {
    status: clipCount > 0 ? 'done' : 'idle',
    clipCount,
    durationMs: docDurationMs(doc),
    references: referencesFromDoc(doc)
  })

  if (clipCount === 0) {
    // 时间线清空但已有成片时保留成片，只标记待更新
    state.setStudioFilmStatus(
      studioNodeId,
      (studio.data.outputs?.length ?? 0) > 0 ? 'stale' : 'empty'
    )
    return
  }

  const current = studio.data.filmStatus
  const hasOutput = (studio.data.outputs?.length ?? 0) > 0

  if (markStale) {
    if (current === 'ready' || current === 'rendering') {
      state.setStudioFilmStatus(studioNodeId, 'stale')
    } else if (current === 'empty' || current === 'missing' || !current) {
      state.setStudioFilmStatus(studioNodeId, 'pending')
    }
    return
  }

  // 只是打开/加载：不把已完成的成片标脏
  if (current === 'rendering') {
    state.setStudioFilmStatus(studioNodeId, hasOutput ? 'ready' : 'pending')
  } else if (current === 'empty' || current === 'missing' || !current) {
    state.setStudioFilmStatus(studioNodeId, 'pending')
  }
}
