interface EdgeLike {
  source: string
  target: string
}

interface NodeLike {
  id: string
  type?: string
  data: Record<string, unknown>
}

/**
 * 删除连线后清理下游节点对上游的引用：
 * 只有在没有任何剩余连线连接该上游时才清理。
 */
export function clearEdgeReferences<T extends NodeLike>(
  nodes: T[],
  remainingEdges: EdgeLike[],
  removedEdges: EdgeLike[]
): T[] {
  if (removedEdges.length === 0) return nodes

  const removedByTarget = new Map<string, Set<string>>()
  for (const edge of removedEdges) {
    const sources = removedByTarget.get(edge.target) ?? new Set<string>()
    sources.add(edge.source)
    removedByTarget.set(edge.target, sources)
  }

  const linkedByTarget = new Map<string, Set<string>>()
  for (const edge of remainingEdges) {
    const sources = linkedByTarget.get(edge.target) ?? new Set<string>()
    sources.add(edge.source)
    linkedByTarget.set(edge.target, sources)
  }

  return nodes.map((node) => {
    const removedSources = removedByTarget.get(node.id)
    if (!removedSources || removedSources.size === 0) return node

    const stillLinked = linkedByTarget.get(node.id) ?? new Set<string>()
    const gone = new Set(
      [...removedSources].filter((source) => !stillLinked.has(source))
    )
    if (gone.size === 0) return node

    const data = node.data

    if (
      node.type === 'cine' &&
      typeof data.sourceNodeId === 'string' &&
      gone.has(data.sourceNodeId)
    ) {
      return {
        ...node,
        data: {
          ...data,
          sourceNodeId: undefined,
          sourcePath: undefined,
          sourceScope: undefined,
          sourceName: undefined
        }
      }
    }

    if (
      node.type === 'video-op' &&
      typeof data.sourceNodeId === 'string' &&
      gone.has(data.sourceNodeId)
    ) {
      return {
        ...node,
        data: { ...data, sourceNodeId: '' }
      }
    }

    if (node.type === 'studio' && data.references) {
      const references = { ...(data.references as Record<string, string>) }
      let changed = false
      for (const source of gone) {
        if (source in references) {
          delete references[source]
          changed = true
        }
      }
      if (changed) {
        return { ...node, data: { ...data, references } }
      }
    }

    return node
  })
}
