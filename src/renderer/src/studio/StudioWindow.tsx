import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { createTimeline, type TimelineDoc } from '@shared/timeline-schema'
import { useProjectStore } from '../stores/project'
import { useStudioStore } from '../stores/studio'
import { useTimelineStore } from '../stores/timeline'
import { useUIStore } from '../stores/ui'
import { isFilmNode, isStudioNode, useCanvasStore } from '../stores/canvas'
import { clearLegacyTimeline, loadTimeline } from './persist'
import { createStudioAtViewportCenter, syncStudioAfterSave } from './nodes'
import {
  analyzeClipReferences,
  referencesFromDoc,
  upstreamSignature
} from './references'
import { InspectorPane } from './InspectorPane'
import { MaterialPool } from './MaterialPool'
import { PreviewPane } from './PreviewPane'
import { StudioTopBar } from './StudioTopBar'
import { TimelinePane } from './TimelinePane'

export function StudioWindow() {
  const open = useStudioStore((state) => state.open)
  const nodeId = useStudioStore((state) => state.nodeId)
  const close = useStudioStore((state) => state.closeStudio)
  const openStudio = useStudioStore((state) => state.openStudio)
  const leftOpen = useStudioStore((state) => state.leftOpen)
  const rightOpen = useStudioStore((state) => state.rightOpen)
  const timelineRatio = useStudioStore((state) => state.timelineRatio)
  const projectPath = useProjectStore((state) => state.path)
  const doc = useTimelineStore((state) => state.doc)
  const canvasNodes = useCanvasStore((state) => state.nodes)
  const skipNextSaveRef = useRef<string | null>(null)
  const dirtyRef = useRef(false)
  const previousRef = useRef<{
    timelineId: string | null
    nodeId: string | null
    doc: TimelineDoc | null
  }>({ timelineId: null, nodeId: null, doc: null })

  const studioNode = useCanvasStore((state) =>
    nodeId ? state.nodes.find((node) => node.id === nodeId) : undefined
  )
  const timelineId =
    studioNode && isStudioNode(studioNode)
      ? studioNode.data.timelineId
      : null

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'e') {
        event.preventDefault()
        const selected = useCanvasStore
          .getState()
          .nodes.find((node) => node.selected && isStudioNode(node))
        openStudio(selected?.id)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [openStudio])

  // 没有绑定节点或绑定节点已删除时：优先打开选中的/已有剪辑室，否则新建
  useEffect(() => {
    if (!open) return
    const state = useCanvasStore.getState()
    if (
      nodeId &&
      state.nodes.some((node) => node.id === nodeId && isStudioNode(node))
    ) {
      return
    }
    const selected = state.nodes.find(
      (node) => node.selected && isStudioNode(node)
    )
    if (selected) {
      openStudio(selected.id)
      return
    }
    const existing = state.nodes.find(isStudioNode)
    if (existing) {
      openStudio(existing.id)
      return
    }
    openStudio(createStudioAtViewportCenter())
  }, [open, nodeId, openStudio])

  // 按 timelineId 从项目文件加载；首次打开旧数据时迁移 localStorage
  useEffect(() => {
    if (!open || !timelineId) return
    let cancelled = false

    const run = async (): Promise<void> => {
      try {
        const stored = await window.api.timeline.load(timelineId)
        if (cancelled) return

        let next = stored
        if (!next) {
          const legacy = projectPath ? loadTimeline(projectPath) : null
          const current = useCanvasStore
            .getState()
            .nodes.find((node) => node.id === nodeId)
          const name =
            current && isStudioNode(current) ? current.data.title : '未命名时间线'
          next =
            legacy ??
            createTimeline({
              id: timelineId,
              name
            })
          await window.api.timeline.save(timelineId, next)
          if (legacy) clearLegacyTimeline(projectPath)
          if (cancelled) return
        }

        useTimelineStore.getState().load(next)
        skipNextSaveRef.current = timelineId
        dirtyRef.current = false
        if (nodeId) syncStudioAfterSave(nodeId, next, { markStale: false })
      } catch (error) {
        if (!cancelled) {
          useUIStore
            .getState()
            .showToast(
              error instanceof Error ? error.message : String(error),
              'error'
            )
        }
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [open, timelineId, projectPath, nodeId])

  // 切换剪辑室时，先把上一个时间线的未保存修改落盘
  useEffect(() => {
    const previous = previousRef.current
    if (
      previous.timelineId &&
      previous.nodeId &&
      previous.timelineId !== timelineId &&
      previous.doc &&
      dirtyRef.current
    ) {
      dirtyRef.current = false
      void window.api.timeline
        .save(previous.timelineId, previous.doc)
        .then(() =>
          syncStudioAfterSave(previous.nodeId as string, previous.doc as TimelineDoc)
        )
        .catch(() => undefined)
    }
    previousRef.current = { timelineId, nodeId, doc }
  }, [timelineId, nodeId, doc])

  // 保存时间线文件，并同步剪辑室摘要与成片状态
  useEffect(() => {
    if (!open || !doc || !timelineId || !nodeId) return
    if (skipNextSaveRef.current === timelineId) {
      skipNextSaveRef.current = null
      return
    }

    dirtyRef.current = true
    const timer = window.setTimeout(() => {
      void window.api.timeline
        .save(timelineId, doc)
        .then(() => {
          dirtyRef.current = false
          syncStudioAfterSave(nodeId, doc)
        })
        .catch(() => undefined)
    }, 400)

    return () => window.clearTimeout(timer)
  }, [doc, timelineId, open, nodeId])

  // 分析片段引用：文件缺失 / 上游新版本，并据此更新成片状态
  useEffect(() => {
    if (!open || !doc || !nodeId) return
    let cancelled = false

    const timer = window.setTimeout(() => {
      void analyzeClipReferences(doc, canvasNodes)
        .then((issues) => {
          if (cancelled) return
          useTimelineStore.getState().setReferenceIssues(issues)

          const state = useCanvasStore.getState()
          const studio = state.nodes.find((node) => node.id === nodeId)
          if (!studio || !isStudioNode(studio) || !studio.data.filmNodeId) {
            return
          }
          const film = state.nodes.find(
            (node) => node.id === studio.data.filmNodeId
          )
          if (!film || !isFilmNode(film) || film.data.filmStatus !== 'ready') {
            return
          }

          const signature = upstreamSignature(
            referencesFromDoc(doc),
            state.nodes
          )
          const hasUpdates = Object.values(issues).some(
            (issue) => issue.updateAvailable
          )
          const shouldStale = film.data.upstreamAck
            ? film.data.upstreamAck !== signature
            : hasUpdates

          if (shouldStale) state.setFilmStatus(film.id, 'stale')
        })
        .catch(() => undefined)
    }, 300)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [open, doc, nodeId, canvasNodes])

  // 关闭时补一次保存，避免 400ms 防抖内的修改丢失
  useEffect(() => {
    if (open) return
    if (!dirtyRef.current) return
    const current = useTimelineStore.getState().doc
    if (!current || !timelineId || !nodeId) return
    void window.api.timeline
      .save(timelineId, current)
      .then(() => {
        dirtyRef.current = false
        syncStudioAfterSave(nodeId, current)
      })
      .catch(() => undefined)
  }, [open, timelineId, nodeId])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        close()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, close])

  if (!open) return null

  return createPortal(
    <div className="studio-overlay" role="dialog" aria-label="剪辑室" data-scope="studio">
      <div
        className="studio-window"
        data-left-open={leftOpen}
        data-right-open={rightOpen}
        style={{
          gridTemplateRows: `48px minmax(0, 1fr) ${Math.round(timelineRatio * 100)}%`
        }}
      >
        <StudioTopBar />
        {leftOpen ? <MaterialPool /> : null}
        <PreviewPane />
        {rightOpen ? <InspectorPane /> : null}
        <TimelinePane />
      </div>
    </div>,
    document.body
  )
}
