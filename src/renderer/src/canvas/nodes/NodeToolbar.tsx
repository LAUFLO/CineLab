import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { NODE_META, type NodeKind, type OutputRef } from '@shared/canvas-schema'
import type { ModelDef } from '@shared/provider-schema'
import { outpaintRatioOf, planOutpaint } from '@shared/outpaint'
import { Icon } from '../../components/Icon'
import { Button, MenuItem } from '../../components/ui'
import { assetUrl } from '../../lib/asset-url'
import {
  absolutePosition,
  isGroupNode,
  useCanvasStore
} from '../../stores/canvas'
import { useGenerationStore } from '../../stores/generation'
import { useToolbarStore } from '../../stores/toolbar'
import { useUIStore } from '../../stores/ui'
import { useSettingsStore } from '../../stores/settings'
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
import { VideoCropDialog } from './VideoCropDialog'
import { DepthCaptureDialog } from './DepthCaptureDialog'
import {
  OPERATION_SECTIONS,
  defaultPrimaryForKind,
  operationsForKind,
  type NodeOperation,
  type OperationContext,
  type OperationMenuItem,
  type OperationSection
} from './node-operations'
import {
  executeNodeOperation,
  type NodeOperationUiEffect
} from './node-operation-runner'

interface NodeToolbarProps {
  nodeId: string
  kind: NodeKind
  current: OutputRef
  align?: 'left' | 'center' | 'right'
  onDownload: () => void
  onExpand: () => void
  onEdit?: () => void
  onAudioTrim?: () => void
  onAudioSpeed?: () => void
  libraryAction?: {
    label: string
    title: string
    onClick: () => void
  }
}

const SECTION_ORDER: OperationSection[] = ['generate', 'edit', 'video', 'audio']
const MAX_PRIMARY = 7
const TOOLBAR_BTN =
  '!h-7 gap-[3px] !rounded-md !px-[5px] !text-xs !font-normal'
const TOOLBAR_MENU_ITEM =
  '!min-h-8 !rounded-md !px-2 !py-0 !text-xs !text-fg-muted hover:!text-fg'
const TOOLBAR_MENU_ITEM_DISABLED =
  '!text-fg-subtle hover:!bg-transparent hover:!text-fg-subtle cursor-not-allowed'

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
  onEdit,
  onAudioTrim,
  onAudioSpeed,
  libraryAction
}: NodeToolbarProps) {
  const pinned = useToolbarStore((state) => state.pinned)
  const openSettings = useToolbarStore((state) => state.openSettings)
  const showToast = useUIStore((state) => state.showToast)
  const nodeCommand = useUIStore((state) => state.nodeCommand)
  const consumeNodeCommand = useUIStore((state) => state.consumeNodeCommand)
  const nodeModelKey = useCanvasStore((state) => {
    const found = state.nodes.find((entry) => entry.id === nodeId)
    return found && found.type === 'cine' ? found.data.modelKey : undefined
  })

  const [openId, setOpenId] = useState<string | null>(null)
  const [moreSub, setMoreSub] = useState<{
    opId: string
    top: number
    left: number
  } | null>(null)
  const moreSubCloseTimer = useRef<number | null>(null)
  const lastCommandRef = useRef(0)
  const [running, setRunning] = useState(false)
  const [trimOpen, setTrimOpen] = useState(false)
  const [videoCropDialog, setVideoCropDialog] = useState<{
    defaultRatio: string
  } | null>(null)
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
    purpose: 'crop' | 'cutout' | 'layer-split'
    src: string
    width: number
    height: number
  } | null>(null)
  const [subtitleDialog, setSubtitleDialog] = useState<{
    src: string
    width: number
    height: number
  } | null>(null)
  const [subtitleMode, setSubtitleMode] = useState<'delogo' | 'vision'>(
    'delogo'
  )
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
  // 超出主区上限的默认操作也应该出现在「更多」里，避免被静默隐藏
  const primaryIds = new Set(primaryOps.map((op) => op.id))
  const moreOps = ops.filter((op) => !primaryIds.has(op.id))

  const moreGroups = SECTION_ORDER.map((section) => ({
    section,
    items: moreOps.filter((op) => (op.section ?? 'edit') === section)
  })).filter((group) => group.items.length > 0)

  useEffect(() => {
    if (!openId) return
    document.body.dataset.nodeMenuOpen = ''
    return () => {
      delete document.body.dataset.nodeMenuOpen
    }
  }, [openId])

  const cancelSubClose = (): void => {
    if (moreSubCloseTimer.current === null) return
    window.clearTimeout(moreSubCloseTimer.current)
    moreSubCloseTimer.current = null
  }

  const scheduleSubClose = (): void => {
    cancelSubClose()
    moreSubCloseTimer.current = window.setTimeout(() => {
      moreSubCloseTimer.current = null
      setMoreSub(null)
    }, 140)
  }

  const openSubMenu = (op: NodeOperation, element: HTMLElement): void => {
    cancelSubClose()
    const rect = element.getBoundingClientRect()
    const estimatedHeight = Math.min(360, (op.menu?.length ?? 1) * 34 + 8)
    const left = Math.min(rect.right + 6, window.innerWidth - 196)
    const top = Math.max(
      8,
      Math.min(rect.top, window.innerHeight - estimatedHeight - 8)
    )
    setMoreSub({ opId: op.id, top, left })
  }

  useEffect(() => {
    return () => {
      if (moreSubCloseTimer.current !== null) {
        window.clearTimeout(moreSubCloseTimer.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!openId) {
      setMoreSub(null)
      return
    }

    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target
      if (!(target instanceof Element)) return
      if (target.closest('[data-toolbar-item]')) return
      if (target.closest('[data-toolbar-submenu]')) return
      setOpenId(null)
      setMoreSub(null)
    }

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setOpenId(null)
        setMoreSub(null)
      }
    }

    const onScrollOrResize = (): void => {
      setMoreSub(null)
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    window.addEventListener('scroll', onScrollOrResize, true)
    window.addEventListener('resize', onScrollOrResize)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('scroll', onScrollOrResize, true)
      window.removeEventListener('resize', onScrollOrResize)
    }
  }, [openId])

  const closeMenus = (): void => {
    cancelSubClose()
    setOpenId(null)
    setMoreSub(null)
  }

  const openStudioFromNode = (): void => {
    const studioId = createStudioFromNode(nodeId)
    if (studioId) useStudioStore.getState().openStudio(studioId)
  }

  const sourceNode = (): {
    title: string
    origin: { x: number; y: number }
  } | null => {
    const nodes = useCanvasStore.getState().nodes
    const found = nodes.find((entry) => entry.id === nodeId)
    const node = found && !isGroupNode(found) ? found : undefined
    if (!node) return null
    const width = node.measured?.width ?? NODE_META[node.data.kind].width
    const base = absolutePosition(node, nodes)
    return {
      title: node.data.title,
      origin: { x: base.x + width + 48, y: base.y }
    }
  }

  const createOutputNode = (
    op: NodeOperation,
    label: string
  ): string | null => {
    const source = sourceNode()
    if (!source) return null
    const targetKind: NodeKind = op.kinds.includes('video') ? 'video' : 'image'
    return (
      useCanvasStore
        .getState()
        .addPendingNodes(
          targetKind,
          source.origin,
          1,
          `${source.title} · ${label}`,
          nodeId
        )[0] ?? null
    )
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
      '需要先安装「本地 AI 运行时」和「视觉模型（RVM + LaMa）」',
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

  const executeVisionRepair = async (
    rect: { x: number; y: number; width: number; height: number },
    title: string
  ): Promise<void> => {
    const source = sourceNode()
    if (!source || !(await ensureVision())) return

    const pendingIds = useCanvasStore
      .getState()
      .addPendingNodes(
        'video',
        source.origin,
        1,
        `${source.title} · ${title}`,
        nodeId
      )

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

  const executeCropRect = async (rect: {
    x: number
    y: number
    width: number
    height: number
  }): Promise<void> => {
    setCropDialog(null)
    const source = sourceNode()
    if (!source) return
    const pendingId = useCanvasStore
      .getState()
      .addPendingNodes(
        'image',
        source.origin,
        1,
        `${source.title} · 自由裁剪`,
        nodeId
      )[0]
    setRunning(true)
    showToast('正在裁剪…')

    try {
      const result = await window.api.media.cropImageRect({
        path: current.path,
        ...rect
      })
      useCanvasStore
        .getState()
        .applyOutput(pendingId, result.asset, 'crop-free')
      showToast(
        `裁剪完成：${result.asset.width ?? 0} × ${result.asset.height ?? 0}`
      )
    } catch (error) {
      markFailed(pendingId, error)
      showToast(error instanceof Error ? error.message : String(error), 'error')
    } finally {
      setRunning(false)
    }
  }

  const executeBoxOperation = async (
    purpose: 'cutout' | 'layer-split',
    rect: { x: number; y: number; width: number; height: number }
  ): Promise<void> => {
    setCropDialog(null)
    const source = sourceNode()
    if (!source || !(await ensureVision())) return

    const label = purpose === 'cutout' ? '框选抠图' : '框选分层'
    const pendingIds = useCanvasStore
      .getState()
      .addPendingNodes(
        'image',
        source.origin,
        purpose === 'cutout' ? 1 : 2,
        `${source.title} · ${label}`,
        nodeId
      )

    showToast(`已开始${label}，完成后自动写入节点`)
    await startVisionTask(
      {
        kind: purpose === 'cutout' ? 'matte-image' : 'layer-split',
        path: current.path,
        rect
      },
      {
        mode: 'pending',
        nodeId,
        pendingIds,
        op: purpose === 'cutout' ? 'cutout' : 'layer-split',
        title: label
      }
    )
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
    const source = sourceNode()
    if (!source) return
    const pendingId = useCanvasStore
      .getState()
      .addPendingNodes(
        'video',
        source.origin,
        1,
        `${source.title} · ${subtitleTitle}`,
        nodeId
      )[0]
    setRunning(true)
    showToast('正在框选去字幕…')

    try {
      const result = await window.api.media.removeSubtitles({
        path: current.path,
        ...rect
      })
      useCanvasStore
        .getState()
        .applyOutput(pendingId, result.asset, 'subtitle-box')
      showToast('去字幕完成')
    } catch (error) {
      markFailed(pendingId, error)
      showToast(error instanceof Error ? error.message : String(error), 'error')
    } finally {
      setRunning(false)
    }
  }

  const executeTrim = async (start: number, end: number): Promise<void> => {
    setTrimOpen(false)
    const source = sourceNode()
    if (!source) return
    const pendingId = useCanvasStore
      .getState()
      .addPendingNodes(
        'video',
        source.origin,
        1,
        `${source.title} · 截取`,
        nodeId
      )[0]
    setRunning(true)
    showToast('正在截取…')

    try {
      const result = await window.api.media.trimVideo({
        path: current.path,
        start,
        end
      })
      useCanvasStore.getState().applyOutput(pendingId, result.asset, 'trim')
      showToast(
        `截取完成：${(result.asset.duration ?? end - start).toFixed(1)} 秒`
      )
    } catch (error) {
      markFailed(pendingId, error)
      showToast(error instanceof Error ? error.message : String(error), 'error')
    } finally {
      setRunning(false)
    }
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

    if (opId === 'reverse-prompt') {
      const source = sourceNode()
      if (!source) return
      const targetId = useCanvasStore
        .getState()
        .addPendingNodes(
          'text',
          source.origin,
          1,
          `${source.title} · 提示词`,
          nodeId
        )[0]
      setAiDialog(null)
      if (!targetId) return
      showToast('已提交「反推提示词」')

      void useGenerationStore.getState().run({
        nodeId: targetId,
        modelKey,
        prompt,
        params: { ...defaultParams(model), watermark: false },
        refs: [
          {
            path: current.path,
            role: 'reference',
            media: 'image',
            ...(current.scope ? { scope: current.scope } : {})
          }
        ],
        op: opId
      })
      return
    }

    const targetRatio =
      opId === 'outpaint' ? outpaintRatioOf(aiDialog.item?.id) : undefined
    const baseParams: Record<string, unknown> = {
      ...defaultParams(model),
      watermark: false
    }
    let params: Record<string, unknown> = baseParams
    let finalPrompt = prompt
    let approximateNote: string | undefined
    if (targetRatio) {
      const plan = planOutpaint(model, prompt, targetRatio, baseParams)
      if (!plan.supported) {
        showToast(plan.reason ?? '当前模型不支持这个扩图比例', 'error')
        return
      }
      params = plan.params
      finalPrompt = plan.prompt
      if (plan.exact === false) approximateNote = plan.effective
    }

    const targetNodeId =
      aiDialog.op.outputTarget === 'new-node'
        ? createOutputNode(aiDialog.op, label)
        : nodeId
    setAiDialog(null)
    if (!targetNodeId) return
    showToast(
      approximateNote
        ? `已提交「${label}」生成，将按 ${approximateNote} 近似输出`
        : `已提交「${label}」生成`
    )

    void useGenerationStore.getState().run({
      nodeId: targetNodeId,
      modelKey,
      prompt: finalPrompt,
      params,
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

  const handleSphereConfirm = (
    prompt: string,
    modelKey: string,
    model: ModelDef
  ): void => {
    const label = sphereDialog === 'light' ? '自定义光位' : '自定义机位'
    const targetOp =
      sphereDialog === 'camera'
        ? ops.find((entry) => entry.id === 'multi-angle')
        : ops.find((entry) => entry.id === 'relight')
    const targetNodeId = targetOp
      ? createOutputNode(targetOp, label)
      : nodeId
    setSphereDialog(null)
    if (!targetNodeId) return
    showToast(`已提交「${label}」生成`)

    void useGenerationStore.getState().run({
      nodeId: targetNodeId,
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
      ...(targetOp ? { op: targetOp.id } : {})
    })
  }

  const confirmDepthCapture = async (
    quality: 'fast' | 'standard' | 'long',
    fps: number
  ): Promise<void> => {
    if (!depthDialog) return
    setDepthDialog(null)

    const source = sourceNode()
    if (!source) return

    const pendingId = useCanvasStore
      .getState()
      .addPendingNodes(
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

  const applyUiEffect = (effect: NodeOperationUiEffect): void => {
    if (effect.type === 'crop-dialog') {
      setCropDialog({
        purpose: 'crop',
        src: `cinelab-asset://local/${effect.path}`,
        width: effect.width ?? 1,
        height: effect.height ?? 1
      })
      return
    }
    if (effect.type === 'box-dialog') {
      setCropDialog({
        purpose: effect.purpose,
        src: assetUrl(effect.path, effect.scope),
        width: effect.width ?? 1,
        height: effect.height ?? 1
      })
      return
    }
    if (effect.type === 'trim-dialog') {
      setTrimDuration(effect.duration)
      setTrimOpen(true)
      return
    }
    if (effect.type === 'video-crop-dialog') {
      setVideoCropDialog({ defaultRatio: effect.defaultRatio })
      return
    }
    if (effect.type === 'mask-dialog') {
      setMaskDialog({
        op: effect.op,
        ...(effect.item ? { item: effect.item } : {}),
        prompt: effect.prompt
      })
      return
    }
    if (effect.type === 'ai-dialog') {
      setAiDialog({
        op: effect.op,
        ...(effect.item ? { item: effect.item } : {}),
        prompt: effect.prompt
      })
      return
    }
    if (effect.type === 'subtitle-dialog') {
      setSubtitleMode(effect.mode)
      setSubtitleTitle(effect.title)
      setSubtitleDialog({
        src: assetUrl(effect.path, effect.scope),
        width: effect.width ?? 1,
        height: effect.height ?? 1
      })
      return
    }
    if (effect.type === 'depth-dialog') {
      setDepthDialog({ duration: effect.duration })
      return
    }
    if (effect.type === 'sphere-dialog') {
      setSphereDialog(effect.kind)
      return
    }
    showToast(effect.message, 'error')
    useSettingsStore.getState().openPanel(effect.panel)
  }

  const confirmVideoCrop = (ratio: string): void => {
    setVideoCropDialog(null)
    void executeNodeOperation(
      {
        nodeId,
        operationId: 'video-crop',
        itemId: 'custom',
        params: { ratio }
      },
      {
        effect: applyUiEffect,
        toast: showToast,
        setRunning
      }
    ).then((result) => {
      if (result.ok || result.needsUi || result.needsGeneration) return
      if (result.error) showToast(result.error, 'error')
    })
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

    void executeNodeOperation(
      {
        nodeId,
        operationId: op.id,
        ...(item ? { itemId: item.id } : {})
      },
      {
        effect: applyUiEffect,
        toast: showToast,
        setRunning,
        getCurrentTime: () => {
          const video = document.querySelector<HTMLVideoElement>(
            `.react-flow__node[data-id="${nodeId}"] video`
          )
          return video?.currentTime
        }
      }
    ).then((result) => {
      if (result.ok || result.needsUi || result.needsGeneration) return
      if (result.error) showToast(result.error, 'error')
    })
  }

  const togglePrimaryMenu = (op: NodeOperation): void => {
    const reason = op.disabledReason?.(ctx)
    if (reason) {
      showToast(reason, 'error')
      return
    }
    setMoreSub(null)
    setOpenId((currentId) => (currentId === op.id ? null : op.id))
  }

  useEffect(() => {
    if (!nodeCommand || nodeCommand.nodeId !== nodeId) return
    if (lastCommandRef.current === nodeCommand.nonce) return
    lastCommandRef.current = nodeCommand.nonce
    consumeNodeCommand()

    if (nodeCommand.action === 'expand') {
      onExpand()
      return
    }
    if (nodeCommand.action === 'download') {
      onDownload()
      return
    }
    if (nodeCommand.action === 'library') {
      libraryAction?.onClick()
      return
    }
    if (nodeCommand.action === 'operation' && nodeCommand.opId) {
      const op = ops.find((entry) => entry.id === nodeCommand.opId)
      if (!op) return
      const item = nodeCommand.itemId
        ? op.menu?.find((entry) => entry.id === nodeCommand.itemId)
        : undefined
      activate(op, item)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeCommand, nodeId])

  const cropPurpose = cropDialog?.purpose ?? 'crop'

  return (
    <>
      <div
        className={`nodrag nopan absolute bottom-[calc(100%+var(--node-toolbar-offset,10px))] z-10 flex h-9 items-center gap-px rounded-card border border-border bg-surface px-[5px] text-fg whitespace-nowrap shadow-float ${
          align === 'left'
            ? 'left-0'
            : align === 'right'
              ? 'right-0 left-auto'
              : 'left-1/2 [translate:-50%_0] [transform:scale(var(--canvas-zoom-inverse,1))] [transform-origin:bottom_center]'
        }`}
      >
        {primaryOps.map((op) => {
          const reason = op.disabledReason?.(ctx) ?? null
          const hasMenu = Boolean(op.menu)

          return (
            <div
              data-toolbar-item
              className="relative flex"
              key={`${nodeId}-${op.id}`}
            >
              <Button
                type="button"
                variant="ghost"
                size="none"
                className={`${TOOLBAR_BTN} ${
                  openId === op.id ? 'bg-surface-hover !text-fg' : ''
                } ${
                  reason
                    ? '!text-fg-subtle cursor-not-allowed hover:!bg-transparent hover:!text-fg-subtle'
                    : ''
                }`}
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
              </Button>

              {openId === op.id && op.menu ? (
                <div className="absolute top-[calc(100%+8px)] bottom-auto left-0 z-[80] max-h-[min(360px,55vh)] min-w-[196px] overflow-y-auto rounded-card border border-border bg-surface-raised p-1 whitespace-normal shadow-float">
                  {op.menu.map((item) => (
                    <MenuItem
                      key={item.id}
                      className={TOOLBAR_MENU_ITEM}
                      onSelect={() => activate(op, item)}
                      trailing={
                        item.hint ? (
                          <span className="block max-w-[118px] truncate text-[11px]">
                            {item.hint}
                          </span>
                        ) : undefined
                      }
                    >
                      {item.label}
                    </MenuItem>
                  ))}
                </div>
              ) : null}
            </div>
          )
        })}

        {moreOps.length > 0 ? (
          <div data-toolbar-item className="relative flex">
            <Button
              type="button"
              variant="ghost"
              size="none"
              className={`${TOOLBAR_BTN} ${
                openId === 'more' ? 'bg-surface-hover !text-fg' : ''
              }`}
              onClick={(event) => {
                event.stopPropagation()
                setMoreSub(null)
                setOpenId((currentId) => (currentId === 'more' ? null : 'more'))
              }}
            >
              <Icon name="more" size={14} />
              <span>更多</span>
              <Icon name="chevron-down" size={10} />
            </Button>

            {openId === 'more' ? (
              <div className="absolute top-[calc(100%+8px)] bottom-auto right-0 left-auto z-[80] max-h-[min(360px,55vh)] min-w-[232px] overflow-y-auto rounded-card border border-border bg-surface-raised p-1 whitespace-normal shadow-float">
                {moreGroups.map((group) => (
                  <div key={group.section}>
                    <div className="px-2 pt-1.5 pb-1 text-[11px] text-fg-subtle">
                      {OPERATION_SECTIONS[group.section]}
                    </div>

                    {group.items.map((op) => {
                      const reason = op.disabledReason?.(ctx) ?? null
                      const hasMenu = Boolean(op.menu)

                      return (
                        <div key={op.id}>
                          <MenuItem
                            icon={<Icon name={op.icon} size={14} />}
                            title={reason ?? op.label}
                            className={`${TOOLBAR_MENU_ITEM} ${
                              reason ? TOOLBAR_MENU_ITEM_DISABLED : ''
                            }`}
                            onSelect={(event) => {
                              if (reason) {
                                showToast(reason, 'error')
                                return
                              }
                              if (hasMenu) {
                                if (moreSub?.opId === op.id) {
                                  setMoreSub(null)
                                } else {
                                  openSubMenu(op, event.currentTarget)
                                }
                                return
                              }
                              activate(op)
                            }}
                            onMouseEnter={(event) => {
                              if (reason || !hasMenu) {
                                scheduleSubClose()
                                return
                              }
                              openSubMenu(op, event.currentTarget)
                            }}
                            onMouseLeave={
                              hasMenu ? scheduleSubClose : undefined
                            }
                            trailing={
                              <>
                                {op.hint ? (
                                  <span className="block max-w-[118px] truncate text-[11px]">
                                    {op.hint}
                                  </span>
                                ) : null}
                                {hasMenu ? (
                                  <Icon name="chevron-right" size={11} />
                                ) : null}
                              </>
                            }
                          >
                            {op.label}
                          </MenuItem>
                        </div>
                      )
                    })}
                  </div>
                ))}

                <div className="mt-1 border-t border-divider pt-1">
                  <MenuItem
                    className={TOOLBAR_MENU_ITEM}
                    icon={<Icon name="settings" size={14} />}
                    trailing={<Icon name="chevron-right" size={11} />}
                    onSelect={() => {
                      closeMenus()
                      openSettings(kind)
                    }}
                  >
                    自定义工具栏
                  </MenuItem>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {primaryOps.length > 0 || moreOps.length > 0 ? (
          <span className="mx-1 h-5 w-px bg-divider" />
        ) : null}

        {onEdit ? (
          <>
            <Button
              type="button"
              variant="ghost"
              size="none"
              className={TOOLBAR_BTN}
              title="编辑文本（支持 Markdown）"
              onClick={(event) => {
                event.stopPropagation()
                onEdit()
              }}
            >
              <Icon name="edit" size={14} />
              <span>编辑</span>
            </Button>
            <span className="mx-1 h-5 w-px bg-divider" />
          </>
        ) : null}

        {kind === 'audio' ? (
          <>
            <Button
              type="button"
              variant="ghost"
              size="none"
              className={TOOLBAR_BTN}
              title="截取音频片段"
              onClick={(event) => {
                event.stopPropagation()
                onAudioTrim?.()
              }}
            >
              <Icon name="scissors" size={14} />
              <span>截取</span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="none"
              className={TOOLBAR_BTN}
              title="调整播放速度"
              onClick={(event) => {
                event.stopPropagation()
                onAudioSpeed?.()
              }}
            >
              <Icon name="audio" size={14} />
              <span>变速</span>
            </Button>
            <span className="mx-1 h-5 w-px bg-divider" />
          </>
        ) : null}

        <Button
          type="button"
          variant="ghost"
          size="none"
          className={TOOLBAR_BTN}
          title="用当前节点创建剪辑室"
          onClick={(event) => {
            event.stopPropagation()
            openStudioFromNode()
          }}
        >
          <Icon name="film" size={14} />
          <span>剪辑室</span>
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="none"
          className={TOOLBAR_BTN}
          title="下载素材"
          aria-label="下载素材"
          onClick={(event) => {
            event.stopPropagation()
            onDownload()
          }}
        >
          <Icon name="download" size={14} />
        </Button>

        {kind !== 'audio' ? (
          <Button
            type="button"
            variant="ghost"
            size="none"
            className={TOOLBAR_BTN}
            title={kind === 'text' ? '放大编辑' : '查看大图'}
            aria-label={kind === 'text' ? '放大编辑' : '查看大图'}
            onClick={(event) => {
              event.stopPropagation()
              onExpand()
            }}
          >
            <Icon name="expand" size={14} />
          </Button>
        ) : null}

        {libraryAction ? (
          <Button
            type="button"
            variant="ghost"
            size="none"
            className={TOOLBAR_BTN}
            title={libraryAction.title ?? libraryAction.label}
            aria-label={libraryAction.label}
            onClick={(event) => {
              event.stopPropagation()
              libraryAction.onClick()
            }}
          >
            <Icon name="folder" size={14} />
          </Button>
        ) : null}
      </div>

      {moreSub && openId === 'more'
        ? createPortal(
            <div
              data-toolbar-submenu
              className="fixed z-[320] max-h-[60vh] min-w-[176px] overflow-y-auto rounded-card border border-border bg-surface-raised p-1 whitespace-normal shadow-float"
              style={{ top: moreSub.top, left: moreSub.left }}
              onMouseEnter={cancelSubClose}
              onMouseLeave={scheduleSubClose}
            >
              {ops
                .find((entry) => entry.id === moreSub.opId)
                ?.menu?.map((item) => (
                  <MenuItem
                    key={item.id}
                    className={TOOLBAR_MENU_ITEM}
                    onSelect={() => {
                      const op = ops.find((entry) => entry.id === moreSub.opId)
                      if (op) activate(op, item)
                    }}
                    trailing={
                      item.hint ? (
                        <span className="block max-w-[118px] truncate text-[11px]">
                          {item.hint}
                        </span>
                      ) : undefined
                    }
                  >
                    {item.label}
                  </MenuItem>
                ))}
            </div>,
            document.body
          )
        : null}

      <DepthCaptureDialog
        open={Boolean(depthDialog)}
        duration={depthDialog?.duration ?? 0}
        onClose={() => setDepthDialog(null)}
        onConfirm={(quality, fps) => void confirmDepthCapture(quality, fps)}
      />

      <TrimDialog
        open={trimOpen}
        duration={trimDuration}
        busy={running}
        onClose={() => setTrimOpen(false)}
        onConfirm={(start, end) => void executeTrim(start, end)}
      />

      <VideoCropDialog
        open={Boolean(videoCropDialog)}
        defaultRatio={videoCropDialog?.defaultRatio ?? '16:9'}
        busy={running}
        onClose={() => setVideoCropDialog(null)}
        onConfirm={confirmVideoCrop}
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
        createsNode={
          aiDialog?.op.outputTarget === 'new-node' ||
          aiDialog?.op.id === 'reverse-prompt'
        }
        modelKind={
          aiDialog?.op.id === 'reverse-prompt' ? 'text' : 'image'
        }
        operationKey={
          aiDialog
            ? `${aiDialog.op.id}:${aiDialog.item?.id ?? 'default'}`
            : undefined
        }
        outpaintRatio={
          aiDialog?.op.id === 'outpaint'
            ? outpaintRatioOf(aiDialog.item?.id)
            : undefined
        }
        preferredModelKey={
          aiDialog?.op.id === 'outpaint' ? nodeModelKey : undefined
        }
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
        title={
          cropPurpose === 'cutout'
            ? '框选抠图'
            : cropPurpose === 'layer-split'
              ? '框选分层'
              : undefined
        }
        subtitle={
          cropPurpose === 'cutout'
            ? '拖拽选框，框住要保留的物体'
            : cropPurpose === 'layer-split'
              ? '拖拽选框，框住要分离的物体'
              : undefined
        }
        confirmLabel={
          cropPurpose === 'cutout'
            ? '开始抠图'
            : cropPurpose === 'layer-split'
              ? '开始分层'
              : undefined
        }
        busyLabel={cropPurpose === 'crop' ? undefined : '处理中…'}
        sizeLabel={cropPurpose === 'crop' ? undefined : '选区尺寸'}
        onClose={() => setCropDialog(null)}
        onConfirm={(rect) => {
          if (cropPurpose === 'crop') {
            void executeCropRect(rect)
            return
          }
          void executeBoxOperation(cropPurpose, rect)
        }}
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
