import {
  GROUP_COLORS,
  GROUP_GAP,
  GROUP_HEADER_HEIGHT,
  GROUP_PADDING,
  NODE_META,
  TITLE_HEIGHT,
  mediaFrameNodeSize,
  mediaFramePixels,
  type MediaFramePreset,
  type OutputRef
} from '@shared/canvas-schema'
import type { FilmStudy } from '@shared/film-study'
import { buildShotMarkdown, groupShotsByScene } from '../../../canvas/nodes/study-sheet'
import { isGroupNode, isStudioNode, isFilmNode, selectedNodeOutput, nextId, findFreeOrigin, absolutePosition, nodeSize, type CineNode, type GroupNode, type CineEdge } from '../../canvas-model'
import { resolveLayerGroup, attachTransform } from '../../../canvas/nodes/layer-compose'

import type { StateCreator } from 'zustand'
import type { CanvasStore } from '../../canvas'

type AssetsSlice = Pick<CanvasStore, 'setStudioFilmStatus' | 'applyStudioOutput' | 'detachStudioOutput' | 'addAssetNodes' | 'addShotNodes' | 'addPendingNodes' | 'convertFilmToMedia' | 'detachLayer' | 'attachLayer' | 'restoreDetachedLayer'>

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

    const id = nextId('video')
    const size = mediaFrameNodeSize(
      output.width,
      output.height,
      mediaFramePixels('standard')
    )
    const node: CineNode = {
      id,
      type: 'cine',
      position: absolutePosition(studio, state.nodes),
      selected: true,
      data: {
        kind: 'video',
        title: `${studio.data.title} · 成片`,
        status: 'done',
        mediaFrame: 'standard',
        outputs: studio.data.outputs ?? [],
        selectedOutputId: output.id,
        templates: NODE_META.video.templates
      },
      style: {
        width: size.width,
        height: size.height
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
addAssetNodes: (
    kind,
    origin,
    assets,
    titlePrefix,
    sourceNodeId,
    layout,
    assetOnly = false
  ) => {
    if (assets.length === 0) return []

    get().pushHistory()

    const meta = NODE_META[kind]
    const gap = GROUP_GAP
    const columns = Math.max(1, Math.round(layout?.columns ?? 3))
    const isMedia = kind === 'image' || kind === 'video'
    const mediaFrame: MediaFramePreset = layout?.cellWidth
      ? 'compact'
      : 'standard'
    const columnWidth = isMedia
      ? mediaFramePixels(mediaFrame)
      : kind === 'audio'
        ? NODE_META.audio.width
        : Math.max(1, Math.round(layout?.cellWidth ?? meta.width))
    const sizes = assets.map((asset) => {
      if (isMedia) {
        return mediaFrameNodeSize(
          asset.width,
          asset.height,
          columnWidth
        )
      }
      const ratio =
        asset.width && asset.height
          ? asset.height / asset.width
          : meta.height / meta.width
      return {
        width: columnWidth,
        height: Math.round(columnWidth * ratio) + TITLE_HEIGHT
      }
    })
    const heights = sizes.map((size) => size.height)
    const rowHeights: number[] = []
    heights.forEach((height, index) => {
      const row = Math.floor(index / columns)
      rowHeights[row] = Math.max(rowHeights[row] ?? 0, height)
    })
    const rows = rowHeights.length
    const contentWidth = columns * columnWidth + (columns - 1) * gap
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
      const size = sizes[index]
      const rowOffset =
        rowHeights.slice(0, row).reduce((sum, height) => sum + height, 0) +
        row * gap
      const position = grouped
        ? {
            x:
              GROUP_PADDING +
              column * (columnWidth + gap) +
              Math.round((columnWidth - size.width) / 2),
            y: GROUP_HEADER_HEIGHT + rowOffset
          }
        : {
            x:
              start.x +
              column * (columnWidth + gap) +
              Math.round((columnWidth - size.width) / 2),
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
          ...(isMedia ? { mediaFrame } : {}),
          ...(assetOnly ? { assetOnly: true } : {}),
          outputs: [output],
          selectedOutputId: output.id,
          templates: meta.templates
        },
        style: { width: size.width, height: size.height }
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
addShotNodes: (study, origin, sourceNodeId) => {
    const shots = study.shots ?? []
    if (shots.length === 0) return []

    get().pushHistory()

    const imageWidth = 240
    const textWidth = 320
    const cellHeight = Math.round(imageWidth * (9 / 16)) + TITLE_HEIGHT
    const gap = GROUP_GAP
    const groupWidth =
      GROUP_PADDING * 2 + imageWidth * 2 + textWidth + gap * 2
    const createdAt = new Date().toISOString()
    const groups = groupShotsByScene(shots, study.scenes)
    const createdNodes: Array<CineNode | GroupNode> = []
    const createdEdges: CineEdge[] = []
    const ids: string[] = []
    let cursorY = origin.y

    for (const [groupIndex, group] of groups.entries()) {
      const rows = group.shots.length
      const contentHeight =
        rows * cellHeight + Math.max(0, rows - 1) * gap
      const groupHeight =
        GROUP_HEADER_HEIGHT + GROUP_PADDING + contentHeight
      const start = findFreeOrigin(
        [...get().nodes, ...createdNodes],
        { x: origin.x, y: cursorY },
        groupWidth,
        groupHeight,
        gap
      )
      cursorY = start.y + groupHeight + gap

      const groupId = nextId('group')
      ids.push(groupId)
      createdNodes.push({
        id: groupId,
        type: 'group',
        position: start,
        data: {
          title: group.title,
          color: GROUP_COLORS[groupIndex % GROUP_COLORS.length]
        },
        style: { width: groupWidth, height: groupHeight },
        selected: false,
        zIndex: 0
      })

      group.shots.forEach((shot, row) => {
        const y = GROUP_HEADER_HEIGHT + row * (cellHeight + gap)
        const frames = [
          { path: shot.firstFrame, label: '首', x: GROUP_PADDING },
          {
            path: shot.lastFrame,
            label: '尾',
            x: GROUP_PADDING + imageWidth + gap
          }
        ]

        for (const frame of frames) {
          const output: OutputRef = {
            id: `${study.id}-${shot.index}-${frame.label}`,
            path: frame.path,
            scope: 'project',
            kind: 'image',
            createdAt,
            model: '逐帧拉片',
            width: 640,
            height: 360
          }
          const id = nextId('image')
          ids.push(id)
          createdNodes.push({
            id,
            type: 'cine',
            parentId: groupId,
            position: { x: frame.x, y },
            selected: false,
            zIndex: 1,
            data: {
              kind: 'image',
              title: `镜 ${String(shot.index).padStart(2, '0')} ${frame.label}`,
              status: 'done',
              mediaFrame: 'compact',
              assetOnly: true,
              outputs: [output],
              selectedOutputId: output.id,
              templates: NODE_META.image.templates,
              studyRef: {
                studyId: study.id,
                kind: 'shot',
                index: shot.index
              }
            },
            style: { width: imageWidth, height: cellHeight }
          })
        }

        const textId = nextId('text')
        ids.push(textId)
        createdNodes.push({
          id: textId,
          type: 'cine',
          parentId: groupId,
          position: {
            x: GROUP_PADDING + imageWidth * 2 + gap * 2,
            y
          },
          selected: false,
          zIndex: 1,
          data: {
            kind: 'text',
            title: `镜 ${String(shot.index).padStart(2, '0')} 详情`,
            status: 'done',
            assetOnly: true,
            text: buildShotMarkdown(shot, group.scene, study.cast ?? []),
            templates: NODE_META.text.templates,
            studyRef: {
              studyId: study.id,
              kind: 'shot-text',
              index: shot.index
            }
          },
          style: { width: textWidth, height: cellHeight }
        })
      })

      if (sourceNodeId) {
        createdEdges.push({
          id: nextId('edge'),
          source: sourceNodeId,
          target: groupId,
          type: 'flow',
          data: { role: 'auto' }
        })
      }
    }

    set({
      nodes: [...get().nodes, ...createdNodes],
      edges: [...get().edges, ...createdEdges]
    })
    return ids
  },
  addPendingNodes: (kind, origin, count, titlePrefix, sourceNodeId, layout) => {
    const total = Math.max(1, Math.round(count))
    get().pushHistory()

    const meta = NODE_META[kind]
    const gap = GROUP_GAP
    const columns = Math.max(1, Math.round(layout?.columns ?? 1))
    const isMedia = kind === 'image' || kind === 'video'
    const mediaFrame: MediaFramePreset = layout?.cellWidth
      ? 'compact'
      : 'standard'
    const columnWidth = isMedia
      ? mediaFramePixels(mediaFrame)
      : Math.max(1, Math.round(layout?.cellWidth ?? meta.width))
    const placeholder = isMedia
      ? mediaFrameNodeSize(undefined, undefined, columnWidth)
      : {
          width: columnWidth,
          height:
            Math.round(columnWidth * (meta.height / meta.width)) +
            TITLE_HEIGHT
        }
    const width = placeholder.width
    const height = placeholder.height
    const rows = Math.ceil(total / columns)
    const contentWidth = columns * columnWidth + (columns - 1) * gap
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
            x:
              GROUP_PADDING +
              column * (columnWidth + gap) +
              Math.round((columnWidth - width) / 2),
            y: GROUP_HEADER_HEIGHT + row * (height + gap)
          }
        : {
            x:
              start.x +
              column * (columnWidth + gap) +
              Math.round((columnWidth - width) / 2),
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
          ...(isMedia ? { mediaFrame } : {}),
          templates: meta.templates,
          // addPendingNodes 是操作/生成结果的占位 API：默认隐藏 PromptBar，
          // 只保留上方工具栏；需要创作入口时用 addNode 或显式 assetOnly:false。
          ...(layout?.assetOnly === false ? {} : { assetOnly: true })
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
  detachLayer: (nodeId, outputId, position, size, restoreTransform) => {
    const node = get().nodes.find((entry) => entry.id === nodeId)
    if (!node || node.type !== 'cine') return null
    const outputs = node.data.outputs ?? []
    const output = outputs.find((entry) => entry.id === outputId)
    if (!output || !output.layer || !output.layerGroupId) return null
    if (output.layerAttached === false) return null
    if (output.layer.zIndex <= 0) return null

    get().pushHistory()
    const detachedId = nextId('image')
    const detachedOutput: OutputRef = {
      ...output,
      id: `${detachedId}-layer`,
      createdAt: new Date().toISOString(),
      op: 'layer-detach',
      parentOutputId: output.id,
      detachedFrom: {
        nodeId,
        outputId,
        groupId: output.layerGroupId
      },
      layerGroupId: undefined,
      layerAttached: true,
      layerVisible: true,
      layerLocked: false
    }
    const title = output.layer.name?.trim() || `图层 ${output.layer.zIndex}`
    const detachedNode: CineNode = {
      id: detachedId,
      type: 'cine',
      position,
      selected: true,
      data: {
        kind: 'image',
        title,
        status: 'done',
        outputs: [detachedOutput],
        selectedOutputId: detachedOutput.id,
        templates: NODE_META.image.templates,
        assetOnly: true
      },
      style: { width: size.width, height: size.height + TITLE_HEIGHT }
    }

    set({
      nodes: [
        ...get().nodes.map((entry) => {
          if (entry.id !== nodeId || entry.type !== 'cine') {
            return entry.selected ? { ...entry, selected: false } : entry
          }
          return {
            ...entry,
            selected: false,
            data: {
              ...entry.data,
              outputs: (entry.data.outputs ?? []).map((candidate) =>
                candidate.id === outputId
                  ? {
                      ...candidate,
                      layerAttached: false,
                      ...(restoreTransform
                        ? { layerTransform: restoreTransform }
                        : {})
                    }
                  : candidate
              )
            }
          }
        }),
        detachedNode
      ]
    })
    return detachedId
  },
  attachLayer: (sourceNodeId, detachedNodeId) => {
    const sourceNode = get().nodes.find((entry) => entry.id === sourceNodeId)
    const detachedNode = get().nodes.find((entry) => entry.id === detachedNodeId)
    if (!sourceNode || sourceNode.type !== 'cine') return
    if (!detachedNode || detachedNode.type !== 'cine') return

    const detachedOutput =
      (detachedNode.data.outputs ?? []).find((entry) => entry.detachedFrom) ??
      selectedNodeOutput(detachedNode)
    if (!detachedOutput?.detachedFrom) return
    if (detachedOutput.detachedFrom.nodeId !== sourceNodeId) return

    if (get().edges.some((edge) => edge.source === detachedNodeId)) {
      throw new Error('该图层已连接下游，请先断开连线')
    }

    const sourceOutputs = sourceNode.data.outputs ?? []
    const sourceOutput = sourceOutputs.find(
      (entry) => entry.id === detachedOutput.detachedFrom?.outputId
    )
    if (!sourceOutput) throw new Error('源图层已不存在')
    if (sourceOutput.path !== detachedOutput.path) {
      throw new Error('该图片已被编辑，不能作为原图层放回')
    }

    const group = resolveLayerGroup(sourceOutputs, sourceOutput.id)
    if (!group) throw new Error('源图层组已不存在')

    const sourceSize = nodeSize(sourceNode)
    const selectedSourceOutput = sourceOutputs.find(
      (entry) => entry.id === sourceNode.data.selectedOutputId
    )
    const imageWidth = Math.max(1, sourceSize.width)
    const imageHeight = Math.max(
      1,
      sourceSize.height - TITLE_HEIGHT
    )
    const detachedSize = nodeSize(detachedNode)
    const detachedImageWidth = Math.max(1, detachedSize.width)
    const detachedImageHeight = Math.max(
      1,
      detachedSize.height - TITLE_HEIGHT
    )
    const transform = attachTransform({
      sourceRect: {
        x: sourceNode.position.x,
        y: sourceNode.position.y + TITLE_HEIGHT,
        width: imageWidth,
        height: imageHeight
      },
      detachedRect: {
        x: detachedNode.position.x,
        y: detachedNode.position.y + TITLE_HEIGHT,
        width: detachedImageWidth,
        height: detachedImageHeight
      },
      groupWidth: group.width,
      groupHeight: group.height
    })

    get().pushHistory()
    set({
      nodes: get()
        .nodes.filter((entry) => entry.id !== detachedNodeId)
        .map((entry) => {
          if (entry.id !== sourceNodeId || entry.type !== 'cine') {
            return { ...entry, selected: false }
          }
          return {
            ...entry,
            selected: true,
            data: {
              ...entry.data,
              selectedOutputId: sourceOutput.id,
              outputs: (entry.data.outputs ?? []).map((candidate) =>
                candidate.id === sourceOutput.id
                  ? {
                      ...candidate,
                      layerAttached: true,
                      layerTransform: {
                        ...transform,
                        ...(sourceOutput.layerTransform?.rotation !== undefined
                          ? {
                              rotation:
                                sourceOutput.layerTransform.rotation
                            }
                          : {}),
                        ...(sourceOutput.layerTransform?.flipX !== undefined
                          ? { flipX: sourceOutput.layerTransform.flipX }
                          : {}),
                        ...(sourceOutput.layerTransform?.flipY !== undefined
                          ? { flipY: sourceOutput.layerTransform.flipY }
                          : {})
                      }
                    }
                  : candidate
              )
            }
          }
        }),
      edges: get().edges.filter(
        (edge) => edge.source !== detachedNodeId && edge.target !== detachedNodeId
      )
    })
  },
  restoreDetachedLayer: (sourceNodeId, outputId) => {
    const sourceNode = get().nodes.find((entry) => entry.id === sourceNodeId)
    if (!sourceNode || sourceNode.type !== 'cine') return
    const sourceOutput = (sourceNode.data.outputs ?? []).find(
      (entry) => entry.id === outputId
    )
    if (!sourceOutput || sourceOutput.layerAttached !== false) return

    const detachedNode = get().nodes.find(
      (entry) =>
        entry.type === 'cine' &&
        (entry.data.outputs ?? []).some(
          (output) =>
            output.detachedFrom?.nodeId === sourceNodeId &&
            output.detachedFrom?.outputId === outputId
        )
    )

    if (detachedNode) {
      if (detachedNode.type !== 'cine') return
      if (get().edges.some((edge) => edge.source === detachedNode.id)) {
        throw new Error('该图层已连接下游，请先断开连线')
      }
      const detachedOutput = (detachedNode.data.outputs ?? []).find(
        (output) => output.detachedFrom?.outputId === outputId
      )
      if (detachedOutput && detachedOutput.path !== sourceOutput.path) {
        throw new Error('该图片已被编辑，不能作为原图层放回')
      }

      get().pushHistory()
      set({
        nodes: get()
          .nodes.filter((entry) => entry.id !== detachedNode.id)
          .map((entry) => {
            if (entry.id !== sourceNodeId || entry.type !== 'cine') {
              return entry
            }
            return {
              ...entry,
              selected: true,
              data: {
                ...entry.data,
                selectedOutputId: outputId,
                outputs: (entry.data.outputs ?? []).map((candidate) =>
                  candidate.id === outputId
                    ? { ...candidate, layerAttached: true }
                    : candidate
                )
              }
            }
          }),
        edges: get().edges.filter(
          (edge) =>
            edge.source !== detachedNode.id && edge.target !== detachedNode.id
        )
      })
      return
    }

    get().pushHistory()
    set({
      nodes: get().nodes.map((entry) => {
        if (entry.id !== sourceNodeId || entry.type !== 'cine') return entry
        return {
          ...entry,
          selected: true,
          data: {
            ...entry.data,
            selectedOutputId: outputId,
            outputs: (entry.data.outputs ?? []).map((candidate) =>
              candidate.id === outputId
                ? { ...candidate, layerAttached: true }
                : candidate
            )
          }
        }
      })
    })
  },
})
