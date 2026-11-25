import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { StageObjectType } from '@shared/stage-schema'
import { Icon } from '../components/Icon'
import { isStageNode, nodeSize, useCanvasStore } from '../stores/canvas'
import { selectedNodeOutput } from '../stores/canvas-model'
import { generateStageFromScene } from './stage-from-scene'
import { useUIStore } from '../stores/ui'
import { shortcutMatches } from '../shortcuts/useShortcut'
import { StageInspector } from './StageInspector'
import { StageTimeline } from './StageTimeline'
import { StageViewport } from './StageViewport'
import { buildProgramTimeline } from '@shared/stage-program'
import { useStageStore } from './stageStore'
import { exportStagePreviewToCanvas } from './preview-runner'
import {
  Button,
  Dialog,
  Menu,
  MenuItem,
  MenuSeparator,
  Select
} from '../components/ui'
import type {
  StageExportItems,
  StageFrameDensity
} from '@shared/ipc-contract'
import {
  applyLightingPreset,
  STAGE_LIGHTING_PRESETS
} from '@shared/stage-lighting'

const OBJECT_OPTIONS: Array<{ type: StageObjectType; label: string }> = [
  { type: 'human', label: '人物' },
  { type: 'box', label: '立方体' },
  { type: 'sphere', label: '球体' },
  { type: 'plane', label: '平面' },
  { type: 'crowd', label: '群众' }
]

const EXPORT_ITEM_OPTIONS: Array<[keyof StageExportItems, string]> = [
  ['clips', '每镜片段'],
  ['frames', '分镜图'],
  ['overview', '场景鸟瞰'],
  ['shotList', '镜头表'],
  ['script', '分镜脚本']
]

const TRANSFORM_OPTIONS = [
  { mode: 'translate' as const, label: '移动' },
  { mode: 'rotate' as const, label: '旋转' },
  { mode: 'scale' as const, label: '缩放' }
]

const ICON_BUTTON_CLASS =
  'size-7 shrink-0 border border-transparent p-0 !rounded-md text-fg-muted hover:border-border hover:bg-surface-hover hover:text-fg'

const TEXT_BUTTON_CLASS =
  'h-7 gap-[5px] !rounded-md bg-surface px-2.5 text-[11px] !font-normal !text-fg hover:!border-border hover:bg-surface-hover hover:!text-fg'

const MINI_BUTTON_CLASS =
  'size-[18px] shrink-0 border border-border p-0 !rounded-md text-[13px] leading-none !font-normal text-fg-muted hover:bg-surface-hover hover:text-fg'

const LIST_ITEM_CLASS =
  'flex w-full min-w-0 !justify-start items-center gap-[7px] border border-transparent px-[7px] py-1.5 !rounded-md text-left text-[11px] !font-normal text-fg-muted hover:bg-surface-hover data-[active]:border-border-strong data-[active]:bg-surface-hover data-[active]:text-fg'

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
  const playbackScope = useStageStore((state) => state.playbackScope)
  const setPlaybackScope = useStageStore((state) => state.setPlaybackScope)
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
  const [exportOptionsOpen, setExportOptionsOpen] = useState(false)
  const [exportItems, setExportItems] = useState<StageExportItems>({
    previs: true,
    clips: true,
    frames: true,
    overview: true,
    shotList: true,
    script: true
  })
  const [frameDensity, setFrameDensity] =
    useState<StageFrameDensity>('three')
  const [addObjectOpen, setAddObjectOpen] = useState(false)
  const [lightingPreset, setLightingPreset] = useState('')
  const [exportMenuPosition, setExportMenuPosition] = useState({
    x: 0,
    y: 0
  })
  const [generatingScene, setGeneratingScene] = useState(false)
  const [privacyOpen, setPrivacyOpen] = useState(false)

  useEffect(() => {
    if (!playing) return
    let last = performance.now()
    let raf = 0

    const tick = (now: number): void => {
      const state = useStageStore.getState()
      if (state.playbackScope === 'program') {
        if (!state.doc) {
          state.pause()
          return
        }
        const timeline = buildProgramTimeline(state.doc)
        if (timeline.durationMs <= 0) {
          state.pause()
          return
        }

        const next = state.programMs + (now - last)
        last = now
        if (next >= timeline.durationMs) {
          state.seekProgram(timeline.durationMs)
          state.pause()
          return
        }
        state.seekProgram(next)
        raf = requestAnimationFrame(tick)
        return
      }

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
      if (shortcutMatches(event, 'stage.undo')) {
        event.preventDefault()
        undo()
        return
      }
      if (shortcutMatches(event, 'stage.redo')) {
        event.preventDefault()
        redo()
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
    if (!state.doc || !state.nodeId) {
      useStageStore.setState({ error: '请先打开场景' })
      return
    }
    const scope = state.playbackScope
    if (scope === 'shot' && !state.selectedShotId) {
      useStageStore.setState({ error: '请先选择一个镜头' })
      return
    }
    if (
      scope === 'program' &&
      buildProgramTimeline(state.doc).durationMs <= 0
    ) {
      useStageStore.setState({ error: '成片还没有镜头' })
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
        scope,
        ...(scope === 'shot'
          ? { shotId: state.selectedShotId ?? undefined }
          : {}),
        resolution: '720p',
        fps: 24,
        items: exportItems,
        frameDensity
      })

      const clipCount = result.clips?.length ?? 0
      useUIStore
        .getState()
        .showToast(
          result.nodeIds.length > 0
            ? scope === 'program'
              ? `整片预演已导出${clipCount ? `，含 ${clipCount} 个镜头片段` : ''}`
              : '白模预演已导出并添加到画布'
            : '白模预演已导出'
        )
    } catch (exportError) {
      const message =
        exportError instanceof Error
          ? exportError.message
          : '导出白模预演失败'
      if (message.includes('取消')) {
        useUIStore.getState().showToast('导出已取消')
      } else {
        useStageStore.setState({ error: message })
      }
    } finally {
      setExporting(false)
    }
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

  const handleLightingPreset = (presetId: string): void => {
    const state = useStageStore.getState()
    if (!state.doc) return
    const next = applyLightingPreset(state.doc, presetId)
    state.applyCommands([{ type: 'setLighting', lighting: next.lighting }])
    setLightingPreset(presetId)
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
        stageNode.id,
        undefined,
        true
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
      className="fixed inset-0 z-[90] flex bg-overlay px-4 pt-12 pb-4 backdrop-blur-[4px] [-webkit-app-region:no-drag] max-[720px]:px-2 max-[720px]:pt-11 max-[720px]:pb-2"
      role="dialog"
      aria-label="导演台"
      data-scope="stage"
    >
      <div data-window="stage" className="grid min-h-0 min-w-0 flex-1 gap-1.5 overflow-hidden rounded-panel border border-border bg-canvas p-1.5 text-fg shadow-float [grid-template-areas:'top_top_top'_'left_viewport_right'_'timeline_timeline_timeline'] [grid-template-columns:240px_minmax(0,1fr)_280px] [grid-template-rows:48px_minmax(0,1fr)_168px] max-[900px]:[grid-template-columns:190px_minmax(0,1fr)_220px] max-[900px]:[grid-template-rows:48px_minmax(0,1fr)_150px] max-[720px]:[grid-template-areas:'top'_'viewport'_'timeline'] max-[720px]:[grid-template-columns:minmax(0,1fr)] max-[720px]:[grid-template-rows:48px_minmax(0,1fr)_150px]">
        <header className="flex min-w-0 items-center justify-between gap-3 rounded-card border border-border bg-surface px-2.5 [grid-area:top]">
          <div className="flex min-w-0 items-center gap-2">
            <Select
              value={lightingPreset}
              options={[
                { value: '', label: '光照' },
                ...STAGE_LIGHTING_PRESETS.map((preset) => ({
                  value: preset.id,
                  label: preset.name
                }))
              ]}
              onChange={(value) => {
                if (value) handleLightingPreset(value)
                else setLightingPreset('')
              }}
              className="!h-7 !min-w-[84px] !rounded-md !px-2 !text-[11px]"
              disabled={!doc}
              title="切换日戏、黄昏、夜戏等光照预设"
            />
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
              className="flex overflow-hidden rounded-md border border-border"
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
            <div
              className="flex overflow-hidden rounded-md border border-border"
              role="group"
              aria-label="播放范围"
            >
              <Button
                type="button"
                variant="ghost"
                size="none"
                className={VIEW_SWITCH_CLASS}
                data-active={playbackScope === 'shot' ? '' : undefined}
                onClick={() => {
                  useStageStore.getState().pause()
                  setPlaybackScope('shot')
                }}
              >
                镜头
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="none"
                className={VIEW_SWITCH_CLASS}
                data-active={playbackScope === 'program' ? '' : undefined}
                onClick={() => {
                  useStageStore.getState().pause()
                  setPlaybackScope('program')
                }}
                disabled={!doc}
              >
                整片
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

          <div className="relative flex min-w-0 items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="none"
              className={TEXT_BUTTON_CLASS}
              onClick={(event) => {
                const rect = event.currentTarget.getBoundingClientRect()
                setExportMenuPosition({
                  x: rect.right - 224,
                  y: rect.bottom + 6
                })
                setExportOptionsOpen((open) => !open)
              }}
              disabled={exporting}
            >
              选项
            </Button>
            <Menu
              open={exportOptionsOpen}
              onClose={() => setExportOptionsOpen(false)}
              x={exportMenuPosition.x}
              y={exportMenuPosition.y}
              width={224}
            >
              {EXPORT_ITEM_OPTIONS.map(([key, label]) => (
                <MenuItem
                  key={key}
                  active={exportItems[key]}
                  trailing={exportItems[key] ? '✓' : undefined}
                  onSelect={() =>
                    setExportItems((items) => ({
                      ...items,
                      [key]: !items[key]
                    }))
                  }
                >
                  {label}
                </MenuItem>
              ))}
              <MenuSeparator />
              <MenuItem
                active={frameDensity === 'three'}
                trailing={frameDensity === 'three' ? '✓' : undefined}
                onSelect={() => setFrameDensity('three')}
              >
                三张
              </MenuItem>
              <MenuItem
                active={frameDensity === 'first-only'}
                trailing={frameDensity === 'first-only' ? '✓' : undefined}
                onSelect={() => setFrameDensity('first-only')}
              >
                仅首帧
              </MenuItem>
            </Menu>
            <Button
              type="button"
              variant="secondary"
              size="none"
              className={TEXT_BUTTON_CLASS}
              onClick={() => {
                if (exporting) {
                  const stageId = doc?.stageId
                  if (stageId) {
                    void window.api.stage.cancelExport(stageId)
                  }
                  return
                }
                void handleExportPreview()
              }}
              disabled={
                !doc ||
                (!exporting &&
                  playbackScope === 'shot' &&
                  !selectedShotId)
              }
            >
              <Icon name={exporting ? 'close' : 'video'} size={14} />
              {exporting
                ? `取消导出 ${Math.round(exportProgress * 100)}%`
                : playbackScope === 'program'
                  ? '导出整片'
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

        <aside className="flex min-h-0 flex-col gap-1.5 overflow-x-hidden overflow-y-auto rounded-card border border-border bg-surface p-2 [grid-area:left] max-[720px]:hidden">
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
              <div className="mb-1.5 grid grid-cols-2 gap-1 rounded-md border border-border bg-surface-hover p-1">
                {OBJECT_OPTIONS.map((option) => (
                  <Button
                    key={option.type}
                    type="button"
                    variant="ghost"
                    size="none"
                    className="border border-border bg-surface px-1.5 py-[5px] !rounded-md text-[11px] !font-normal text-fg-muted hover:bg-surface-hover hover:text-fg"
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

        <main className="relative min-h-0 min-w-0 overflow-hidden rounded-card border border-border bg-media-bg [grid-area:viewport]">
          <StageViewport />
          {viewMode === 'director' && selectedObjectId ? (
            <div
              className="absolute top-2.5 left-1/2 flex -translate-x-1/2 overflow-hidden rounded-md border border-border bg-[color-mix(in_srgb,var(--surface)_92%,transparent)] shadow-float"
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
            <div className="pointer-events-none absolute top-1/2 left-1/2 max-w-[320px] -translate-x-1/2 -translate-y-1/2 rounded-card border border-border bg-[color-mix(in_srgb,var(--surface)_88%,transparent)] px-3.5 py-2.5 text-center text-xs leading-relaxed text-fg-muted">
              正在加载场景…
            </div>
          ) : null}
          {!loading && doc && doc.objects.length === 0 ? (
            <div className="pointer-events-none absolute bottom-4 left-1/2 max-w-[320px] -translate-x-1/2 rounded-card border border-border bg-[color-mix(in_srgb,var(--surface)_88%,transparent)] px-3.5 py-2.5 text-center text-xs leading-relaxed text-fg-muted">
              场景还是空的；可以在左侧添加对象和机位，或让 CineBot 帮你搭景。
            </div>
          ) : null}
          <div className="pointer-events-none absolute right-2.5 bottom-2 rounded-md bg-black/35 px-1.5 py-0.5 text-[10px] text-fg-subtle">
            拖拽旋转 · 滚轮缩放 · 点击对象或机位
          </div>
        </main>

        <aside className="flex min-h-0 flex-col gap-1.5 overflow-x-hidden overflow-y-auto rounded-card border border-border bg-surface p-2.5 [grid-area:right] max-[720px]:hidden">
          <StageInspector />
        </aside>

        <StageTimeline />

        {error ? (
          <div
            className="absolute right-5 bottom-5 left-5 flex items-center justify-between gap-2 rounded-card border border-border bg-[color-mix(in_srgb,var(--danger)_14%,var(--surface))] px-3 py-2 text-[11px] text-danger shadow-float"
            role="status"
          >
            <span>{error}</span>
            <Button
              type="button"
              variant="ghost"
              size="none"
              className="shrink-0 border border-border bg-transparent px-2 py-[2px] !rounded-md text-[10px] !font-normal !text-danger hover:!bg-transparent hover:!text-danger"
              onClick={clearError}
            >
              知道了
            </Button>
          </div>
        ) : null}
      </div>
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
