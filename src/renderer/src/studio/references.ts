import type { TimelineDoc } from '@shared/timeline-schema'
import { nodeOutputs, type CanvasNode } from '../stores/canvas'
import type { ClipReferenceIssue } from '../stores/timeline'

export type ClipReferenceIssues = Record<string, ClipReferenceIssue>

/** 分析时间线片段的画布引用与文件存在性 */
export async function analyzeClipReferences(
  doc: TimelineDoc,
  nodes: CanvasNode[]
): Promise<ClipReferenceIssues> {
  const issues: ClipReferenceIssues = {}

  const entries = new Map<
    string,
    { path: string; scope: 'project' | 'global' }
  >()
  for (const clip of doc.clips) {
    if (!clip.media) continue
    const key = `${clip.media.scope}:${clip.media.path}`
    entries.set(key, { path: clip.media.path, scope: clip.media.scope })
  }

  const keys = [...entries.keys()]
  const results =
    keys.length > 0
      ? await window.api.media.existsMany([...entries.values()])
      : []
  const existsMap = new Map(keys.map((key, index) => [key, results[index]]))

  for (const clip of doc.clips) {
    if (!clip.media) continue
    const media = clip.media
    const issue: ClipReferenceIssue = {}

    if (media.nodeId) {
      const node = nodes.find((entry) => entry.id === media.nodeId)
      if (!node || (node.type !== 'cine' && node.type !== 'film')) {
        issue.missing = true
      } else {
        const outputs = nodeOutputs(node)
        const referenced = outputs.find(
          (output) => output.id === media.outputId
        )
        if (!referenced) {
          issue.missing = true
        } else {
          const latest = outputs[0]
          if (
            latest &&
            (latest.id !== referenced.id || latest.path !== referenced.path)
          ) {
            issue.updateAvailable = true
          }
        }
      }
    }

    if (!existsMap.get(`${media.scope}:${media.path}`)) {
      issue.missing = true
    }

    if (issue.missing || issue.updateAvailable) {
      issues[clip.id] = issue
    }
  }

  return issues
}

/** 时间线引用的画布节点 → outputId */
export function referencesFromDoc(doc: TimelineDoc): Record<string, string> {
  const references: Record<string, string> = {}
  for (const clip of doc.clips) {
    if (clip.media?.nodeId && clip.media.outputId) {
      references[clip.media.nodeId] = clip.media.outputId
    }
  }
  return references
}

/** 上游输出签名：节点当前最新 output 与引用 output 的组合 */
export function upstreamSignature(
  references: Record<string, string> | undefined,
  nodes: CanvasNode[]
): string {
  if (!references) return ''

  return Object.entries(references)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([nodeId, outputId]) => {
      const node = nodes.find((entry) => entry.id === nodeId)
      const latest =
        node && (node.type === 'cine' || node.type === 'film')
          ? nodeOutputs(node)[0]
          : undefined
      return `${nodeId}:${outputId}:${latest?.id ?? 'missing'}:${
        latest?.path ?? ''
      }`
    })
    .join('|')
}
