import type { XYPosition } from '@xyflow/react'
import { NODE_META, TITLE_HEIGHT, type OutputRef } from '@shared/canvas-schema'
import type { LibraryMaterial } from '@shared/library-schema'
import { useCanvasStore } from '../stores/canvas'
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

function materialOutput(material: LibraryMaterial): OutputRef {
  return {
    id: material.id,
    path: material.path,
    kind: material.kind,
    createdAt: material.createdAt,
    model: '上传'
  }
}

export async function uploadMaterialsAt(flow: XYPosition): Promise<number> {
  const materials = await window.api.library.importMaterials()
  if (materials.length === 0) return 0

  void useLibraryStore.getState().load()

  const store = useCanvasStore.getState()
  let offsetY = 0

  for (const material of materials) {
    const meta = NODE_META[material.kind]
    const id = store.addNode(material.kind, {
      x: flow.x,
      y: flow.y + offsetY
    })

    store.patchNodeData(id, {
      title: material.name,
      status: 'done',
      outputs: [materialOutput(material)],
      selectedOutputId: material.id
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

export async function pasteAt(position?: XYPosition): Promise<number> {
  const store = useCanvasStore.getState()
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
