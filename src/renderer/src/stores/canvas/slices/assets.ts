import { GROUP_GAP, GROUP_HEADER_HEIGHT, GROUP_PADDING, NODE_META, TITLE_HEIGHT, type OutputRef } from '@shared/canvas-schema'
import { isGroupNode, isStudioNode, isFilmNode, selectedNodeOutput, nextId, findFreeOrigin, absolutePosition, type CineNode, type GroupNode, type CineEdge } from '../../canvas-model'

import type { StateCreator } from 'zustand'
import type { CanvasStore } from '../../canvas'

type AssetsSlice = Pick<CanvasStore, 'setStudioFilmStatus' | 'applyStudioOutput' | 'detachStudioOutput' | 'addAssetNodes' | 'addPendingNodes' | 'convertFilmToMedia'>

export const createAssetsSlice: StateCreator<
  CanvasStore,
  [],
  [],
  AssetsSlice
> = (set, get) => ({
setStudioFilmStatus: (studioNodeId, filmStatus) => {
    const status =
      filmStatus === 'rendering'
        ? 'running'
        : filmStatus === 'ready'
          ? 'done'
          : 'idle'

    set({
      nodes: get().nodes.map((node) =>
        node.id === studioNodeId && isStudioNode(node)
          ? { ...node, data: { ...node.data, filmStatus, status } }
          : node
      )
    })
  },
applyStudioOutput: (studioNodeId, output) => {
    get().pushHistory()

    set({
      nodes: get().nodes.map((node) => {
        if (node.id !== studioNodeId || !isStudioNode(node)) return node
        const outputs = [output, ...(node.data.outputs ?? [])].slice(0, 20)
        return {
          ...node,
          data: {
            ...node.data,
            outputs,
            selectedOutputId: output.id,
            filmStatus: 'ready',
            status: 'done'
          }
        }
      })
    })
  },
detachStudioOutput: (studioNodeId) => {
    const state = get()
    const studio = state.nodes.find((node) => node.id === studioNodeId)
    if (!studio || !isStudioNode(studio)) return null

    const output = selectedNodeOutput(studio)
    if (!output) return null

    state.pushHistory()

    const meta = NODE_META.video
    const id = nextId('video')
    const node: CineNode = {
      id,
      type: 'cine',
      position: absolutePosition(studio, state.nodes),
      selected: true,
      data: {
        kind: 'video',
        title: `${studio.data.title} · 成片`,
        status: 'done',
        outputs: studio.data.outputs ?? [],
        selectedOutputId: output.id,
        templates: NODE_META.video.templates
      },
      style: {
        width: meta.width,
        height:
          output.width && output.height
            ? Math.round((meta.width * output.height) / output.width) +
              TITLE_HEIGHT
            : meta.height + TITLE_HEIGHT
      }
    }

    set({
      nodes: [
        ...get().nodes.map((entry) => ({ ...entry, selected: false })),
        node
      ]
    })

    return id
  },
addAssetNodes: (kind, origin, assets, titlePrefix, sourceNodeId, layout) => {
    if (assets.length === 0) return []

    get().pushHistory()

    const meta = NODE_META[kind]
    const gap = GROUP_GAP
    const columns = Math.max(1, Math.round(layout?.columns ?? 3))
    const width = Math.max(1, Math.round(layout?.cellWidth ?? meta.width))
    const heights = assets.map((asset) => {
      const ratio =
        asset.width && asset.height
          ? asset.height / asset.width
          : meta.height / meta.width
      return Math.round(width * ratio) + TITLE_HEIGHT
    })
    const rowHeights: number[] = []
    heights.forEach((height, index) => {
      const row = Math.floor(index / columns)
      rowHeights[row] = Math.max(rowHeights[row] ?? 0, height)
    })
    const rows = rowHeights.length
    const contentWidth = columns * width + (columns - 1) * gap
    const contentHeight =
      rowHeights.reduce((sum, height) => sum + height, 0) +
      Math.max(0, rows - 1) * gap
    const grouped = Boolean(layout?.groupTitle)
    const outerWidth = grouped ? contentWidth + GROUP_PADDING * 2 : contentWidth
    const outerHeight = grouped
      ? contentHeight + GROUP_HEADER_HEIGHT + GROUP_PADDING
      : contentHeight
    const start = findFreeOrigin(get().nodes, origin, outerWidth, outerHeight, gap)
    const ids: string[] = []
    const groupId = grouped ? nextId('group') : null
    const groupCount = get().nodes.filter(isGroupNode).length

    const created: CineNode[] = assets.map((asset, index) => {
      const id = nextId(kind)
      ids.push(id)

      const output: OutputRef = {
        id: asset.id,
        path: asset.path,
        scope: layout?.scope,
        kind: asset.kind,
        createdAt: asset.createdAt,
        model: asset.model,
        width: asset.width,
        height: asset.height,
        duration: asset.duration,
        fps: asset.fps,
        hasAudio: asset.hasAudio
      }

      const column = index % columns
      const row = Math.floor(index / columns)
      const rowOffset =
        rowHeights.slice(0, row).reduce((sum, height) => sum + height, 0) +
        row * gap
      const position = grouped
        ? {
            x: GROUP_PADDING + column * (width + gap),
            y: GROUP_HEADER_HEIGHT + rowOffset
          }
        : {
            x: start.x + column * (width + gap),
            y: start.y + rowOffset
          }

      return {
        id,
        type: 'cine',
        ...(groupId ? { parentId: groupId } : {}),
        position,
        selected: false,
        ...(groupId ? { zIndex: 1 } : {}),
        data: {
          kind,
          title: `${titlePrefix} ${index + 1}`,
          status: 'done',
          outputs: [output],
          selectedOutputId: output.id,
          templates: meta.templates
        },
        style: { width, height: heights[index] }
      }
    })

    const group: GroupNode | null =
      grouped && groupId
        ? {
            id: groupId,
            type: 'group',
            position: start,
            data: {
              title: layout?.groupTitle ?? `分组 ${groupCount + 1}`,
              color: layout?.groupColor ?? 'blue'
            },
            style: { width: outerWidth, height: outerHeight },
            selected: true,
            zIndex: 0
          }
        : null

    const createdEdges: CineEdge[] = sourceNodeId
      ? grouped && layout?.connectGroup && groupId
        ? [
            {
              id: nextId('edge'),
              source: sourceNodeId,
              target: groupId,
              type: 'flow',
              data: { role: 'auto' }
            }
          ]
        : created.map((node) => ({
            id: nextId('edge'),
            source: sourceNodeId,
            target: node.id,
            type: 'flow',
            data: { role: 'auto' }
          }))
      : []

    set({
      nodes: [
        ...(group
          ? get().nodes.map((node) => ({ ...node, selected: false }))
          : get().nodes),
        ...(group ? [group] : []),
        ...created
      ],
      edges: [...get().edges, ...createdEdges]
    })
    if (group) layout?.onGroupCreated?.(group.id)
    return ids
  },
addPendingNodes: (kind, origin, count, titlePrefix, sourceNodeId, layout) => {
    const total = Math.max(1, Math.round(count))
    get().pushHistory()

    const meta = NODE_META[kind]
    const gap = GROUP_GAP
    const columns = Math.max(1, Math.round(layout?.columns ?? 1))
    const width = Math.max(1, Math.round(layout?.cellWidth ?? meta.width))
    const height =
      Math.round(width * (meta.height / meta.width)) + TITLE_HEIGHT
    const rows = Math.ceil(total / columns)
    const contentWidth = columns * width + (columns - 1) * gap
    const contentHeight = rows * height + Math.max(0, rows - 1) * gap
    const grouped = Boolean(layout?.groupTitle)
    const outerWidth = grouped ? contentWidth + GROUP_PADDING * 2 : contentWidth
    const outerHeight = grouped
      ? contentHeight + GROUP_HEADER_HEIGHT + GROUP_PADDING
      : contentHeight
    const start = findFreeOrigin(
      get().nodes,
      origin,
      outerWidth,
      outerHeight,
      gap
    )
    const ids: string[] = []
    const groupId = grouped ? nextId('group') : null
    const groupCount = get().nodes.filter(isGroupNode).length

    const created: CineNode[] = Array.from({ length: total }, (_, index) => {
      const id = nextId(kind)
      ids.push(id)

      const column = index % columns
      const row = Math.floor(index / columns)
      const position = grouped
        ? {
            x: GROUP_PADDING + column * (width + gap),
            y: GROUP_HEADER_HEIGHT + row * (height + gap)
          }
        : {
            x: start.x + column * (width + gap),
            y: start.y + row * (height + gap)
          }

      return {
        id,
        type: 'cine',
        ...(groupId ? { parentId: groupId } : {}),
        position,
        selected: false,
        ...(groupId ? { zIndex: 1 } : {}),
        data: {
          kind,
          title: total > 1 ? `${titlePrefix} ${index + 1}` : titlePrefix,
          status: 'running',
          templates: meta.templates
        },
        style: { width, height }
      }
    })

    const group: GroupNode | null =
      grouped && groupId
        ? {
            id: groupId,
            type: 'group',
            position: start,
            data: {
              title: layout?.groupTitle ?? `分组 ${groupCount + 1}`,
              color: layout?.groupColor ?? 'blue'
            },
            style: { width: outerWidth, height: outerHeight },
            selected: true,
            zIndex: 0
          }
        : null

    const createdEdges: CineEdge[] = sourceNodeId
      ? created.map((node) => ({
          id: nextId('edge'),
          source: sourceNodeId,
          target: node.id,
          type: 'flow',
          data: { role: 'auto' }
        }))
      : []

    set({
      nodes: [
        ...(group
          ? get().nodes.map((node) => ({ ...node, selected: false }))
          : get().nodes),
        ...(group ? [group] : []),
        ...created
      ],
      edges: [...get().edges, ...createdEdges]
    })
    return ids
  },
convertFilmToMedia: (filmId, detach = false) => {
    const film = get().nodes.find((node) => node.id === filmId)
    if (!film || !isFilmNode(film)) return false

    get().pushHistory()

    const absolute = film.parentId
      ? absolutePosition(film, get().nodes)
      : film.position

    const media: CineNode = {
      id: film.id,
      type: 'cine',
      parentId: detach ? undefined : film.parentId,
      position: detach ? absolute : film.position,
      selected: film.selected,
      zIndex: detach ? undefined : film.zIndex,
      measured: film.measured,
      data: {
        kind: 'video',
        title: film.data.title,
        status: (film.data.outputs?.length ?? 0) > 0 ? 'done' : 'idle',
        outputs: film.data.outputs ?? [],
        selectedOutputId: film.data.selectedOutputId,
        templates: NODE_META.video.templates
      },
      style: film.style
    }

    set({
      nodes: get().nodes.map((node) => (node.id === filmId ? media : node))
    })

    return true
  },
})
