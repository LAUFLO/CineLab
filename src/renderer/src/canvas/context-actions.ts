import type { XYPosition } from '@xyflow/react'
import {
  NODE_META,
  TITLE_HEIGHT,
  type NodeKind,
  type OutputRef
} from '@shared/canvas-schema'
import type { LibraryAsset } from '@shared/library-schema'
import { useCanvasStore, isGroupNode, isStudioNode } from '../stores/canvas'
import { useLibraryStore } from '../stores/library'
import { useUIStore } from '../stores/ui'

function toast(message: string, tone: 'info' | 'error' = 'info'): void {
  useUIStore.getState().showToast(message, tone)
}

function viewportCenter(): XYPosition {
  const { viewport } = useCanvasStore.getState()
  return {
    x: (window.innerWidth / 2 - viewport.x) / viewport.zoom,
    y: (window.innerHeight / 2 - viewport.y) / viewport.zoom
  }
}

function materialOutput(material: LibraryAsset): OutputRef {
  return {
    id: material.path,
    path: material.path,
    scope: 'global',
    kind: material.kind === 'template' ? 'image' : material.kind,
    createdAt: material.modifiedAt,
    model: '资产库'
  }
}

export async function uploadMaterialsAt(flow: XYPosition): Promise<number> {
  const materials = await window.api.library.importAssets('场景')
  if (materials.length === 0) return 0

  void useLibraryStore.getState().refresh()

  const store = useCanvasStore.getState()
  let offsetY = 0

  for (const material of materials) {
    const kind: NodeKind =
      material.kind === 'video'
        ? 'video'
        : material.kind === 'audio'
          ? 'audio'
          : 'image'
    const meta = NODE_META[kind]
    const id = store.addNode(kind, {
      x: flow.x,
      y: flow.y + offsetY
    })

    store.patchNodeData(id, {
      title: material.name,
      status: 'done',
      outputs: [materialOutput(material)],
      selectedOutputId: material.path
    })

    offsetY += meta.height + TITLE_HEIGHT + 24
  }

  toast(`已上传 ${materials.length} 个素材`)
  return materials.length
}

export function copySelection(): number {
  const count = useCanvasStore.getState().copySelection()
  if (count === 0) {
    toast('请先选中节点', 'error')
    return 0
  }

  toast(`已复制 ${count} 个节点`)
  return count
}

async function copyStudioTimelines(
  nodes: { id: string; type: string; data: unknown }[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  for (const node of nodes) {
    if (node.type !== 'studio') continue
    const timelineId = (node.data as { timelineId?: string }).timelineId
    if (!timelineId) continue
    map.set(node.id, await window.api.timeline.duplicate(timelineId))
  }
  return map
}

/** 创建副本：剪辑室深拷贝时间线，成片不复制 */
export async function duplicateSelectionDeep(): Promise<number> {
  const store = useCanvasStore.getState()
  const selected = store.nodes.filter((node) => node.selected)
  const ids = new Set(selected.map((node) => node.id))
  for (const group of selected.filter(isGroupNode)) {
    for (const child of store.nodes.filter(
      (node) => node.parentId === group.id
    )) {
      ids.add(child.id)
    }
  }
  const studios = store.nodes.filter(
    (node) => ids.has(node.id) && isStudioNode(node)
  )
  const studioTimelines = await copyStudioTimelines(studios)
  return store.duplicateSelection(studioTimelines)
}

export async function pasteAt(position?: XYPosition): Promise<number> {
  const store = useCanvasStore.getState()
  const clipboard = store.clipboard

  if (clipboard && clipboard.nodes.some((node) => node.type === 'studio')) {
    try {
      const studioTimelines = await copyStudioTimelines(clipboard.nodes)
      const count = store.pasteNodes(position, studioTimelines)
      if (count > 0) {
        toast(`已粘贴 ${count} 个节点`)
        return count
      }
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error), 'error')
      return 0
    }
  }

  const count = store.pasteNodes(position)
  if (count > 0) {
    toast(`已粘贴 ${count} 个节点`)
    return count
  }

  try {
    const content = await window.api.clipboard.read()
    if (!content) {
      toast('剪贴板为空', 'error')
      return 0
    }

    if (content.kind === 'text') {
      const target = position ?? viewportCenter()
      const id = store.addNode('text', target)
      store.patchNodeData(id, { status: 'done', text: content.text })
      toast('已粘贴文本')
      return 1
    }

    const asset = content.asset
    const center = position ?? viewportCenter()
    const width = NODE_META.image.width
    const id = store.addNode('image', {
      x: center.x - width / 2,
      y: center.y - NODE_META.image.height / 2
    })

    store.patchNodeData(id, {
      status: 'done',
      outputs: [
        {
          id: asset.id,
          path: asset.path,
          kind: asset.kind,
          createdAt: asset.createdAt,
          model: asset.model,
          width: asset.width,
          height: asset.height
        }
      ],
      selectedOutputId: asset.id
    })

    if (asset.width && asset.height) {
      const nextHeight = Math.round((width * asset.height) / asset.width)
      store.resizeNode(id, nextHeight + TITLE_HEIGHT)
    }

    toast('已粘贴图片')
    return 1
  } catch (error) {
    toast(error instanceof Error ? error.message : String(error), 'error')
    return 0
  }
}
