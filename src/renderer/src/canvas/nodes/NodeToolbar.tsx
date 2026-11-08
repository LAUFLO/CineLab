import { useEffect, useState } from 'react'
import { NODE_META, GRID_SPLIT_CELL_WIDTH, type NodeKind, type OutputRef } from '@shared/canvas-schema'
import type { ModelDef } from '@shared/provider-schema'
import { modelSupportsOperation } from '@shared/provider-schema'
import { Icon } from '../../components/Icon'
import { assetUrl } from '../../lib/asset-url'
import { isGroupNode, useCanvasStore } from '../../stores/canvas'
import { useGenerationStore } from '../../stores/generation'
import { useFilmStudyStore } from '../../stores/film-study'
import { useToolbarStore } from '../../stores/toolbar'
import { useUIStore } from '../../stores/ui'
import { useSettingsStore } from '../../stores/settings'
import { useVideoEditStore } from '../../stores/video-edit'
import { useStudioStore } from '../../stores/studio'
import { trackDepthTask } from '../../stores/depth-tasks'
import { trackVisionTask } from '../../stores/vision-tasks'
import { createStudioFromNode } from '../../studio/nodes'
import { AiOperationDialog } from './AiOperationDialog'
import { CropDialog } from './CropDialog'
import { MaskEditorDialog } from './MaskEditorDialog'
import { SphereDialog } from './SphereDialog'
import { SubtitleDialog } from './SubtitleDialog'
import { TrimDialog } from './TrimDialog'
import { DepthCaptureDialog } from './DepthCaptureDialog'
import {
  OPERATION_SECTIONS,
  buildOperationPrompt,
  defaultPrimaryForKind,
  operationsForKind,
  type NodeOperation,
  type OperationContext,
  type OperationMenuItem,
  type OperationSection
} from './node-operations'
import { isVideoOperation, type VideoOperationId } from '@shared/operation-schema'

interface NodeToolbarProps {
  nodeId: string
  kind: NodeKind
  current: OutputRef
  align?: 'left' | 'center' | 'right'
  onDownload: () => void
  onExpand: () => void
  libraryAction?: {
    label: string
    title: string
    onClick: () => void
  }
}

const SECTION_ORDER: OperationSection[] = ['generate', 'edit', 'video']
const MAX_PRIMARY = 6

function defaultParams(model: ModelDef): Record<string, unknown> {
  const values: Record<string, unknown> = {}
  for (const param of model.params) {
    if (param.defaultValue !== undefined) values[param.key] = param.defaultValue
  }
  return values
}

export function NodeToolbar({
  nodeId,
  kind,
  current,
  align = 'center',
  onDownload,
  onExpand,
  libraryAction
}: NodeToolbarProps) {
  const pinned = useToolbarStore((state) => state.pinned)
  const openSettings = useToolbarStore((state) => state.openSettings)
  const showToast = useUIStore((state) => state.showToast)
  const providers = useSettingsStore((state) => state.providers)

  const [openId, setOpenId] = useState<string | null>(null)
  const [moreSubId, setMoreSubId] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [trimOpen, setTrimOpen] = useState(false)
  const [depthDialog, setDepthDialog] = useState<{ duration: number } | null>(
    null
  )
  const [trimDuration, setTrimDuration] = useState(0)
  const [aiDialog, setAiDialog] = useState<{
    op: NodeOperation
    item?: OperationMenuItem
    prompt: string
    mask?: string
  } | null>(null)
  const [maskDialog, setMaskDialog] = useState<{
    op: NodeOperation
    item?: OperationMenuItem
    prompt: string
  } | null>(null)
  const [cropDialog, setCropDialog] = useState<{
    src: string
    width: number
    height: number
  } | null>(null)
  const [subtitleDialog, setSubtitleDialog] = useState<{
    src: string
    width: number
    height: number
  } | null>(null)
  const [subtitleMode, setSubtitleMode] = useState<'delogo' | 'vision'>('delogo')
  const [subtitleTitle, setSubtitleTitle] = useState('框选去字幕')
  const [sphereDialog, setSphereDialog] = useState<'light' | 'camera' | null>(
    null
  )

  const ctx: OperationContext = {
    kind,
    hasOutput: true,
    hasAudio: current.hasAudio
  }

  const ops = operationsForKind(kind)
  const defaultIds = defaultPrimaryForKind(kind)
  const pinnedIds = pinned?.[kind] ?? defaultIds
  const primaryOps = ops
    .filter((op) => pinnedIds.includes(op.id))
    .slice(0, MAX_PRIMARY)
  const moreOps = ops.filter((op) => !pinnedIds.includes(op.id))

  const moreGroups = SECTION_ORDER.map((section) => ({
    section,
    items: moreOps.filter((op) => (op.section ?? 'edit') === section)
  })).filter((group) => group.items.length > 0)

  useEffect(() => {
    if (!openId) return

    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target
      if (!(target instanceof Element)) return
      if (target.closest('.cnode__toolbar-item')) return
      setOpenId(null)
      setMoreSubId(null)
    }

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setOpenId(null)
        setMoreSubId(null)
      }
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [openId])

  const closeMenus = (): void => {
    setOpenId(null)
    setMoreSubId(null)
  }

  const openStudioFromNode = (): void => {
    const studioId = createStudioFromNode(nodeId)
    if (studioId) useStudioStore.getState().openStudio(studioId)
  }

  const sourceNode = (): {
    title: string
    origin: { x: number; y: number }
  } | null => {
    const found = useCanvasStore
      .getState()
      .nodes.find((entry) => entry.id === nodeId)
    const node = found && !isGroupNode(found) ? found : undefined
    if (!node) return null
    const width = node.measured?.width ?? NODE_META[node.data.kind].width
    return {
      title: node.data.title,
      origin: { x: node.position.x + width + 48, y: node.position.y }
    }
  }

  const markRunning = (id: string): void => {
    useCanvasStore
      .getState()
      .patchNodeData(id, { status: 'running', error: undefined })
  }

  const markFailed = (id: string, error: unknown): void => {
    useCanvasStore.getState().patchNodeData(id, {
      status: 'error',
      error: error instanceof Error ? error.message : String(error)
    })
  }

  const visionReady = async (): Promise<boolean> => {
    try {
      const status = await window.api.components.status()
      return (
        status.find((item) => item.kind === 'depth-runtime')?.state ===
          'installed' &&
        status.find((item) => item.kind === 'vision-models')?.state ===
          'installed'
      )
    } catch {
      return false
    }
  }

  const ensureVision = async (): Promise<boolean> => {
    if (await visionReady()) return true
    showToast(
      '需要先安装「深度动作捕捉运行时」和「视觉模型（RVM + LaMa）」',
      'error'
    )
    useSettingsStore.getState().openPanel('components')
    return false
  }

  const startVisionTask = async (
    request: Parameters<typeof window.api.media.startVisionTask>[0],
    meta: Parameters<typeof trackVisionTask>[1]
  ): Promise<void> => {
    try {
      const { taskId } = await window.api.media.startVisionTask({
        ...request,
        ...(current.scope ? { scope: current.scope } : {})
      })
      trackVisionTask(taskId, meta)
    } catch (error) {
      meta.pendingIds.forEach((id) => markFailed(id, error))
      showToast(error instanceof Error ? error.message : String(error), 'error')
    }
  }

  const executeLayerSplit = async (): Promise<void> => {
    const source = sourceNode()
    if (!source || !(await ensureVision())) return

    const pendingIds = useCanvasStore
      .getState()
      .addPendingNodes('image', source.origin, 2, `${source.title} · 图层`, nodeId)

    showToast('已开始图层分离，完成后自动写入节点')
    await startVisionTask(
      { kind: 'layer-split', path: current.path },
      {
        mode: 'pending',
        nodeId,
        pendingIds,
        op: 'layer-split',
        title: '图层分离'
      }
    )
  }

  const executeMatteVideo = async (): Promise<void> => {
    const source = sourceNode()
    if (!source || !(await ensureVision())) return

    const pendingIds = useCanvasStore
      .getState()
      .addPendingNodes('video', source.origin, 1, `${source.title} · 抠像`, nodeId)

    showToast('已开始视频抠像，完成后自动写入节点')
    await startVisionTask(
      { kind: 'matte-video', path: current.path },
      {
        mode: 'pending',
        nodeId,
        pendingIds,
        op: 'matting',
        title: '视频抠像'
      }
    )
  }

  const executeVisionRepair = async (
    rect: { x: number; y: number; width: number; height: number },
    title: string
  ): Promise<void> => {
    const source = sourceNode()
    if (!source || !(await ensureVision())) return

    const pendingIds = useCanvasStore
      .getState()
      .addPendingNodes('video', source.origin, 1, `${source.title} · ${title}`, nodeId)

    showToast(`已开始${title}，完成后自动写入节点`)
    await startVisionTask(
      { kind: 'repair-video', path: current.path, rect },
      {
        mode: 'pending',
        nodeId,
        pendingIds,
        op: title,
        title
      }
    )
  }

  const executeOutpaint = async (item: OperationMenuItem): Promise<void> => {
    if (!(await visionReady())) {
      const op = ops.find((entry) => entry.id === 'outpaint')
      if (op) executeAiOperation(op, item)
      return
    }

    const ratio = item.id as
      | '16:9'
      | '9:16'
      | '1:1'
      | '4:3'
      | '3:4'
      | '21:9'
    showToast(`已开始扩成 ${item.label.replace('扩成 ', '')}`)
    await startVisionTask(
      { kind: 'outpaint-image', path: current.path, ratio },
      {
        mode: 'apply',
        nodeId,
        pendingIds: [],
        op: 'outpaint',
        title: '扩图'
      }
    )
  }

  const executeCutout = async (): Promise<void> => {
    const op = ops.find((entry) => entry.id === 'cutout')
    if (!op) return

    if (!(await visionReady())) {
      executeAiOperation(op)
      return
    }

    showToast('已开始本地抠图')
    await startVisionTask(
      { kind: 'matte-image', path: current.path },
      {
        mode: 'apply',
        nodeId,
        pendingIds: [],
        op: 'cutout',
        title: '抠图'
      }
    )
  }

  const executeGridSplit = async (item: OperationMenuItem): Promise<void> => {
    if (item.id === 'custom') {
      showToast('自定义行列暂未开放')
      return
    }

    const [rows, cols] = item.id.split('x').map(Number)
    if (!rows || !cols) return

    const source = sourceNode()
    if (!source) return

    setRunning(true)
    showToast(`正在切分 ${rows} × ${cols}…`)

    const groupCount = useCanvasStore
      .getState()
      .nodes.filter(isGroupNode).length
    const pendingIds = useCanvasStore.getState().addPendingNodes(
      'image',
      source.origin,
      rows * cols,
      `${source.title} · 切分`,
      nodeId,
      {
        columns: cols,
        cellWidth: GRID_SPLIT_CELL_WIDTH,
        groupTitle: `宫格组 ${groupCount + 1}`,
        groupColor: 'green'
      }
    )

    try {
      const result = await window.api.media.splitGrid({
        path: current.path,
        rows,
        cols
      })
      const state = useCanvasStore.getState()

      result.assets.forEach((asset, index) => {
        const pendingId = pendingIds[index]
        if (pendingId) state.applyOutput(pendingId, asset, `grid-split`)
      })
      showToast(`已生成 ${result.assets.length} 个切分节点`)
    } catch (error) {
      pendingIds.forEach((id) => markFailed(id, error))
      showToast(error instanceof Error ? error.message : String(error), 'error')
    } finally {
      setRunning(false)
    }
  }

  const startFilmStudy = (interval: number): void => {
    const source = sourceNode()
    if (!source) return

    const studyNodeId = useCanvasStore.getState().addNode('study', source.origin)
    useCanvasStore.getState().patchNodeData(studyNodeId, {
      title: `${source.title} · 拉片`,
      status: 'queued',
      progress: 0,
      error: undefined,
      sourceNodeId: nodeId,
      sourcePath: current.path,
      sourceScope: current.scope,
      sourceName: source.title,
      studyInterval: interval
    })

    showToast('已创建拉片节点，正在抽帧…')
    void useFilmStudyStore.getState().start({
      nodeId: studyNodeId,
      path: current.path,
      scope: current.scope,
      interval,
      sourceName: source.title,
      sourceNodeId: nodeId
    })
  }

  const executeFrame = async (item: OperationMenuItem): Promise<void> => {
    const source = sourceNode()
    if (!source) return

    let time: number | undefined
    if (item.id === 'current') {
      const video = document.querySelector<HTMLVideoElement>(
        `.react-flow__node[data-id="${nodeId}"] video`
      )
      time = video?.currentTime ?? 0
    }

    setRunning(true)
    showToast(`正在截取${item.label}…`)

    const pendingId = useCanvasStore.getState().addPendingNodes(
      'image',
      source.origin,
      1,
      `${source.title} · ${item.label}`,
      nodeId
    )[0]

    try {
      const result = await window.api.media.extractFrame({
        path: current.path,
        mode: item.id as 'first' | 'last' | 'current',
        time
      })

      useCanvasStore
        .getState()
        .applyOutput(pendingId, result.asset, `frame-${item.id}`)
      showToast(`已生成${item.label}`)
    } catch (error) {
      markFailed(pendingId, error)
      showToast(error instanceof Error ? error.message : String(error), 'error')
    } finally {
      setRunning(false)
    }
  }

  const executeSplitAv = async (): Promise<void> => {
    const source = sourceNode()
    if (!source) return

    setRunning(true)
    showToast('正在分离音视频…')

    const state = useCanvasStore.getState()
    const pendingVideoId = state.addPendingNodes(
      'video',
      source.origin,
      1,
      `${source.title} · 无声`,
      nodeId
    )[0]
    const pendingAudioId = state.addPendingNodes(
      'audio',
      { x: source.origin.x, y: source.origin.y + 420 },
      1,
      `${source.title} · 音轨`,
      nodeId
    )[0]

    const groupCount = useCanvasStore
      .getState()
      .nodes.filter(isGroupNode).length
    state.createGroupFromNodes([pendingVideoId, pendingAudioId], {
      columns: 1,
      title: `音视频组 ${groupCount + 1}`,
      color: 'cyan'
    })

    try {
      const result = await window.api.media.splitAv({ path: current.path })

      useCanvasStore
        .getState()
        .applyOutput(pendingVideoId, result.video, 'split-av-video')
      if (result.audio) {
        useCanvasStore
          .getState()
          .applyOutput(pendingAudioId, result.audio, 'split-av-audio')
      } else {
        markFailed(pendingAudioId, '当前视频无音轨')
      }

      showToast(
        result.audio ? '已生成无声视频和音轨节点' : '已生成无声视频节点'
      )
    } catch (error) {
      markFailed(pendingVideoId, error)
      markFailed(pendingAudioId, error)
      showToast(error instanceof Error ? error.message : String(error), 'error')
    } finally {
      setRunning(false)
    }
  }

  const executeVideoCrop = async (item: OperationMenuItem): Promise<void> => {
    if (item.id === 'source') {
      showToast('当前已是原比例，无需裁切')
      return
    }

    setRunning(true)
    markRunning(nodeId)
    showToast(`正在裁切为 ${item.label}…`)

    try {
      const result = await window.api.media.cropVideo({
        path: current.path,
        ratio: item.id
      })
      useCanvasStore.getState().applyOutput(nodeId, result.asset, 'video-crop')
      showToast(
        `裁切完成：${result.asset.width ?? 0} × ${result.asset.height ?? 0}`
      )
    } catch (error) {
      markFailed(nodeId, error)
      showToast(error instanceof Error ? error.message : String(error), 'error')
    } finally {
      setRunning(false)
    }
  }

  const executeCrop = async (item: OperationMenuItem): Promise<void> => {
    if (item.id === 'free') {
      void openFreeCrop()
      return
    }

    setRunning(true)
    markRunning(nodeId)
    showToast(`正在裁剪为 ${item.label}…`)

    try {
      const result = await window.api.media.cropImage({
        path: current.path,
        ratio: item.id
      })
      useCanvasStore.getState().applyOutput(nodeId, result.asset, 'crop')
      showToast(
        `裁剪完成：${result.asset.width ?? 0} × ${result.asset.height ?? 0}`
      )
    } catch (error) {
      markFailed(nodeId, error)
      showToast(error instanceof Error ? error.message : String(error), 'error')
    } finally {
      setRunning(false)
    }
  }

  const openFreeCrop = async (): Promise<void> => {
    const width = current.width
    const height = current.height

    if (width && height) {
      setCropDialog({
        src: `cinelab-asset://local/${current.path}`,
        width,
        height
      })
      return
    }

    setRunning(true)
    try {
      const probe = await window.api.media.probe(current.path)
      if (!probe.width || !probe.height) {
        showToast('无法读取图片尺寸', 'error')
        return
      }
      setCropDialog({
        src: `cinelab-asset://local/${current.path}`,
        width: probe.width,
        height: probe.height
      })
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), 'error')
    } finally {
      setRunning(false)
    }
  }

  const executeCropRect = async (rect: {
    x: number
    y: number
    width: number
    height: number
  }): Promise<void> => {
    setCropDialog(null)
    setRunning(true)
    markRunning(nodeId)
    showToast('正在裁剪…')

    try {
      const result = await window.api.media.cropImageRect({
        path: current.path,
        ...rect
      })
      useCanvasStore.getState().applyOutput(nodeId, result.asset, 'crop-free')
      showToast(
        `裁剪完成：${result.asset.width ?? 0} × ${result.asset.height ?? 0}`
      )
    } catch (error) {
      markFailed(nodeId, error)
      showToast(error instanceof Error ? error.message : String(error), 'error')
    } finally {
      setRunning(false)
    }
  }

  const openSubtitleBox = async (
    mode: 'delogo' | 'vision' = 'delogo',
    title = '框选去字幕'
  ): Promise<void> => {
    setSubtitleMode(mode)
    setSubtitleTitle(title)
    const width = current.width
    const height = current.height

    if (width && height) {
      setSubtitleDialog({
        src: assetUrl(current.path, current.scope),
        width,
        height
      })
      return
    }

    setRunning(true)
    try {
      const probe = await window.api.media.probe(current.path)
      if (!probe.width || !probe.height) {
        showToast('无法读取视频尺寸', 'error')
        return
      }
      setSubtitleDialog({
        src: assetUrl(current.path, current.scope),
        width: probe.width,
        height: probe.height
      })
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), 'error')
    } finally {
      setRunning(false)
    }
  }

  const executeSubtitleBox = async (rect: {
    x: number
    y: number
    width: number
    height: number
  }): Promise<void> => {
    if (subtitleMode === 'vision') {
      setSubtitleDialog(null)
      void executeVisionRepair(rect, subtitleTitle)
      return
    }

    setSubtitleDialog(null)
    setRunning(true)
    markRunning(nodeId)
    showToast('正在框选去字幕…')

    try {
      const result = await window.api.media.removeSubtitles({
        path: current.path,
        ...rect
      })
      useCanvasStore.getState().applyOutput(nodeId, result.asset, 'subtitle-box')
      showToast('去字幕完成')
    } catch (error) {
      markFailed(nodeId, error)
      showToast(error instanceof Error ? error.message : String(error), 'error')
    } finally {
      setRunning(false)
    }
  }

  const openTrim = async (): Promise<void> => {
    if (current.duration && current.duration > 0) {
      setTrimDuration(current.duration)
      setTrimOpen(true)
      return
    }

    setRunning(true)
    try {
      const probe = await window.api.media.probe(current.path)
      if (!probe.duration) {
        showToast('无法读取视频时长', 'error')
        return
      }
      setTrimDuration(probe.duration)
      setTrimOpen(true)
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), 'error')
    } finally {
      setRunning(false)
    }
  }

  const executeTrim = async (start: number, end: number): Promise<void> => {
    setTrimOpen(false)
    setRunning(true)
    markRunning(nodeId)
    showToast('正在截取…')

    try {
      const result = await window.api.media.trimVideo({
        path: current.path,
        start,
        end
      })
      useCanvasStore.getState().applyOutput(nodeId, result.asset, 'trim')
      showToast(
        `截取完成：${(result.asset.duration ?? end - start).toFixed(1)} 秒`
      )
    } catch (error) {
      markFailed(nodeId, error)
      showToast(error instanceof Error ? error.message : String(error), 'error')
    } finally {
      setRunning(false)
    }
  }

  const executeAiOperation = (
    op: NodeOperation,
    item?: OperationMenuItem
  ): void => {
    const prompt = buildOperationPrompt(op, item)
    if (!prompt) {
      showToast(`《${item?.label ?? op.label}》缺少提示词配置`, 'error')
      return
    }
    if (op.mask) {
      setMaskDialog({ op, item, prompt })
      return
    }
    setAiDialog({ op, item, prompt })
  }

  const handleAiConfirm = (
    prompt: string,
    modelKey: string,
    model: ModelDef,
    mask?: string
  ): void => {
    if (!aiDialog) return

    const label = aiDialog.item?.label ?? aiDialog.op.label
    const opId = aiDialog.op.id
    setAiDialog(null)
    showToast(`已提交「${label}」生成`)

    void useGenerationStore.getState().run({
      nodeId,
      modelKey,
      prompt,
      params: { ...defaultParams(model), watermark: false },
      refs: [
        {
          path: current.path,
          role: 'reference',
          ...(current.scope ? { scope: current.scope } : {})
        }
      ],
      ...(mask ? { mask } : {}),
      op: opId
    })
  }

  const executeDedicatedVideo = (op: NodeOperation): void => {
    if (!isVideoOperation(op.id)) return

    const operationId = op.id as VideoOperationId
    const supported = providers.some((provider) =>
      provider.models.some(
        (model) =>
          model.capability === 'video.t2v' &&
          model.adapter === 'http-template' &&
          model.template &&
          modelSupportsOperation(model, operationId)
      )
    )

    if (!supported) {
      showToast(
        `还没有支持「${op.label}」的视频接口，请先在设置 → 模型服务中声明支持的操作`,
        'error'
      )
      useSettingsStore.getState().openPanel('models')
      return
    }

    useVideoEditStore.getState().openPanel(nodeId, operationId)
  }

  const handleSphereConfirm = (
    prompt: string,
    modelKey: string,
    model: ModelDef
  ): void => {
    const label = sphereDialog === 'light' ? '自定义光位' : '自定义机位'
    setSphereDialog(null)
    showToast(`已提交「${label}」生成`)

    void useGenerationStore.getState().run({
      nodeId,
      modelKey,
      prompt,
      params: { ...defaultParams(model), watermark: false },
      refs: [
        {
          path: current.path,
          role: 'reference',
          ...(current.scope ? { scope: current.scope } : {})
        }
      ]
    })
  }

  const openDepthDialog = async (): Promise<void> => {
    try {
      const status = await window.api.components.status()
      const ready =
        status.find((item) => item.kind === 'depth-runtime')?.state ===
          'installed' &&
        status.find((item) => item.kind === 'depth-model')?.state ===
          'installed'

      if (!ready) {
        useUIStore.getState().requestConfirm({
          title: '需要先安装深度组件',
          message:
            '「深度动作捕捉」需要「深度动作捕捉运行时」和「Video Depth Anything Small 模型」，合计约 375MB。是否前往设置安装？',
          confirmLabel: '前往设置',
          onConfirm: () => {
            useSettingsStore.getState().openPanel('components')
          }
        })
        return
      }

      const probe = await window.api.media.probe(current.path).catch((error: unknown) => {
        console.error('[depth] failed to probe video', error)
        return null
      })
      if (!probe) {
        showToast('无法读取视频信息，请确认素材文件仍然存在', 'error')
        return
      }
      if (!probe.duration) {
        showToast('无法读取视频时长，请确认素材文件仍然存在', 'error')
        return
      }
      setDepthDialog({ duration: probe.duration })
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), 'error')
    }
  }

  const confirmDepthCapture = async (
    quality: 'fast' | 'standard' | 'long',
    fps: number
  ): Promise<void> => {
    if (!depthDialog) return
    setDepthDialog(null)

    const source = sourceNode()
    if (!source) return

    const pendingId = useCanvasStore.getState().addPendingNodes(
      'video',
      source.origin,
      1,
      `${source.title} · 深度`,
      nodeId
    )[0]

    try {
      const { taskId } = await window.api.media.startDepthCapture({
        path: current.path,
        quality,
        fps
      })
      trackDepthTask(taskId, {
        nodeId,
        pendingNodeId: pendingId,
        title: source.title
      })
      showToast('已开始深度动作捕捉，完成后自动写入节点')
    } catch (error) {
      markFailed(pendingId, error)
      showToast(error instanceof Error ? error.message : String(error), 'error')
    }
  }

  const activate = (op: NodeOperation, item?: OperationMenuItem): void => {
    if (running) return

    const reason = op.disabledReason?.(ctx)
    if (reason) {
      showToast(reason, 'error')
      return
    }
    if (item?.disabled) return

    closeMenus()

    if (!op.implemented) {
      const label = item?.label ?? op.label
      if (op.requires) {
        showToast(`《${label}》${op.requires.label}`, 'error')
        if (op.requires.panel) {
          useSettingsStore.getState().openPanel(op.requires.panel)
        }
      } else {
        showToast(`《${label}》暂不可用`, 'error')
      }
      return
    }

    if (op.id === 'grid-split' && item) {
      void executeGridSplit(item)
      return
    }

    if (op.id === 'film-study' && item) {
      startFilmStudy(Number(item.id))
      return
    }

    if (op.id === 'frame-study' && item) {
      void executeFrame(item)
      return
    }

    if (op.id === 'crop' && item) {
      void executeCrop(item)
      return
    }

    if (op.id === 'clip-trim') {
      void openTrim()
      return
    }

    if (op.id === 'split-av') {
      void executeSplitAv()
      return
    }

    if (op.id === 'motion-capture') {
      void openDepthDialog()
      return
    }

    if (op.id === 'video-crop' && item) {
      void executeVideoCrop(item)
      return
    }

    if (op.id === 'subtitle') {
      if (item?.id === 'box') {
        void openSubtitleBox('delogo', '框选去字幕')
        return
      }
      void (async () => {
        if (await ensureVision()) {
          await openSubtitleBox('vision', '智能去字幕')
        }
      })()
      return
    }

    if (op.id === 'layer-split') {
      void executeLayerSplit()
      return
    }

    if (op.id === 'matting') {
      void executeMatteVideo()
      return
    }

    if (op.id === 'object-remove') {
      void (async () => {
        if (await ensureVision()) {
          await openSubtitleBox('vision', '主体消除')
        }
      })()
      return
    }

    if (op.id === 'outpaint' && item) {
      void executeOutpaint(item)
      return
    }

    if (op.id === 'cutout') {
      void executeCutout()
      return
    }

    if (op.id === 'relight' && item?.id === 'custom') {
      setSphereDialog('light')
      return
    }

    if (op.id === 'multi-angle' && item?.id === 'custom') {
      setSphereDialog('camera')
      return
    }

    if (isVideoOperation(op.id)) {
      executeDedicatedVideo(op)
      return
    }

    if (op.prompt || op.promptByItem) {
      executeAiOperation(op, item)
      return
    }

    showToast(`《${item?.label ?? op.label}》暂不可用`, 'error')
  }

  const togglePrimaryMenu = (op: NodeOperation): void => {
    const reason = op.disabledReason?.(ctx)
    if (reason) {
      showToast(reason, 'error')
      return
    }
    setMoreSubId(null)
    setOpenId((currentId) => (currentId === op.id ? null : op.id))
  }

  return (
    <>
      <div
        className={`cnode__toolbar nodrag nopan ${
          align === 'left' ? 'is-left' : align === 'right' ? 'is-right' : ''
        }`}
      >
      {primaryOps.map((op) => {
        const reason = op.disabledReason?.(ctx) ?? null
        const hasMenu = Boolean(op.menu)

        return (
          <div className="cnode__toolbar-item" key={`${nodeId}-${op.id}`}>
            <button
              type="button"
              className={`cnode__toolbar-btn ${
                openId === op.id ? 'is-active' : ''
              } ${reason ? 'is-disabled' : ''}`}
              title={reason ?? op.label}
              aria-disabled={Boolean(reason)}
              onClick={(event) => {
                event.stopPropagation()
                if (hasMenu) togglePrimaryMenu(op)
                else activate(op)
              }}
            >
              <Icon name={op.icon} size={14} />
              <span>{op.label}</span>
              {hasMenu ? <Icon name="chevron-down" size={10} /> : null}
            </button>

            {openId === op.id && op.menu ? (
              <div className="cnode__toolbar-menu">
                {op.menu.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="cnode__toolbar-menu__item"
                    onClick={(event) => {
                      event.stopPropagation()
                      activate(op, item)
                    }}
                  >
                    <span>{item.label}</span>
                    {item.hint ? (
                      <span className="cnode__toolbar-menu__hint">{item.hint}</span>
                    ) : null}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        )
      })}

      {moreOps.length > 0 ? (
        <div className="cnode__toolbar-item">
          <button
            type="button"
            className={`cnode__toolbar-btn ${openId === 'more' ? 'is-active' : ''}`}
            onClick={(event) => {
              event.stopPropagation()
              setMoreSubId(null)
              setOpenId((currentId) => (currentId === 'more' ? null : 'more'))
            }}
          >
            <Icon name="more" size={14} />
            <span>更多</span>
            <Icon name="chevron-down" size={10} />
          </button>

          {openId === 'more' ? (
            <div className="cnode__toolbar-menu is-right is-more">
              {moreGroups.map((group) => (
                <div className="cnode__toolbar-menu__section" key={group.section}>
                  <div className="cnode__toolbar-menu__section-title">
                    {OPERATION_SECTIONS[group.section]}
                  </div>

                  {group.items.map((op) => {
                    const reason = op.disabledReason?.(ctx) ?? null
                    const hasMenu = Boolean(op.menu)

                    return (
                      <div key={op.id}>
                        <button
                          type="button"
                          className={`cnode__toolbar-menu__item ${
                            reason ? 'is-disabled' : ''
                          }`}
                          title={reason ?? op.label}
                          onClick={(event) => {
                            event.stopPropagation()
                            if (reason) {
                              showToast(reason, 'error')
                              return
                            }
                            if (hasMenu) {
                              setMoreSubId((currentId) =>
                                currentId === op.id ? null : op.id
                              )
                              return
                            }
                            activate(op)
                          }}
                        >
                          <Icon name={op.icon} size={14} />
                          <span>{op.label}</span>
                          {op.hint ? (
                            <span className="cnode__toolbar-menu__hint">{op.hint}</span>
                          ) : null}
                          {hasMenu ? <Icon name="chevron-right" size={11} /> : null}
                        </button>

                        {hasMenu && moreSubId === op.id ? (
                          <div className="cnode__toolbar-menu__sub">
                            {op.menu?.map((item) => (
                              <button
                                key={item.id}
                                type="button"
                                className="cnode__toolbar-menu__item"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  activate(op, item)
                                }}
                              >
                                <span>{item.label}</span>
                                {item.hint ? (
                                  <span className="cnode__toolbar-menu__hint">
                                    {item.hint}
                                  </span>
                                ) : null}
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              ))}

              <div className="cnode__toolbar-menu__footer">
                <button
                  type="button"
                  className="cnode__toolbar-menu__item"
                  onClick={(event) => {
                    event.stopPropagation()
                    closeMenus()
                    openSettings(kind)
                  }}
                >
                  <Icon name="settings" size={14} />
                  <span>自定义工具栏</span>
                  <Icon name="chevron-right" size={11} />
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <span className="cnode__toolbar-divider" />

      <button
        type="button"
        className="cnode__toolbar-btn"
        title="用当前节点创建剪辑室"
        onClick={(event) => {
          event.stopPropagation()
          openStudioFromNode()
        }}
      >
        <Icon name="film" size={14} />
        <span>剪辑室</span>
      </button>

      <button
        type="button"
        className="cnode__toolbar-btn"
        title="下载素材"
        aria-label="下载素材"
        onClick={(event) => {
          event.stopPropagation()
          onDownload()
        }}
      >
        <Icon name="download" size={14} />
      </button>

      <button
        type="button"
        className="cnode__toolbar-btn"
        title="查看大图"
        aria-label="查看大图"
        onClick={(event) => {
          event.stopPropagation()
          onExpand()
        }}
      >
        <Icon name="expand" size={14} />
      </button>

      {libraryAction ? (
        <button
          type="button"
          className="cnode__toolbar-btn"
          title={libraryAction.title}
          aria-label={libraryAction.label}
          onClick={(event) => {
            event.stopPropagation()
            libraryAction.onClick()
          }}
        >
          <Icon name="folder" size={14} />
        </button>
      ) : null}
      </div>

      <DepthCaptureDialog
        open={Boolean(depthDialog)}
        duration={depthDialog?.duration ?? 0}
        onClose={() => setDepthDialog(null)}
        onConfirm={(quality, fps) =>
          void confirmDepthCapture(quality, fps)
        }
      />

      <TrimDialog
        open={trimOpen}
        duration={trimDuration}
        busy={running}
        onClose={() => setTrimOpen(false)}
        onConfirm={(start, end) => void executeTrim(start, end)}
      />

      <AiOperationDialog
        open={Boolean(aiDialog)}
        title={
          aiDialog
            ? `${aiDialog.op.label}${
                aiDialog.item ? ` · ${aiDialog.item.label}` : ''
              }`
            : ''
        }
        initialPrompt={aiDialog?.prompt ?? ''}
        busy={running}
        masked={Boolean(aiDialog?.mask)}
        onClose={() => setAiDialog(null)}
        onConfirm={(prompt, key, model) =>
          handleAiConfirm(prompt, key, model, aiDialog?.mask)
        }
      />

      <MaskEditorDialog
        open={Boolean(maskDialog)}
        title={
          maskDialog
            ? `${maskDialog.op.label}${
                maskDialog.item ? ` · ${maskDialog.item.label}` : ''
              }`
            : ''
        }
        subtitle={
          maskDialog?.op.id === 'erase'
            ? '涂抹要移除的对象，模型会用周围背景补全'
            : maskDialog?.op.id === 'element-edit'
              ? '框选或涂抹要修改的元素，然后描述希望变成什么样'
              : '涂抹要重绘的区域，透明区域会交给模型编辑'
        }
        src={assetUrl(current.path, current.scope)}
        imageWidth={current.width ?? 1024}
        imageHeight={current.height ?? 1024}
        busy={running}
        onClose={() => setMaskDialog(null)}
        onConfirm={(mask) => {
          if (!maskDialog) return
          const pending = maskDialog
          setMaskDialog(null)
          setAiDialog({ ...pending, mask })
        }}
      />

      <CropDialog
        open={Boolean(cropDialog)}
        src={cropDialog?.src ?? ''}
        imageWidth={cropDialog?.width ?? 1}
        imageHeight={cropDialog?.height ?? 1}
        busy={running}
        onClose={() => setCropDialog(null)}
        onConfirm={(rect) => void executeCropRect(rect)}
      />

      <SubtitleDialog
        open={Boolean(subtitleDialog)}
        title={subtitleTitle}
        src={subtitleDialog?.src ?? ''}
        videoWidth={subtitleDialog?.width ?? 1}
        videoHeight={subtitleDialog?.height ?? 1}
        busy={running}
        onClose={() => setSubtitleDialog(null)}
        onConfirm={(rect) => void executeSubtitleBox(rect)}
      />

      <SphereDialog
        open={Boolean(sphereDialog)}
        mode={sphereDialog ?? 'light'}
        busy={running}
        onClose={() => setSphereDialog(null)}
        onConfirm={handleSphereConfirm}
      />
    </>
  )
}
