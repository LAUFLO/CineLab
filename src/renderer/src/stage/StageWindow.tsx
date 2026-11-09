import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { StageObjectType } from '@shared/stage-schema'
import { Icon } from '../components/Icon'
import {
  isStageNode,
  nodeSize,
  useCanvasStore
} from '../stores/canvas'
import { useUIStore } from '../stores/ui'
import { StageInspector } from './StageInspector'
import { StageTimeline } from './StageTimeline'
import { StageViewport } from './StageViewport'
import { useStageStore } from './stageStore'
import '../styles/stage.css'

const OBJECT_OPTIONS: Array<{ type: StageObjectType; label: string }> = [
  { type: 'human', label: '人物' },
  { type: 'box', label: '立方体' },
  { type: 'sphere', label: '球体' },
  { type: 'plane', label: '平面' },
  { type: 'crowd', label: '群众' }
]

const TRANSFORM_OPTIONS = [
  { mode: 'translate' as const, label: '移动' },
  { mode: 'rotate' as const, label: '旋转' },
  { mode: 'scale' as const, label: '缩放' }
]

export function StageWindow() {
  const open = useStageStore((state) => state.open)
  const nodeId = useStageStore((state) => state.nodeId)
  const doc = useStageStore((state) => state.doc)
  const viewMode = useStageStore((state) => state.viewMode)
  const selectedCameraId = useStageStore((state) => state.selectedCameraId)
  const selectedObjectId = useStageStore((state) => state.selectedObjectId)
  const selectedShotId = useStageStore((state) => state.selectedShotId)
  const transformMode = useStageStore((state) => state.transformMode)
  const playing = useStageStore((state) => state.playing)
  const loading = useStageStore((state) => state.loading)
  const saving = useStageStore((state) => state.saving)
  const dirty = useStageStore((state) => state.dirty)
  const error = useStageStore((state) => state.error)
  const closeStage = useStageStore((state) => state.closeStage)
  const setViewMode = useStageStore((state) => state.setViewMode)
  const selectObject = useStageStore((state) => state.selectObject)
  const selectCamera = useStageStore((state) => state.selectCamera)
  const selectShot = useStageStore((state) => state.selectShot)
  const undo = useStageStore((state) => state.undo)
  const redo = useStageStore((state) => state.redo)
  const clearError = useStageStore((state) => state.clearError)
  const capture = useStageStore((state) => state.capture)
  const addObject = useStageStore((state) => state.addObject)
  const addCamera = useStageStore((state) => state.addCamera)
  const setTransformMode = useStageStore((state) => state.setTransformMode)

  const [capturing, setCapturing] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState(0)
  const [addObjectOpen, setAddObjectOpen] = useState(false)

  useEffect(() => {
    if (!playing) return
    let last = performance.now()
    let raf = 0

    const tick = (now: number): void => {
      const state = useStageStore.getState()
      const shot = state.doc?.shots.find(
        (item) => item.id === state.selectedShotId
      )
      if (!shot) {
        state.pause()
        return
      }

      const next = state.playbackMs + (now - last)
      last = now
      if (next >= shot.durationMs) {
        state.seek(shot.durationMs)
        state.pause()
        return
      }
      state.seek(next)
      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing])

  useEffect(() => {
    if (!open || !doc || !dirty) return
    const snapshot = doc
    const timer = window.setTimeout(() => {
      useStageStore.setState({ saving: true })
      void window.api.stage
        .save(snapshot)
        .then(() => {
          const current = useStageStore.getState()
          useStageStore.setState({
            saving: false,
            ...(current.doc === snapshot ? { dirty: false } : {})
          })
        })
        .catch((saveError: unknown) => {
          useStageStore.setState({
            saving: false,
            error:
              saveError instanceof Error ? saveError.message : '保存场景失败'
          })
        })
    }, 500)
    return () => window.clearTimeout(timer)
  }, [open, doc, dirty])

  useEffect(() => {
    return window.api.stage.onExportProgress((progress) => {
      const current = useStageStore.getState()
      if (current.doc?.stageId !== progress.stageId) return
      setExportProgress(
        progress.total > 0 ? progress.frame / progress.total : 0
      )
    })
  }, [])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target
      if (
        target instanceof Element &&
        target.closest('input, textarea, [contenteditable="true"]')
      ) {
        return
      }

      if (event.key === 'Escape') {
        event.preventDefault()
        closeStage()
        return
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) redo()
        else undo()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, closeStage, redo, undo])

  if (!open) return null

  const activeCameraId = selectedCameraId ?? doc?.activeCameraId ?? null
  const activeCamera = doc?.cameras.find((camera) => camera.id === activeCameraId)

  const handleExportPreview = async (): Promise<void> => {
    if (exporting) return
    const state = useStageStore.getState()
    if (!state.doc || !state.selectedShotId || !state.nodeId) {
      useStageStore.setState({ error: '请先选择一个镜头' })
      return
    }

    const stageNode = useCanvasStore
      .getState()
      .nodes.find((node) => node.id === state.nodeId)
    if (!stageNode || !isStageNode(stageNode)) return

    setExporting(true)
    setExportProgress(0)
    try {
      const result = await window.api.stage.exportPreview({
        stageId: state.doc.stageId,
        shotId: state.selectedShotId,
        resolution: '720p',
        fps: 24
      })

      const size = nodeSize(stageNode)
      const ids = useCanvasStore.getState().addAssetNodes(
        'video',
        {
          x: stageNode.position.x + size.width + 80,
          y: stageNode.position.y + size.height + 40
        },
        [result.asset],
        '白模预演',
        stageNode.id
      )
      useUIStore
        .getState()
        .showToast(
          ids.length > 0
            ? '白模预演已导出并添加到画布'
            : '白模预演已导出'
        )
    } catch (exportError) {
      useStageStore.setState({
        error:
          exportError instanceof Error
            ? exportError.message
            : '导出白模预演失败'
      })
    } finally {
      setExporting(false)
    }
  }

  const handleCapture = async (): Promise<void> => {
    if (capturing) return
    const dataUrl = capture()
    if (!dataUrl) {
      useStageStore.setState({ error: '当前视口还没有准备好' })
      return
    }

    const state = useStageStore.getState()
    if (!state.doc || !state.nodeId) return
    const canvas = useCanvasStore.getState()
    const stageNode = canvas.nodes.find((node) => node.id === state.nodeId)
    if (!stageNode || !isStageNode(stageNode)) return

    setCapturing(true)
    try {
      const asset = await window.api.stage.capture({
        stageId: state.doc.stageId,
        dataUrl
      })
      const size = nodeSize(stageNode)
      const ids = canvas.addAssetNodes(
        'image',
        {
          x: stageNode.position.x + size.width + 80,
          y: stageNode.position.y
        },
        [asset],
        '导演台截图',
        stageNode.id
      )
      useUIStore
        .getState()
        .showToast(ids.length > 0 ? '截图已添加到画布' : '截图已保存')
    } catch (captureError) {
      useStageStore.setState({
        error:
          captureError instanceof Error ? captureError.message : '截图失败'
      })
    } finally {
      setCapturing(false)
    }
  }

  const saveLabel = loading
    ? '加载中…'
    : saving
      ? '保存中…'
      : dirty
        ? '未保存'
        : '已保存'

  return createPortal(
    <div className="stage-overlay" role="dialog" aria-label="导演台" data-scope="stage">
      <div className="stage-window">
        <header className="stage-topbar">
          <div className="stage-topbar__left">
            <button
              type="button"
              className="stage-icon-button"
              onClick={closeStage}
              title="返回画布"
            >
              <Icon name="chevron-left" size={16} />
            </button>
            <div className="stage-topbar__title">
              <span>{doc?.name ?? '导演台'}</span>
              <small>{saveLabel}</small>
            </div>
          </div>

          <div className="stage-topbar__center">
            <div className="stage-view-switch" role="group" aria-label="视角">
              <button
                type="button"
                className={viewMode === 'director' ? 'is-active' : ''}
                onClick={() => setViewMode('director')}
              >
                导演视角
              </button>
              <button
                type="button"
                className={viewMode === 'camera' ? 'is-active' : ''}
                onClick={() => setViewMode('camera')}
                disabled={!doc || doc.cameras.length === 0}
              >
                机位视角
              </button>
            </div>
            {activeCamera ? (
              <span className="stage-topbar__camera">
                {activeCamera.name} · {activeCamera.fov}°
              </span>
            ) : (
              <span className="stage-topbar__camera">暂无当前机位</span>
            )}
          </div>

          <div className="stage-topbar__right">
            <button
              type="button"
              className="stage-text-button"
              onClick={() => void handleExportPreview()}
              disabled={!doc || !selectedShotId || exporting}
            >
              <Icon name="video" size={14} />
              {exporting
                ? `导出中 ${Math.round(exportProgress * 100)}%`
                : '导出预演'}
            </button>
            <button
              type="button"
              className="stage-text-button"
              onClick={() => void handleCapture()}
              disabled={!doc || capturing}
            >
              <Icon name="image" size={14} />
              {capturing ? '截图中…' : '截图到画布'}
            </button>
            <button
              type="button"
              className="stage-icon-button"
              onClick={closeStage}
              title="关闭导演台"
            >
              <Icon name="close" size={16} />
            </button>
          </div>
        </header>

        <aside className="stage-sidebar">
          <div className="stage-sidebar__section">
            <div className="stage-sidebar__title">
              <span>对象</span>
              <div className="stage-sidebar__title-actions">
                <small>{doc?.objects.length ?? 0}</small>
                <button
                  type="button"
                  className="stage-mini-button"
                  title="添加对象"
                  onClick={() => setAddObjectOpen((open) => !open)}
                >
                  +
                </button>
              </div>
            </div>
            {addObjectOpen ? (
              <div className="stage-add-menu">
                {OBJECT_OPTIONS.map((option) => (
                  <button
                    key={option.type}
                    type="button"
                    onClick={() => {
                      addObject(option.type)
                      setAddObjectOpen(false)
                    }}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            ) : null}
            <div className="stage-sidebar__list">
              {doc?.objects.length ? (
                doc.objects.map((object) => (
                  <button
                    key={object.id}
                    type="button"
                    className={`stage-list-item ${
                      object.id === selectedObjectId ? 'is-selected' : ''
                    }`}
                    onClick={() => selectObject(object.id)}
                  >
                    <Icon name="grid" size={13} />
                    <span>{object.name}</span>
                    <small>{object.type}</small>
                  </button>
                ))
              ) : (
                <div className="stage-sidebar__empty">还没有对象</div>
              )}
            </div>
          </div>

          <div className="stage-sidebar__section">
            <div className="stage-sidebar__title">
              <span>机位</span>
              <div className="stage-sidebar__title-actions">
                <small>{doc?.cameras.length ?? 0}</small>
                <button
                  type="button"
                  className="stage-mini-button"
                  title="添加机位"
                  onClick={() => addCamera()}
                >
                  +
                </button>
              </div>
            </div>
            <div className="stage-sidebar__list">
              {doc?.cameras.length ? (
                doc.cameras.map((camera) => (
                  <button
                    key={camera.id}
                    type="button"
                    className={`stage-list-item ${
                      camera.id === activeCameraId ? 'is-selected' : ''
                    }`}
                    onClick={() => selectCamera(camera.id)}
                  >
                    <Icon name="frame" size={13} />
                    <span>{camera.name}</span>
                    <small>{camera.fov}°</small>
                  </button>
                ))
              ) : (
                <div className="stage-sidebar__empty">还没有机位</div>
              )}
            </div>
          </div>

          <div className="stage-sidebar__section">
            <div className="stage-sidebar__title">
              <span>镜头</span>
              <small>{doc?.shots.length ?? 0}</small>
            </div>
            <div className="stage-sidebar__list">
              {doc?.shots.length ? (
                doc.shots.map((shot) => (
                  <button
                    key={shot.id}
                    type="button"
                    className={`stage-list-item ${
                      shot.id === selectedShotId ? 'is-selected' : ''
                    }`}
                    onClick={() => selectShot(shot.id)}
                  >
                    <Icon name="video" size={13} />
                    <span>{shot.name ?? shot.id}</span>
                    <small>{Math.round(shot.durationMs / 1000)}s</small>
                  </button>
                ))
              ) : (
                <div className="stage-sidebar__empty">还没有镜头</div>
              )}
            </div>
          </div>
        </aside>

        <main className="stage-viewport-wrap">
          <StageViewport />
          {viewMode === 'director' && selectedObjectId ? (
            <div className="stage-transform-tools" role="group" aria-label="变换工具">
              {TRANSFORM_OPTIONS.map((option) => (
                <button
                  key={option.mode}
                  type="button"
                  className={transformMode === option.mode ? 'is-active' : ''}
                  onClick={() => setTransformMode(option.mode)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          ) : null}
          {loading ? (
            <div className="stage-viewport__status">正在加载场景…</div>
          ) : null}
          {!loading && doc && doc.objects.length === 0 ? (
            <div className="stage-viewport__empty">
              场景还是空的；对象编辑与 Agent 搭景将在下一阶段接入。
            </div>
          ) : null}
          <div className="stage-viewport__hint">
            拖拽旋转 · 滚轮缩放 · 点击对象或机位
          </div>
        </main>

        <aside className="stage-inspector-wrap">
          <StageInspector />
        </aside>

        <StageTimeline />

        {error ? (
          <div className="stage-error" role="status">
            <span>{error}</span>
            <button type="button" onClick={clearError}>
              知道了
            </button>
          </div>
        ) : null}
      </div>
    </div>,
    document.body
  )
}
