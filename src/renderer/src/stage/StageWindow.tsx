import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { StageObjectType, StageVec3 } from '@shared/stage-schema'
import { Icon } from '../components/Icon'
import { isStageNode, nodeSize, useCanvasStore } from '../stores/canvas'
import { useSettingsStore } from '../stores/settings'
import { selectedNodeOutput } from '../stores/canvas-model'
import { generateStageFromScene } from './stage-from-scene'
import { assetUrl } from '../lib/asset-url'
import { useUIStore } from '../stores/ui'
import { shortcutMatches } from '../shortcuts/useShortcut'
import { StageInspector } from './StageInspector'
import { StageTimeline } from './StageTimeline'
import { StageViewport } from './StageViewport'
import { buildProgramTimeline } from '@shared/stage-program'
import { useStageStore, type StageDrawMode } from './stageStore'
import { projectStagePathPoint } from './stage-path-bridge'
import { exportStagePreviewToCanvas } from './preview-runner'
import {
  Button,
  Dialog,
  Menu,
  MenuItem,
  NativeSelect,
  Select,
  WindowDragStrip
} from '../components/ui'
import type { AssetScope } from '@shared/asset-schema'
import {
  applyLightingPreset,
  STAGE_LIGHTING_PRESETS
} from '@shared/stage-lighting'
import { modelInputs } from '@shared/provider-schema'

const OBJECT_OPTIONS: Array<{ type: StageObjectType; label: string }> = [
  { type: 'human', label: '人物' },
  { type: 'box', label: '立方体' },
  { type: 'sphere', label: '球体' },
  { type: 'plane', label: '平面' },
  { type: 'gltf', label: '模型' },
  { type: 'crowd', label: '群众' }
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
  const [addObjectOpen, setAddObjectOpen] = useState(false)
  const [lightingPreset, setLightingPreset] = useState('')
  const [generatingScene, setGeneratingScene] = useState(false)
  const [importing, setImporting] = useState(false)
  const [privacyOpen, setPrivacyOpen] = useState(false)
  const [panoramaMenuOpen, setPanoramaMenuOpen] = useState(false)
  const [panoramaMenuPosition, setPanoramaMenuPosition] = useState({ x: 0, y: 0 })
  const [sceneModelKey, setSceneModelKey] = useState('')
  const providers = useSettingsStore((state) => state.providers)
  const sceneModelOptions = useMemo(() => {
    const options: Array<{ value: string; label: string }> = []
    for (const provider of providers) {
      if (!provider.hasKey) continue
      for (const model of provider.models) {
        if (model.capability !== 'text.chat') continue
        if (!modelInputs(model).includes('image')) continue
        options.push({
          value: `${provider.id}/${model.id}`,
          label: `${provider.name} · ${model.name}`
        })
      }
    }
    return options
  }, [providers])
  const [selectedForGroup, setSelectedForGroup] = useState<string[]>([])
  const drawMode = useStageStore((state) => state.drawMode)
  const setDrawMode = useStageStore((state) => state.setDrawMode)
  const addPath = useStageStore((state) => state.addPath)
  const [drawPoints, setDrawPoints] = useState<Array<{ x: number; y: number }>>([])
  const drawingRef = useRef(false)
  const drawRectRef = useRef<DOMRect | null>(null)

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

  const drawPlaneY = useMemo(() => {
    const object = doc?.objects.find((item) => item.id === selectedObjectId)
    if (object) return object.transform.position[1]
    const cameraId =
      selectedCameraId ?? doc?.activeCameraId ?? doc?.cameras[0]?.id
    const camera = doc?.cameras.find((item) => item.id === cameraId)
    if (!camera) return 0
    const targetY = camera.target[1]
    return Math.abs(camera.position[1] - targetY) < 0.2 ? 0 : targetY
  }, [doc, selectedObjectId, selectedCameraId])

  useEffect(() => {
    if (drawMode === 'off') return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      if (drawingRef.current) {
        drawingRef.current = false
        setDrawPoints([])
        return
      }
      setDrawMode('off')
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [drawMode, setDrawMode])

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

    const shot =
      scope === 'shot'
        ? state.doc.shots.find((item) => item.id === state.selectedShotId)
        : undefined
    const shotName = shot
      ? shot.name?.trim() || `镜头 ${state.doc.shots.indexOf(shot) + 1}`
      : undefined

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
        ...(shotName ? { shotName } : {}),
        stageName: state.doc.name,
        resolution: '720p',
        fps: 24
      })

      useUIStore
        .getState()
        .showToast(
          result.nodeIds.length > 0
            ? scope === 'program'
              ? '整片预演已导出并添加到画布'
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
    for (const edge of canvas.edges) {
      if (edge.target !== nodeId) continue
      const source = canvas.nodes.find((item) => item.id === edge.source)
      const output = source ? selectedNodeOutput(source) : null
      if (output?.kind === 'image') return output
    }
    return null
  }

  const panoramaCandidates = (): Array<{ id: string; label: string; url: string }> => {
    const canvas = useCanvasStore.getState()
    const list: Array<{ id: string; label: string; url: string }> = []
    for (const node of canvas.nodes) {
      if (node.type !== 'cine' && node.type !== 'film' && node.type !== 'studio') continue
      const output = selectedNodeOutput(node)
      if (!output || output.kind !== 'image') continue
      if (node.data.kind !== 'image') continue
      list.push({
        id: node.id,
        label: node.data.title || '全景图',
        url: assetUrl(output.path, output.scope)
      })
    }
    return list
  }

  const handlePanoramaBackground = (url: string): void => {
    const state = useStageStore.getState()
    if (!state.doc) return
    state.applyCommands([
      { type: 'setBackground', background: { kind: 'panorama', value: url } }
    ])
    setPanoramaMenuOpen(false)
  }

  const handleGroupSelected = (): void => {
    const chosen = selectedForGroup
    if (chosen.length < 2) return
    const parent = chosen[0]
    const state = useStageStore.getState()
    state.applyCommands(
      chosen.slice(1).map((id) => ({
        type: 'setParent' as const,
        objectId: id,
        parentId: parent
      }))
    )
    setSelectedForGroup([])
  }

  const handleObjectClick = (objectId: string, additive: boolean): void => {
    selectObject(objectId)
    if (!additive) {
      setSelectedForGroup([objectId])
      return
    }
    setSelectedForGroup((ids) =>
      ids.includes(objectId)
        ? ids.filter((id) => id !== objectId)
        : [...ids, objectId]
    )
  }

  const drawHint =
    drawMode === 'camera'
      ? '手绘相机路径 · 按住左键拖动 · 松开生成 · Esc 退出'
      : drawMode === 'object'
        ? `手绘「${doc?.objects.find((item) => item.id === selectedObjectId)?.name ?? '对象'}」路径 · 松开生成 · Esc 退出`
        : drawMode === 'follow'
          ? '手绘跟随目标路径 · 松开生成 · Esc 退出'
          : ''

  const cancelDraw = (): void => {
    drawingRef.current = false
    setDrawPoints([])
  }

  const finishDraw = (): void => {
    const rect = drawRectRef.current
    const points = drawPoints
    drawingRef.current = false
    drawRectRef.current = null
    setDrawPoints([])
    if (drawMode === 'off' || !rect || points.length < 2) return
    const projected = points
      .map((point) =>
        projectStagePathPoint(
          rect.left + point.x,
          rect.top + point.y,
          drawPlaneY
        )
      )
      .filter((point): point is StageVec3 => Boolean(point))
    if (projected.length < 2) return
    const cameraId =
      selectedCameraId ?? doc?.activeCameraId ?? doc?.cameras[0]?.id
    const camera = doc?.cameras.find((item) => item.id === cameraId)
    addPath({
      kind: drawMode,
      ...(selectedObjectId ? { objectId: selectedObjectId } : {}),
      ...(drawMode === 'camera' && camera
        ? { height: camera.position[1] - drawPlaneY }
        : {}),
      points: projected
    })
  }

  const handleLightingPreset = (presetId: string): void => {
    const state = useStageStore.getState()
    if (!state.doc) return
    const next = applyLightingPreset(state.doc, presetId)
    state.applyCommands([{ type: 'setLighting', lighting: next.lighting }])
    setLightingPreset(presetId)
  }

  const runGenerateFromScene = async (
    asset?: { path: string; scope?: AssetScope }
  ): Promise<void> => {
    const output = asset ?? stageReferenceImage()
    if (!output) return
    setGeneratingScene(true)
    try {
      const generated = await generateStageFromScene({
        imagePath: output.path,
        imageScope: output.scope,
        modelKey: sceneModelKey || undefined
      })
      if (generated.warnings?.length) {
        useStageStore.setState({ error: generated.warnings.join('；') })
      }
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

  const handleImportReference = async (): Promise<void> => {
    if (!doc || importing || generatingScene) return
    const state = useStageStore.getState()
    if (!state.nodeId) return
    const canvas = useCanvasStore.getState()
    const stageNode = canvas.nodes.find((node) => node.id === state.nodeId)
    if (!stageNode || !isStageNode(stageNode)) {
      useStageStore.setState({ error: '找不到导演台节点' })
      return
    }

    setImporting(true)
    try {
      const asset = await window.api.scene.pickImage()
      if (!asset) return

      const size = nodeSize(stageNode)
      const ids = canvas.addAssetNodes(
        'image',
        {
          x: stageNode.position.x - Math.max(320, size.width + 80),
          y: stageNode.position.y
        },
        [asset],
        '参考图',
        undefined,
        undefined,
        true
      )
      const imageId = ids[0]
      if (!imageId) throw new Error('参考图节点创建失败')

      useCanvasStore.getState().onConnect({
        source: imageId,
        target: stageNode.id
      })

      const latest = useCanvasStore.getState()
      const oldImageEdges = latest.edges.filter((edge) => {
        if (edge.target !== stageNode.id || edge.source === imageId) return false
        const source = latest.nodes.find((node) => node.id === edge.source)
        return source ? selectedNodeOutput(source)?.kind === 'image' : false
      })
      if (oldImageEdges.length > 0) {
        latest.removeEdges(oldImageEdges.map((edge) => edge.id))
      }

      useUIStore
        .getState()
        .showToast('参考图已添加到画布并连接到导演台')
    } catch (error) {
      useStageStore.setState({
        error: error instanceof Error ? error.message : String(error)
      })
    } finally {
      setImporting(false)
    }
  }

  const handleImportModel = async (): Promise<void> => {
    if (!doc || importing || generatingScene) return
    setImporting(true)
    try {
      const asset = await window.api.scene.pickModel()
      if (!asset) return
      addObject('gltf', asset.path)
    } catch (error) {
      useStageStore.setState({
        error: error instanceof Error ? error.message : String(error)
      })
    } finally {
      setImporting(false)
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
      <WindowDragStrip />
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
              onClick={(event) => {
                const rect = event.currentTarget.getBoundingClientRect()
                setPanoramaMenuPosition({ x: rect.left, y: rect.bottom + 6 })
                setPanoramaMenuOpen((open) => !open)
              }}
              disabled={!doc}
              title="从画布选择全景图作为场景背景"
            >
              全景背景
            </Button>
            <Menu
              open={panoramaMenuOpen}
              onClose={() => setPanoramaMenuOpen(false)}
              x={panoramaMenuPosition.x}
              y={panoramaMenuPosition.y}
              width={224}
            >
              {panoramaCandidates().length ? (
                panoramaCandidates().map((item) => (
                  <MenuItem
                    key={item.id}
                    onSelect={() => handlePanoramaBackground(item.url)}
                  >
                    {item.label}
                  </MenuItem>
                ))
              ) : (
                <div className="px-2 py-2 text-[11px] text-fg-subtle">
                  画布里没有可用的全景图
                </div>
              )}
            </Menu>
            <Button
              type="button"
              variant="secondary"
              size="none"
              className={TEXT_BUTTON_CLASS}
              onClick={() => void handleImportReference()}
              disabled={!doc || importing || generatingScene}
              title="选择本地图片，上传到画布并连接到导演台"
            >
              {importing ? '导入中…' : '导入参考图'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="none"
              className={TEXT_BUTTON_CLASS}
              onClick={() => void handleImportModel()}
              disabled={!doc || importing || generatingScene}
              title="选择本地 GLB / glTF 模型加入导演台"
            >
              {importing ? '导入中…' : '导入模型'}
            </Button>
            {sceneModelOptions.length > 0 ? (
              <NativeSelect
                className="!h-[26px] !max-w-[150px] !text-[10px]"
                value={sceneModelKey}
                onChange={(event) => setSceneModelKey(event.target.value)}
              >
                <option value="">视觉模型：自动</option>
                {sceneModelOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </NativeSelect>
            ) : null}
            <Button
              type="button"
              variant="secondary"
              size="none"
              className={TEXT_BUTTON_CLASS}
              onClick={() => void handleGenerateFromScene()}
              disabled={!doc || generatingScene || !stageReferenceImage()}
              title={
                stageReferenceImage()
                  ? '从上游第一张参考图生成白膜场景'
                  : '需要先连接一张图片节点到导演台'
              }
            >
              {generatingScene ? '生成中…' : '从参考图生成'}
            </Button>
            <div className="flex min-w-0 items-baseline gap-1.5">
              <span className="overflow-hidden text-ellipsis text-[13px] font-semibold whitespace-nowrap">
                {doc?.name ?? '导演台'}
              </span>
              <small className="shrink-0 text-[10px] text-fg-subtle">
                {saveLabel}
              </small>
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
            <Select
              value={drawMode}
              options={[
                { value: 'off', label: '手绘：关闭' },
                { value: 'camera', label: '相机路径' },
                { value: 'object', label: '对象路径' },
                { value: 'follow', label: '跟随路径' }
              ]}
              onChange={(value) => setDrawMode(value as StageDrawMode)}
              className="!h-7 !min-w-[116px] !rounded-md !px-2 !text-[11px]"
              title="手绘路径"
            />
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

        <aside className="flex min-h-0 flex-col gap-1.5 overflow-hidden rounded-card border border-border bg-surface p-2 [grid-area:left] max-[720px]:hidden">
          <div className="flex min-h-0 flex-1 flex-col">
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
                  title="打组（Ctrl/Shift 点击多选）"
                  disabled={selectedForGroup.length < 2}
                  onClick={handleGroupSelected}
                >
                  组
                </Button>
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
            <div className="flex min-h-0 flex-1 flex-col gap-[3px] overflow-y-auto pr-1">
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
                    onClick={(event) =>
                      handleObjectClick(
                        object.id,
                        event.ctrlKey || event.metaKey || event.shiftKey
                      )
                    }
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

          <div className="[&+&]:mt-2 flex min-h-0 flex-1 flex-col [&+&]:border-t [&+&]:border-border [&+&]:pt-2">
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
            <div className="flex min-h-0 flex-1 flex-col gap-[3px] overflow-y-auto pr-1">
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

          <div className="[&+&]:mt-2 flex min-h-0 flex-1 flex-col [&+&]:border-t [&+&]:border-border [&+&]:pt-2">
            <div className="flex items-center justify-between px-1 pb-1.5 text-[11px] font-semibold text-fg-muted">
              <span>镜头</span>
              <small className="font-normal text-fg-subtle">
                {doc?.shots.length ?? 0}
              </small>
            </div>
            <div className="flex min-h-0 flex-1 flex-col gap-[3px] overflow-y-auto pr-1">
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
          {drawMode !== 'off' ? (
            <div
              className="absolute inset-0 z-[3] cursor-crosshair"
              onPointerDown={(event) => {
                if (event.button !== 0) return
                const rect = event.currentTarget.getBoundingClientRect()
                drawRectRef.current = rect
                drawingRef.current = true
                setDrawPoints([
                  {
                    x: event.clientX - rect.left,
                    y: event.clientY - rect.top
                  }
                ])
                event.currentTarget.setPointerCapture(event.pointerId)
              }}
              onPointerMove={(event) => {
                if (!drawingRef.current) return
                const rect = event.currentTarget.getBoundingClientRect()
                const next = {
                  x: event.clientX - rect.left,
                  y: event.clientY - rect.top
                }
                setDrawPoints((current) => {
                  const previous = current[current.length - 1]
                  if (
                    previous &&
                    Math.hypot(next.x - previous.x, next.y - previous.y) < 4
                  ) {
                    return current
                  }
                  return [...current, next]
                })
              }}
              onPointerUp={() => finishDraw()}
              onPointerCancel={cancelDraw}
              onContextMenu={(event) => {
                event.preventDefault()
                cancelDraw()
              }}
            >
              {drawPoints.length > 1 ? (
                <svg className="pointer-events-none absolute inset-0 h-full w-full">
                  <polyline
                    points={drawPoints
                      .map((point) => `${point.x},${point.y}`)
                      .join(' ')}
                    fill="none"
                    stroke={
                      drawMode === 'camera'
                        ? '#60a5fa'
                        : drawMode === 'object'
                          ? '#4ade80'
                          : '#f59e0b'
                    }
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : null}
              <div className="pointer-events-none absolute top-2 left-1/2 -translate-x-1/2 rounded-md bg-black/55 px-2 py-1 text-[10px] text-white/80">
                {drawHint}
              </div>
            </div>
          ) : null}
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
          「从参考图生成」会把图片发送给你在设置中配置的多模态文本模型，用于解析场景。
          图片不会上传到 CineLab 服务器；解析结果只写回当前项目。
        </p>
      </Dialog>
    </div>,
    document.body
  )
}
