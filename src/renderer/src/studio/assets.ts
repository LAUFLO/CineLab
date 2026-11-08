import type { LibraryAsset } from '@shared/library-schema'
import { createClip, type TimelineClip } from '@shared/timeline-schema'
import {
  isGroupNode,
  nodeOutputs,
  selectedNodeOutput,
  type CanvasNode
} from '../stores/canvas'

export interface PoolAsset {
  id: string
  name: string
  kind: 'video' | 'image' | 'audio'
  durationMs: number
  path: string
  scope: 'project' | 'global'
  /** 来自画布节点时记录来源，用于上游更新检测 */
  nodeId?: string
  outputId?: string
}

/** 画布上所有已生成且可用于剪辑的节点输出 */
export function poolFromNodes(nodes: CanvasNode[]): PoolAsset[] {
  const list: PoolAsset[] = []
  for (const node of nodes) {
    if (isGroupNode(node)) continue
    if (node.type !== 'cine' && node.type !== 'film') continue
    const outputs = nodeOutputs(node)
    if (outputs.length === 0) continue
    const current = selectedNodeOutput(node)
    if (!current) continue
    if (current.kind !== 'video' && current.kind !== 'image' && current.kind !== 'audio') {
      continue
    }
    list.push({
      id: `node:${node.id}:${current.id}`,
      name: node.data.title || '未命名素材',
      kind: current.kind,
      durationMs: current.duration ? Math.round(current.duration * 1000) : 5000,
      path: current.path,
      scope: current.scope ?? 'project',
      nodeId: node.id,
      outputId: current.id
    })
  }
  return list
}

/** 全局资产库条目转成可拖入时间线的素材 */
export function poolFromLibrary(assets: LibraryAsset[]): PoolAsset[] {
  const list: PoolAsset[] = []
  for (const asset of assets) {
    if (asset.kind === 'template') continue
    list.push({
      id: `lib:${asset.path}`,
      name: asset.name,
      kind: asset.kind,
      durationMs: asset.kind === 'image' ? 5000 : 10_000,
      path: asset.path,
      scope: 'global'
    })
  }
  return list
}

export function assetToClip(
  asset: PoolAsset,
  trackId: string,
  startMs: number
): TimelineClip {
  return createClip({
    trackId,
    kind: asset.kind,
    name: asset.name,
    startMs,
    durationMs: asset.durationMs,
    media: {
      scope: asset.scope,
      path: asset.path,
      kind: asset.kind,
      nodeId: asset.nodeId,
      outputId: asset.outputId
    }
  })
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}
