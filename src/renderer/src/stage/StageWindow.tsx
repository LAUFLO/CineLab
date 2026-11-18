import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { StageObjectType } from '@shared/stage-schema'
import { Icon } from '../components/Icon'
import { isStageNode, nodeSize, useCanvasStore } from '../stores/canvas'
import { selectedNodeOutput } from '../stores/canvas-model'
import { generateStageFromScene } from './stage-from-scene'
import { useUIStore } from '../stores/ui'
import { StageInspector } from './StageInspector'
import { StageTimeline } from './StageTimeline'
import { StageViewport } from './StageViewport'
import { normalizePrevisWorldRef } from '@shared/previs/world-gen'
import { WorldSettingsDialog } from './WorldSettingsDialog'
import { useStageStore } from './stageStore'
import { exportStagePreviewToCanvas } from './preview-runner'
import { Button, Dialog } from '../components/ui'

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

const ICON_BUTTON_CLASS =
  'size-7 shrink-0 border border-transparent p-0 !rounded-[7px] text-fg-muted hover:border-border hover:bg-surface-hover hover:text-fg'

const TEXT_BUTTON_CLASS =
  'h-7 gap-[5px] !rounded-[7px] bg-surface px-2.5 text-[11px] !font-normal !text-fg hover:!border-border hover:bg-surface-hover hover:!text-fg'

const MINI_BUTTON_CLASS =
  'size-[18px] shrink-0 border border-border p-0 !rounded-[5px] text-[13px] leading-none !font-normal text-fg-muted hover:bg-surface-hover hover:text-fg'

const LIST_ITEM_CLASS =
  'flex w-full min-w-0 !justify-start items-center gap-[7px] border border-transparent px-[7px] py-1.5 !rounded-[7px] text-left text-[11px] !font-normal text-fg-muted hover:bg-surface-hover data-[active]:border-border-strong data-[active]:bg-surface-hover data-[active]:text-fg'

const VIEW_SWITCH_CLASS =
  '!rounded-none border-0 bg-transparent px-2.5 py-1 text-[11px] !font-normal text-fg-subtle hover:bg-surface-hover hover:text-fg data-[active]:bg-surface-hover data-[active]:text-fg disabled:cursor-default disabled:!opacity-40'

const TRANSFORM_TOOL_CLASS =
  '!rounded-none border-0 bg-transparent px-2.5 py-[5px] text-[11px] !font-normal text-fg-subtle hover:bg-surface-hover hover:text-fg data-[active]:bg-surface-hover data-[active]:text-fg'

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
  const [worldSettingsOpen, setWorldSettingsOpen] = useState(false)
  const [generatingScene, setGeneratingScene] = useState(false)
  const [privacyOpen, setPrivacyOpen] = useState(false)

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
  const activeCamera = doc?.cameras.find(
    (camera) => camera.id === activeCameraId
  )

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
      const result = await exportStagePreviewToCanvas({
        stageNodeId: stageNode.id,
        stageId: state.doc.stageId,
        shotId: state.selectedShotId,
        resolution: '720p',
        fps: 24
      })

      useUIStore
        .getState()
        .showToast(
          result.nodeIds.length > 0
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

  const handleWorld = (): void => {
    const current = useStageStore.getState().doc
    if (!current) return
    const seed = current.world
      ? (current.world.seed + 1) % 1_000_000
      : 1
    const world = normalizePrevisWorldRef({
      ...(current.world ?? {
        generatorVersion: 'styled-v1',
        style: 'modern_city',
        layout: 'street',
        density: 'medium',
        timeOfDay: 'dusk',
        weather: 'clear',
        extentM: [160, 160]
      }),
      seed
    })
    useStageStore.getState().applyCommands([{ type: 'setWorld', world }])
  }

  const stageReferenceImage = (): ReturnType<typeof selectedNodeOutput> => {
    if (!nodeId) return null
    const canvas = useCanvasStore.getState()
    const edge = canvas.edges.find((item) => item.target === nodeId)
    if (!edge) return null
    const source = canvas.nodes.find((item) => item.id === edge.source)
    if (!source) return null
    const output = selectedNodeOutput(source)
    return output && output.kind === 'image' ? output : null
  }

  const runGenerateFromScene = async (): Promise<void> => {
    const output = stageReferenceImage()
    if (!output) return
    setGeneratingScene(true)
    try {
      await generateStageFromScene({
        imagePath: output.path,
        imageScope: output.scope
      })
    } catch (error) {
      useStageStore.setState({
        error: error instanceof Error ? error.message : String(error)
      })
    } finally {
      setGeneratingScene(false)
    }
  }

  const handleGenerateFromScene = (): void => {
    if (
      window.localStorage.getItem('cinelab.scenePrivacyAcknowledged') !== '1'
    ) {
      setPrivacyOpen(true)
      return
    }
    void runGenerateFromScene()
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
        error: captureError instanceof Error ? captureError.message : '截图失败'
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
    <div
      className="fixed inset-0 z-[90] flex bg-black/55 px-4 pt-12 pb-4 backdrop-blur-[4px] [-webkit-app-region:no-drag] max-[720px]:px-2 max-[720px]:pt-11 max-[720px]:pb-2"
      role="dialog"
      aria-label="导演台"
      data-scope="stage"
    >
      <div data-window="stage" className="grid min-h-0 min-w-0 flex-1 gap-1.5 overflow-hidden rounded-panel border border-border bg-canvas p-1.5 text-fg shadow-menu [grid-template-areas:'top_top_top'_'left_viewport_right'_'timeline_timeline_timeline'] [grid-template-columns:240px_minmax(0,1fr)_280px] [grid-template-rows:48px_minmax(0,1fr)_168px] max-[900px]:[grid-template-columns:190px_minmax(0,1fr)_220px] max-[900px]:[grid-template-rows:48px_minmax(0,1fr)_150px] max-[720px]:[grid-template-areas:'top'_'viewport'_'timeline'] max-[720px]:[grid-template-columns:minmax(0,1fr)] max-[720px]:[grid-template-rows:48px_minmax(0,1fr)_150px]">
        <header className="flex min-w-0 items-center justify-between gap-3 rounded-[10px] border border-border bg-surface px-2.5 [grid-area:top]">
          <div className="flex min-w-0 items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="none"
              className={TEXT_BUTTON_CLASS}
              onClick={handleWorld}
              disabled={!doc}
              title="生成或更换程序化白膜世界"
            >
              {doc?.world ? '换世界' : '生成世界'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="none"
              className={TEXT_BUTTON_CLASS}
              onClick={() => setWorldSettingsOpen(true)}
              disabled={!doc}
              title="手动调整世界参数"
            >
              世界设置
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="none"
              className={TEXT_BUTTON_CLASS}
              onClick={() => void handleGenerateFromScene()}
              disabled={!doc || generatingScene || !stageReferenceImage()}
              title="从上游第一张参考图生成白膜场景"
            >
              {generatingScene ? '生成中…' : '从参考图生成'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="none"
              className={ICON_BUTTON_CLASS}
              onClick={closeStage}
              title="返回画布"
            >
              <Icon name="chevron-left" size={16} />
            </Button>
            <div className="flex min-w-0 flex-col">
              <span className="overflow-hidden text-ellipsis text-[13px] font-semibold whitespace-nowrap">
                {doc?.name ?? '导演台'}
              </span>
              <small className="text-[10px] text-fg-subtle">{saveLabel}</small>
            </div>
          </div>

          <div className="flex min-w-0 flex-1 items-center justify-center gap-2">
            <div
              className="flex overflow-hidden rounded-[7px] border border-border"
              role="group"
              aria-label="视角"
            >
              <Button
                type="button"
                variant="ghost"
                size="none"
                className={VIEW_SWITCH_CLASS}
                data-active={viewMode === 'director' ? '' : undefined}
                onClick={() => setViewMode('director')}
              >
                导演视角
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="none"
                className={VIEW_SWITCH_CLASS}
                data-active={viewMode === 'camera' ? '' : undefined}
                onClick={() => setViewMode('camera')}
                disabled={!doc || doc.cameras.length === 0}
              >
                机位视角
              </Button>
            </div>
            {activeCamera ? (
              <span className="overflow-hidden text-ellipsis text-[11px] text-fg-subtle whitespace-nowrap">
                {activeCamera.name} · {activeCamera.fov}°
              </span>
            ) : (
              <span className="overflow-hidden text-ellipsis text-[11px] text-fg-subtle whitespace-nowrap">
                暂无当前机位
              </span>
            )}
          </div>

          <div className="flex min-w-0 items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="none"
              className={TEXT_BUTTON_CLASS}
              onClick={() => void handleExportPreview()}
              disabled={!doc || !selectedShotId || exporting}
            >
              <Icon name="video" size={14} />
              {exporting
                ? `导出中 ${Math.round(exportProgress * 100)}%`
                : '导出预演'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="none"
              className={TEXT_BUTTON_CLASS}
              onClick={() => void handleCapture()}
              disabled={!doc || capturing}
            >
              <Icon name="image" size={14} />
              {capturing ? '截图中…' : '截图到画布'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="none"
              className={ICON_BUTTON_CLASS}
              onClick={closeStage}
              title="关闭导演台"
            >
              <Icon name="close" size={16} />
            </Button>
          </div>
        </header>

        <aside className="flex min-h-0 flex-col gap-1.5 overflow-x-hidden overflow-y-auto rounded-[10px] border border-border bg-surface p-2 [grid-area:left] max-[720px]:hidden">
          <div className="[&+&]:mt-3 [&+&]:border-t [&+&]:border-border [&+&]:pt-2.5">
            <div className="flex items-center justify-between px-1 pb-1.5 text-[11px] font-semibold text-fg-muted">
              <span>对象</span>
              <div className="flex items-center gap-1.5">
                <small className="font-normal text-fg-subtle">
                  {doc?.objects.length ?? 0}
                </small>
                <Button
                  type="button"
                  variant="ghost"
                  size="none"
                  className={MINI_BUTTON_CLASS}
                  title="添加对象"
                  onClick={() => setAddObjectOpen((open) => !open)}
                >
                  +
                </Button>
              </div>
            </div>
            {addObjectOpen ? (
              <div className="mb-1.5 grid grid-cols-2 gap-1 rounded-[7px] border border-border bg-surface-hover p-1">
                {OBJECT_OPTIONS.map((option) => (
                  <Button
                    key={option.type}
                    type="button"
                    variant="ghost"
                    size="none"
                    className="border border-border bg-surface px-1.5 py-[5px] !rounded-[5px] text-[11px] !font-normal text-fg-muted hover:bg-surface-hover hover:text-fg"
                    onClick={() => {
                      addObject(option.type)
                      setAddObjectOpen(false)
                    }}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            ) : null}
            <div className="flex flex-col gap-[3px]">
              {doc?.objects.length ? (
                doc.objects.map((object) => (
                  <Button
                    key={object.id}
                    type="button"
                    variant="ghost"
                    size="none"
                    className={LIST_ITEM_CLASS}
                    data-active={
                      object.id === selectedObjectId ? '' : undefined
                    }
                    onClick={() => selectObject(object.id)}
                  >
                    <Icon name="grid" size={13} />
                    <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
                      {object.name}
                    </span>
                    <small className="text-[10px] text-fg-subtle">
                      {object.type}
                    </small>
                  </Button>
                ))
              ) : (
                <div className="px-1.5 py-2 text-[11px] text-fg-subtle">
                  还没有对象
                </div>
              )}
            </div>
          </div>

          <div className="[&+&]:mt-3 [&+&]:border-t [&+&]:border-border [&+&]:pt-2.5">
            <div className="flex items-center justify-between px-1 pb-1.5 text-[11px] font-semibold text-fg-muted">
              <span>机位</span>
              <div className="flex items-center gap-1.5">
                <small className="font-normal text-fg-subtle">
                  {doc?.cameras.length ?? 0}
                </small>
                <Button
                  type="button"
                  variant="ghost"
                  size="none"
                  className={MINI_BUTTON_CLASS}
                  title="添加机位"
                  onClick={() => addCamera()}
                >
                  +
                </Button>
              </div>
            </div>
            <div className="flex flex-col gap-[3px]">
              {doc?.cameras.length ? (
                doc.cameras.map((camera) => (
                  <Button
                    key={camera.id}
                    type="button"
                    variant="ghost"
                    size="none"
                    className={LIST_ITEM_CLASS}
                    data-active={camera.id === activeCameraId ? '' : undefined}
                    onClick={() => selectCamera(camera.id)}
                  >
                    <Icon name="frame" size={13} />
                    <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
                      {camera.name}
                    </span>
                    <small className="text-[10px] text-fg-subtle">
                      {camera.fov}°
                    </small>
                  </Button>
                ))
              ) : (
                <div className="px-1.5 py-2 text-[11px] text-fg-subtle">
                  还没有机位
                </div>
              )}
            </div>
          </div>

          <div className="[&+&]:mt-3 [&+&]:border-t [&+&]:border-border [&+&]:pt-2.5">
            <div className="flex items-center justify-between px-1 pb-1.5 text-[11px] font-semibold text-fg-muted">
              <span>镜头</span>
              <small className="font-normal text-fg-subtle">
                {doc?.shots.length ?? 0}
              </small>
            </div>
            <div className="flex flex-col gap-[3px]">
              {doc?.shots.length ? (
                doc.shots.map((shot) => (
                  <Button
                    key={shot.id}
                    type="button"
                    variant="ghost"
                    size="none"
                    className={LIST_ITEM_CLASS}
                    data-active={shot.id === selectedShotId ? '' : undefined}
                    onClick={() => selectShot(shot.id)}
                  >
                    <Icon name="video" size={13} />
                    <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
                      {shot.name ?? shot.id}
                    </span>
                    <small className="text-[10px] text-fg-subtle">
                      {Math.round(shot.durationMs / 1000)}s
                    </small>
                  </Button>
                ))
              ) : (
                <div className="px-1.5 py-2 text-[11px] text-fg-subtle">
                  还没有镜头
                </div>
              )}
            </div>
          </div>
        </aside>

        <main className="relative min-h-0 min-w-0 overflow-hidden rounded-[10px] border border-border bg-media-bg [grid-area:viewport]">
          <StageViewport />
          {viewMode === 'director' && selectedObjectId ? (
            <div
              className="absolute top-2.5 left-1/2 flex -translate-x-1/2 overflow-hidden rounded-[7px] border border-border bg-[color-mix(in_srgb,var(--surface)_92%,transparent)] shadow-float"
              role="group"
              aria-label="变换工具"
            >
              {TRANSFORM_OPTIONS.map((option) => (
                <Button
                  key={option.mode}
                  type="button"
                  variant="ghost"
                  size="none"
                  className={TRANSFORM_TOOL_CLASS}
                  data-active={transformMode === option.mode ? '' : undefined}
                  onClick={() => setTransformMode(option.mode)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          ) : null}
          {loading ? (
            <div className="pointer-events-none absolute top-1/2 left-1/2 max-w-[320px] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-[color-mix(in_srgb,var(--surface)_88%,transparent)] px-3.5 py-2.5 text-center text-xs leading-relaxed text-fg-muted">
              正在加载场景…
            </div>
          ) : null}
          {!loading && doc && doc.objects.length === 0 ? (
            <div className="pointer-events-none absolute bottom-4 left-1/2 max-w-[320px] -translate-x-1/2 rounded-lg border border-border bg-[color-mix(in_srgb,var(--surface)_88%,transparent)] px-3.5 py-2.5 text-center text-xs leading-relaxed text-fg-muted">
              场景还是空的；对象编辑与 Agent 搭景将在下一阶段接入。
            </div>
          ) : null}
          <div className="pointer-events-none absolute right-2.5 bottom-2 rounded-[5px] bg-black/35 px-1.5 py-0.5 text-[10px] text-fg-subtle">
            拖拽旋转 · 滚轮缩放 · 点击对象或机位
          </div>
        </main>

        <aside className="flex min-h-0 flex-col gap-1.5 overflow-x-hidden overflow-y-auto rounded-[10px] border border-border bg-surface p-2.5 [grid-area:right] max-[720px]:hidden">
          <StageInspector />
        </aside>

        <StageTimeline />

        {error ? (
          <div
            className="absolute right-5 bottom-5 left-5 flex items-center justify-between gap-2 rounded-lg border border-border bg-[color-mix(in_srgb,var(--danger)_14%,var(--surface))] px-3 py-2 text-[11px] text-danger shadow-float"
            role="status"
          >
            <span>{error}</span>
            <Button
              type="button"
              variant="ghost"
              size="none"
              className="shrink-0 border border-border bg-transparent px-2 py-[2px] !rounded-[5px] text-[10px] !font-normal !text-danger hover:!bg-transparent hover:!text-danger"
              onClick={clearError}
            >
              知道了
            </Button>
          </div>
        ) : null}
      </div>
      <WorldSettingsDialog
        open={worldSettingsOpen}
        onClose={() => setWorldSettingsOpen(false)}
      />
      <Dialog
        open={privacyOpen}
        onClose={() => setPrivacyOpen(false)}
        title="图片会发送给模型"
        size="sm"
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPrivacyOpen(false)}
            >
              取消
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                window.localStorage.setItem(
                  'cinelab.scenePrivacyAcknowledged',
                  '1'
                )
                setPrivacyOpen(false)
                void runGenerateFromScene()
              }}
            >
              继续
            </Button>
          </div>
        }
      >
        <p className="text-xs leading-relaxed text-fg-muted">
          「从参考图生成」会把这张图片发送给你在设置中配置的多模态文本模型，用于解析场景。
          图片不会上传到 CineLab 服务器；解析结果只写回当前项目。
        </p>
      </Dialog>
    </div>,
    document.body
  )
}
