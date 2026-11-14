import type { XYPosition } from '@xyflow/react'
import { GROUP_GAP, GROUP_HEADER_HEIGHT, GROUP_PADDING, GROUP_RATIO_VALUE, STORYBOARD_CELL_WIDTH, STORYBOARD_GAP, STORYBOARD_MAX_NODES, TITLE_HEIGHT, type GroupRatio } from '@shared/canvas-schema'
import { commandTurns, isGroupNode, nodeSize, nextId, childrenOf, absolutePosition, contentBounds, defaultGroupSize, type GroupNode, type CanvasNode } from '../../canvas-model'

import type { StateCreator } from 'zustand'
import type { CanvasStore } from '../../canvas'

type GroupsSlice = Pick<CanvasStore, 'createGroupFromNodes' | 'groupSelection' | 'mergeSelection' | 'createStoryboard' | 'arrangeStoryboard' | 'setGroupMode' | 'setStoryboardGrid' | 'setStoryboardRatio' | 'toggleStoryboardIndex' | 'clearGroupChildren' | 'ungroup' | 'deleteGroupWithChildren' | 'renameGroup' | 'setGroupColor' | 'arrangeGroup' | 'detachNode' | 'syncGroupBounds'>

export const createGroupsSlice: StateCreator<
  CanvasStore,
  [],
  [],
  GroupsSlice
> = (set, get) => ({
createGroupFromNodes: (nodeIds, options) => {
    const all = get().nodes
    const wanted = new Set(nodeIds)
    const targets = all.filter(
      (node) => wanted.has(node.id) && !isGroupNode(node) && !node.parentId
    )
    if (targets.length < 2 && !options?.allowSingle) return null
    if (targets.length === 0) return null

    get().pushHistory()

    const columns = Math.max(
      1,
      Math.round(options?.columns ?? Math.ceil(Math.sqrt(targets.length)))
    )
    const sizes = new Map(targets.map((node) => [node.id, nodeSize(node)]))
    const columnWidths: number[] = []
    const rowHeights: number[] = []

    targets.forEach((node, index) => {
      const size = sizes.get(node.id) as { width: number; height: number }
      const column = index % columns
      const row = Math.floor(index / columns)
      columnWidths[column] = Math.max(columnWidths[column] ?? 0, size.width)
      rowHeights[row] = Math.max(rowHeights[row] ?? 0, size.height)
    })

    const contentWidth =
      columnWidths.reduce((sum, value) => sum + value, 0) +
      Math.max(0, columns - 1) * GROUP_GAP
    const contentHeight =
      rowHeights.reduce((sum, value) => sum + value, 0) +
      Math.max(0, rowHeights.length - 1) * GROUP_GAP

    const absolute = new Map(
      targets.map((node) => [node.id, absolutePosition(node, all)])
    )
    const minX = Math.min(...targets.map((node) => absolute.get(node.id)!.x))
    const minY = Math.min(...targets.map((node) => absolute.get(node.id)!.y))

    const groupId = nextId('group')
    const groupCount = all.filter(isGroupNode).length

    const positions = new Map<string, XYPosition>()
    let y = GROUP_HEADER_HEIGHT
    rowHeights.forEach((rowHeight, row) => {
      let x = GROUP_PADDING
      for (let column = 0; column < columns; column += 1) {
        const node = targets[row * columns + column]
        if (!node) break
        const size = sizes.get(node.id) as { width: number; height: number }
        positions.set(node.id, {
          x: x + (columnWidths[column] - size.width) / 2,
          y: y + (rowHeight - size.height) / 2
        })
        x += columnWidths[column] + GROUP_GAP
      }
      y += rowHeight + GROUP_GAP
    })

    const group: GroupNode = {
      id: groupId,
      type: 'group',
      position: {
        x: minX - GROUP_PADDING,
        y: minY - GROUP_HEADER_HEIGHT
      },
      data: {
        title: options?.title ?? `分组 ${groupCount + 1}`,
        color: options?.color ?? 'blue'
      },
      style: {
        width: contentWidth + GROUP_PADDING * 2,
        height: contentHeight + GROUP_HEADER_HEIGHT + GROUP_PADDING
      },
      selected: true,
      zIndex: 0
    }

    const ids = new Set(targets.map((node) => node.id))
    const nodes = all.map((node) => {
      if (ids.has(node.id)) {
        return {
          ...node,
          parentId: groupId,
          position: positions.get(node.id) ?? node.position,
          zIndex: 1,
          selected: false
        }
      }
      return { ...node, selected: false }
    })

    set({ nodes: [group, ...nodes] })
    return groupId
  },
groupSelection: (turnId) => {
    const all = get().nodes
    const selected = all.filter(
      (node) => node.selected && !isGroupNode(node) && !node.parentId
    )
    if (selected.length < 2) return null

    if (!turnId || !commandTurns.has(turnId)) {
      get().pushHistory()
      if (turnId) commandTurns.add(turnId)
    }

    const absolute = selected.map((node) => {
      const size = nodeSize(node)
      const position = absolutePosition(node, all)
      return { node, position, size }
    })

    const minX = Math.min(...absolute.map((item) => item.position.x))
    const minY = Math.min(...absolute.map((item) => item.position.y))
    const maxX = Math.max(
      ...absolute.map((item) => item.position.x + item.size.width)
    )
    const maxY = Math.max(
      ...absolute.map((item) => item.position.y + item.size.height)
    )

    const groupX = minX - GROUP_PADDING
    const groupY = minY - GROUP_HEADER_HEIGHT
    const groupWidth = maxX - minX + GROUP_PADDING * 2
    const groupHeight = maxY - minY + GROUP_HEADER_HEIGHT + GROUP_PADDING

    const groupCount = all.filter(isGroupNode).length
    const groupId = nextId('group')

    const group: GroupNode = {
      id: groupId,
      type: 'group',
      position: { x: groupX, y: groupY },
      data: { title: `分组 ${groupCount + 1}`, color: 'blue' },
      style: { width: groupWidth, height: groupHeight },
      selected: true,
      zIndex: 0
    }

    const ids = new Set(selected.map((node) => node.id))

    const nodes: CanvasNode[] = [
      group,
      ...all.map((node) => {
        if (ids.has(node.id)) {
          const absolute = absolutePosition(node, all)
          return {
            ...node,
            parentId: groupId,
            position: {
              x: absolute.x - groupX,
              y: absolute.y - groupY
            },
            zIndex: 1,
            selected: false
          }
        }
        return { ...node, selected: false }
      })
    ]

    set({ nodes })
    return groupId
  },
mergeSelection: () => {
    const all = get().nodes
    const selected = all.filter((node) => node.selected)
    const selectedGroups = selected.filter(isGroupNode)
    const looseNodes = selected.filter(
      (node) => !isGroupNode(node) && !node.parentId
    )
    if (selectedGroups.length + looseNodes.length < 2) return null

    get().pushHistory()

    const selectedGroupIds = new Set(selectedGroups.map((group) => group.id))
    const moving = all.filter(
      (node) =>
        (!isGroupNode(node) &&
          (selectedGroupIds.has(node.parentId ?? '') ||
            looseNodes.some((loose) => loose.id === node.id))) ||
        selectedGroupIds.has(node.id)
    )
    const contentNodes = moving.filter((node) => !isGroupNode(node))

    const absolute = contentNodes.map((node) => {
      const size = nodeSize(node)
      const position = absolutePosition(node, all)
      return { node, position, size }
    })

    if (absolute.length === 0) {
      const groupCount =
        all.filter(isGroupNode).length - selectedGroups.length
      const size = defaultGroupSize(groupCount)
      const groupId = nextId('group')
      const group: GroupNode = {
        id: groupId,
        type: 'group',
        position: { x: size.x, y: size.y },
        data: { title: `分组 ${groupCount + 1}`, color: 'blue' },
        style: { width: 320, height: 200 },
        selected: true,
        zIndex: 0
      }
      set({
        nodes: [
          group,
          ...all
            .filter((node) => !selectedGroupIds.has(node.id))
            .map((node) => ({ ...node, selected: false }))
        ]
      })
      return groupId
    }

    const minX = Math.min(...absolute.map((item) => item.position.x))
    const minY = Math.min(...absolute.map((item) => item.position.y))
    const maxX = Math.max(
      ...absolute.map((item) => item.position.x + item.size.width)
    )
    const maxY = Math.max(
      ...absolute.map((item) => item.position.y + item.size.height)
    )

    const groupCount =
      all.filter(isGroupNode).length - selectedGroups.length
    const groupId = nextId('group')
    const group: GroupNode = {
      id: groupId,
      type: 'group',
      position: {
        x: minX - GROUP_PADDING,
        y: minY - GROUP_HEADER_HEIGHT
      },
      data: { title: `分组 ${groupCount + 1}`, color: 'blue' },
      style: {
        width: maxX - minX + GROUP_PADDING * 2,
        height: maxY - minY + GROUP_HEADER_HEIGHT + GROUP_PADDING
      },
      selected: true,
      zIndex: 0
    }

    const movingIds = new Set(contentNodes.map((node) => node.id))

    const nodes: CanvasNode[] = [
      group,
      ...all
        .filter(
          (node) => !selectedGroupIds.has(node.id) && !isGroupNode(node)
        )
        .map((node) => {
          if (!movingIds.has(node.id)) return { ...node, selected: false }
          const absolute = absolutePosition(node, all)
          return {
            ...node,
            parentId: groupId,
            position: {
              x: absolute.x - group.position.x,
              y: absolute.y - group.position.y
            },
            zIndex: 1,
            selected: false
          }
        })
    ]

    set({ nodes })
    return groupId
  },
createStoryboard: () => {
    const all = get().nodes
    const selected = all.filter((node) => node.selected)
    const images = selected.filter(
      (node) =>
        !isGroupNode(node) && !node.parentId && node.data.kind === 'image'
    )

    if (
      selected.length !== images.length ||
      images.length < 2 ||
      images.length > STORYBOARD_MAX_NODES
    ) {
      return null
    }

    get().pushHistory()

    const ratio: GroupRatio = '16:9'
    const count = images.length
    const cols = count <= 3 ? count : Math.ceil(Math.sqrt(count))
    const rows = Math.ceil(count / cols)
    const cellHeight = Math.round(STORYBOARD_CELL_WIDTH / GROUP_RATIO_VALUE[ratio])
    const nodeHeight = cellHeight + TITLE_HEIGHT

    const minX = Math.min(...images.map((node) => node.position.x))
    const minY = Math.min(...images.map((node) => node.position.y))
    const groupX = minX - GROUP_PADDING
    const groupY = minY - GROUP_HEADER_HEIGHT

    const storyboardCount = all.filter(
      (node) => isGroupNode(node) && node.data.mode === 'storyboard'
    ).length
    const groupId = nextId('group')

    const group: GroupNode = {
      id: groupId,
      type: 'group',
      position: { x: groupX, y: groupY },
      data: {
        title: `分镜组 ${storyboardCount + 1}`,
        color: 'violet',
        mode: 'storyboard',
        ratio,
        gridCols: cols,
        gridRows: rows,
        showIndex: true
      },
      style: {
        width:
          GROUP_PADDING * 2 +
          cols * STORYBOARD_CELL_WIDTH +
          (cols - 1) * STORYBOARD_GAP,
        height:
          GROUP_HEADER_HEIGHT +
          GROUP_PADDING +
          rows * nodeHeight +
          (rows - 1) * STORYBOARD_GAP
      },
      selected: true,
      zIndex: 0
    }

    const order = new Map(images.map((node, index) => [node.id, index]))
    const ids = new Set(images.map((node) => node.id))

    const nodes: CanvasNode[] = [
      group,
      ...all
        .filter((node) => !ids.has(node.id))
        .map((node) => ({ ...node, selected: false })),
      ...images.map((node) => {
        const index = order.get(node.id) as number
        const col = index % cols
        const row = Math.floor(index / cols)
        return {
          ...node,
          parentId: groupId,
          position: {
            x: GROUP_PADDING + col * (STORYBOARD_CELL_WIDTH + STORYBOARD_GAP),
            y: GROUP_HEADER_HEIGHT + row * (nodeHeight + STORYBOARD_GAP)
          },
          style: {
            ...node.style,
            width: STORYBOARD_CELL_WIDTH,
            height: nodeHeight
          },
          zIndex: 1,
          selected: false
        }
      })
    ]

    set({ nodes })
    return groupId
  },
arrangeStoryboard: (groupId) => {
    const all = get().nodes
    const group = all.find((node) => node.id === groupId)
    if (!group || !isGroupNode(group)) return

    const children = childrenOf(all, groupId)
    if (children.length === 0) return

    const ratio = group.data.ratio ?? '16:9'
    const cols = Math.max(1, group.data.gridCols ?? 2)
    const rows = Math.max(1, group.data.gridRows ?? Math.ceil(children.length / cols))
    const cellHeight = Math.round(STORYBOARD_CELL_WIDTH / GROUP_RATIO_VALUE[ratio])
    const nodeHeight = cellHeight + TITLE_HEIGHT

    const positions = new Map<string, XYPosition>()
    children.forEach((child, index) => {
      const col = index % cols
      const row = Math.floor(index / cols)
      positions.set(child.id, {
        x: GROUP_PADDING + col * (STORYBOARD_CELL_WIDTH + STORYBOARD_GAP),
        y: GROUP_HEADER_HEIGHT + row * (nodeHeight + STORYBOARD_GAP)
      })
    })

    const nodes = all.map((node) => {
      if (node.id === groupId) {
        return {
          ...node,
          style: {
            ...node.style,
            width:
              GROUP_PADDING * 2 +
              cols * STORYBOARD_CELL_WIDTH +
              (cols - 1) * STORYBOARD_GAP,
            height:
              GROUP_HEADER_HEIGHT +
              GROUP_PADDING +
              rows * nodeHeight +
              (rows - 1) * STORYBOARD_GAP
          }
        }
      }

      const position = positions.get(node.id)
      if (!position) return node

      return {
        ...node,
        position,
        style: { ...node.style, width: STORYBOARD_CELL_WIDTH, height: nodeHeight }
      }
    })

    set({ nodes })
  },
setGroupMode: (groupId, mode) => {
    const all = get().nodes
    const group = all.find((node) => node.id === groupId)
    if (!group || !isGroupNode(group)) return

    get().pushHistory()

    set({
      nodes: all.map((node) =>
        node.id === groupId && isGroupNode(node)
          ? {
              ...node,
              data: {
                ...node.data,
                mode,
                ratio: node.data.ratio ?? '16:9',
                gridCols: node.data.gridCols ?? 2,
                gridRows:
                  node.data.gridRows ??
                  Math.ceil(
                    childrenOf(all, groupId).length /
                      Math.max(1, node.data.gridCols ?? 2)
                  ),
                showIndex: node.data.showIndex ?? true
              }
            }
          : node
      )
    })

    if (mode === 'storyboard') get().arrangeStoryboard(groupId)
  },
setStoryboardGrid: (groupId, cols, rows) => {
    const all = get().nodes
    const group = all.find((node) => node.id === groupId)
    if (!group || !isGroupNode(group)) return

    get().pushHistory()

    set({
      nodes: all.map((node) =>
        node.id === groupId && isGroupNode(node)
          ? {
              ...node,
              data: {
                ...node.data,
                gridCols: Math.min(10, Math.max(1, Math.round(cols))),
                gridRows: Math.min(10, Math.max(1, Math.round(rows)))
              }
            }
          : node
      )
    })

    get().arrangeStoryboard(groupId)
  },
setStoryboardRatio: (groupId, ratio) => {
    const all = get().nodes
    const group = all.find((node) => node.id === groupId)
    if (!group || !isGroupNode(group)) return

    get().pushHistory()

    set({
      nodes: all.map((node) =>
        node.id === groupId && isGroupNode(node)
          ? { ...node, data: { ...node.data, ratio } }
          : node
      )
    })

    get().arrangeStoryboard(groupId)
  },
toggleStoryboardIndex: (groupId) => {
    set({
      nodes: get().nodes.map((node) =>
        node.id === groupId && isGroupNode(node)
          ? {
              ...node,
              data: { ...node.data, showIndex: !node.data.showIndex }
            }
          : node
      )
    })
  },
clearGroupChildren: (groupId) => {
    const all = get().nodes
    const group = all.find((node) => node.id === groupId)
    if (!group || !isGroupNode(group)) return 0

    const removed = new Set(childrenOf(all, groupId).map((node) => node.id))
    if (removed.size === 0) return 0

    get().pushHistory()

    set({
      nodes: all.filter((node) => !removed.has(node.id)),
      edges: get().edges.filter(
        (edge) => !removed.has(edge.source) && !removed.has(edge.target)
      )
    })

    return removed.size
  },
ungroup: (groupId, turnId) => {
    const all = get().nodes
    const group = all.find((node) => node.id === groupId)
    if (!group || !isGroupNode(group)) return

    if (!turnId || !commandTurns.has(turnId)) {
      get().pushHistory()
      if (turnId) commandTurns.add(turnId)
    }

    const nodes: CanvasNode[] = all
      .filter((node) => node.id !== groupId)
      .map((node) => {
        if (node.parentId !== groupId) return node
        const { parentId: _removed, zIndex: _z, ...rest } = node
        return {
          ...rest,
          position: absolutePosition(node, all),
          selected: false
        }
      })

    set({ nodes })
  },
deleteGroupWithChildren: (groupId) => {
    const all = get().nodes
    const group = all.find((node) => node.id === groupId)
    if (!group || !isGroupNode(group)) return 0

    const removed = new Set<string>([groupId])
    for (const child of childrenOf(all, groupId)) removed.add(child.id)

    get().pushHistory()

    set({
      nodes: all.filter((node) => !removed.has(node.id)),
      edges: get().edges.filter(
        (edge) => !removed.has(edge.source) && !removed.has(edge.target)
      )
    })

    return removed.size
  },
renameGroup: (groupId, title) => {
    set({
      nodes: get().nodes.map((node) =>
        node.id === groupId && isGroupNode(node)
          ? {
              ...node,
              data: {
                ...node.data,
                title: title.trim() || node.data.title
              }
            }
          : node
      )
    })
  },
setGroupColor: (groupId, color) => {
    set({
      nodes: get().nodes.map((node) =>
        node.id === groupId && isGroupNode(node)
          ? { ...node, data: { ...node.data, color } }
          : node
      )
    })
  },
arrangeGroup: (groupId, mode) => {
    const all = get().nodes
    const group = all.find((node) => node.id === groupId)
    if (!group || !isGroupNode(group)) return

    const children = childrenOf(all, groupId)
    if (children.length === 0) return

    get().pushHistory()

    const sizes = new Map(
      children.map((child) => [child.id, nodeSize(child)])
    )

    const sorted = [...children].sort((a, b) => {
      if (mode === 'row') {
        if (a.position.y !== b.position.y) return a.position.y - b.position.y
        return a.position.x - b.position.x
      }
      if (a.position.x !== b.position.x) return a.position.x - b.position.x
      return a.position.y - b.position.y
    })

    const columns =
      mode === 'grid' ? Math.ceil(Math.sqrt(sorted.length)) : 1
    const rowHeights: number[] = []

    sorted.forEach((child, index) => {
      const row = Math.floor(index / columns)
      const size = sizes.get(child.id) as { width: number; height: number }
      rowHeights[row] = Math.max(rowHeights[row] ?? 0, size.height)
    })

    const positions = new Map<string, XYPosition>()
    if (mode === 'row') {
      let x = GROUP_PADDING
      const rowHeight = Math.max(
        ...sorted.map((child) => (sizes.get(child.id) as { height: number }).height)
      )
      for (const child of sorted) {
        const size = sizes.get(child.id) as { width: number; height: number }
        positions.set(child.id, { x, y: GROUP_HEADER_HEIGHT + (rowHeight - size.height) / 2 })
        x += size.width + GROUP_GAP
      }
    } else if (mode === 'column') {
      let y = GROUP_HEADER_HEIGHT
      for (const child of sorted) {
        const size = sizes.get(child.id) as { width: number; height: number }
        positions.set(child.id, { x: GROUP_PADDING, y })
        y += size.height + GROUP_GAP
      }
    } else {
      const columnWidths: number[] = []
      sorted.forEach((child, index) => {
        const column = index % columns
        const size = sizes.get(child.id) as { width: number; height: number }
        columnWidths[column] = Math.max(columnWidths[column] ?? 0, size.width)
      })

      let y = GROUP_HEADER_HEIGHT
      for (let row = 0; row < Math.ceil(sorted.length / columns); row += 1) {
        let x = GROUP_PADDING
        for (let column = 0; column < columns; column += 1) {
          const child = sorted[row * columns + column]
          if (!child) break
          const size = sizes.get(child.id) as { width: number; height: number }
          positions.set(child.id, {
            x,
            y: y + (rowHeights[row] - size.height) / 2
          })
          x += (columnWidths[column] ?? 0) + GROUP_GAP
        }
        y += (rowHeights[row] ?? 0) + GROUP_GAP
      }
    }

    const nodes = all.map((node) => {
      const position = positions.get(node.id)
      return position ? { ...node, position } : node
    })

    set({ nodes })
    get().syncGroupBounds(groupId)
  },
detachNode: (nodeId) => {
    const all = get().nodes
    const node = all.find((entry) => entry.id === nodeId)
    if (!node || !node.parentId) return

    const group = all.find((entry) => entry.id === node.parentId)
    if (!group || !isGroupNode(group)) return

    const size = nodeSize(node)
    const center = {
      x: node.position.x + size.width / 2,
      y: node.position.y + size.height / 2
    }
    const groupSize = nodeSize(group)
    const inside =
      center.x >= 0 &&
      center.y >= 0 &&
      center.x <= groupSize.width &&
      center.y <= groupSize.height

    if (inside) {
      get().syncGroupBounds(group.id)
      return
    }

    const absolute = absolutePosition(node, all)
    const { parentId: _removed, zIndex: _z, ...rest } = node

    set({
      nodes: all.map((entry) =>
        entry.id === nodeId
          ? { ...rest, position: absolute }
          : entry
      )
    })

    get().syncGroupBounds(group.id)
  },
syncGroupBounds: (groupId) => {
    const all = get().nodes
    const group = all.find((node) => node.id === groupId)
    if (!group || !isGroupNode(group)) return

    const children = childrenOf(all, groupId)
    if (children.length === 0) return

    const bounds = contentBounds(children, all)
    const nextX = bounds.x - GROUP_PADDING
    const nextY = bounds.y - GROUP_HEADER_HEIGHT
    const nextWidth = Math.max(bounds.width + GROUP_PADDING * 2, 120)
    const nextHeight = Math.max(
      bounds.height + GROUP_HEADER_HEIGHT + GROUP_PADDING,
      120
    )

    const moved = {
      ...group,
      position: { x: nextX, y: nextY },
      style: { ...group.style, width: nextWidth, height: nextHeight }
    }

    const delta = {
      x: group.position.x - nextX,
      y: group.position.y - nextY
    }

    const nodes = all.map((node) => {
      if (node.id === groupId) return moved
      if (node.parentId !== groupId) return node
      return {
        ...node,
        position: {
          x: node.position.x + delta.x,
          y: node.position.y + delta.y
        }
      }
    })

    set({ nodes })
  },
})
