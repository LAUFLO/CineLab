import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { NODE_META, type NodeKind, type OutputRef } from '@shared/canvas-schema'
import type { ModelDef } from '@shared/provider-schema'
import { Icon } from '../../components/Icon'
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
  // 超出主区上限的默认操作也应该出现在「更多」里，避免被静默隐藏
  const primaryIds = new Set(primaryOps.map((op) => op.id))
  const moreOps = ops.filter((op) => !primaryIds.has(op.id))

  const moreGroups = SECTION_ORDER.map((section) => ({
    section,
    items: moreOps.filter((op) => (op.section ?? 'edit') === section)
  })).filter((group) => group.items.length > 0)

  useEffect(() => {
    if (!openId) return
    document.body.classList.add('is-node-menu-open')
    return () => document.body.classList.remove('is-node-menu-open')
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
    const estimatedHeight = Math.min(
      360,
      (op.menu?.length ?? 1) * 34 + 8
    )
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
      if (target.closest('.cnode__toolbar-item')) return
      if (target.closest('.cnode__toolbar-submenu')) return
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

  const executeCropRect = async (rect: {
    x: number
    y: number
    width: number
    height: number
  }): Promise<void> => {
    setCropDialog(null)
    const source = sourceNode()
    if (!source) return
    const pendingId = useCanvasStore.getState().addPendingNodes(
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
    const pendingId = useCanvasStore.getState().addPendingNodes(
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
    const pendingId = useCanvasStore.getState().addPendingNodes(
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
    const targetNodeId =
      aiDialog.op.outputTarget === 'new-node'
        ? createOutputNode(aiDialog.op, label)
        : nodeId
    setAiDialog(null)
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
        : undefined
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
      ]
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

  const applyUiEffect = (effect: NodeOperationUiEffect): void => {
    if (effect.type === 'crop-dialog') {
      setCropDialog({
        src: `cinelab-asset://local/${effect.path}`,
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
              setMoreSub(null)
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
                          onMouseLeave={hasMenu ? scheduleSubClose : undefined}
                        >
                          <Icon name={op.icon} size={14} />
                          <span>{op.label}</span>
                          {op.hint ? (
                            <span className="cnode__toolbar-menu__hint">{op.hint}</span>
                          ) : null}
                          {hasMenu ? <Icon name="chevron-right" size={11} /> : null}
                        </button>
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

      {primaryOps.length > 0 || moreOps.length > 0 ? (
        <span className="cnode__toolbar-divider" />
      ) : null}

      {onEdit ? (
        <>
          <button
            type="button"
            className="cnode__toolbar-btn"
            title="编辑文本（支持 Markdown）"
            onClick={(event) => {
              event.stopPropagation()
              onEdit()
            }}
          >
            <Icon name="edit" size={14} />
            <span>编辑</span>
          </button>
          <span className="cnode__toolbar-divider" />
        </>
      ) : null}

      {kind === 'audio' ? (
        <>
          <button
            type="button"
            className="cnode__toolbar-btn"
            title="截取音频片段"
            onClick={(event) => {
              event.stopPropagation()
              onAudioTrim?.()
            }}
          >
            <Icon name="scissors" size={14} />
            <span>截取</span>
          </button>
          <button
            type="button"
            className="cnode__toolbar-btn"
            title="调整播放速度"
            onClick={(event) => {
              event.stopPropagation()
              onAudioSpeed?.()
            }}
          >
            <Icon name="audio" size={14} />
            <span>变速</span>
          </button>
          <span className="cnode__toolbar-divider" />
        </>
      ) : null}

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

      {kind !== 'audio' ? (
        <button
          type="button"
          className="cnode__toolbar-btn"
          title={kind === 'text' ? '放大编辑' : '查看大图'}
          aria-label={kind === 'text' ? '放大编辑' : '查看大图'}
          onClick={(event) => {
            event.stopPropagation()
            onExpand()
          }}
        >
          <Icon name="expand" size={14} />
        </button>
      ) : null}

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

      {moreSub && openId === 'more'
        ? createPortal(
            <div
              className="cnode__toolbar-submenu"
              style={{ top: moreSub.top, left: moreSub.left }}
              onMouseEnter={cancelSubClose}
              onMouseLeave={scheduleSubClose}
            >
              {ops
                .find((entry) => entry.id === moreSub.opId)
                ?.menu?.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="cnode__toolbar-menu__item"
                    onClick={(event) => {
                      event.stopPropagation()
                      const op = ops.find(
                        (entry) => entry.id === moreSub.opId
                      )
                      if (op) activate(op, item)
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
            </div>,
            document.body
          )
        : null}

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
        createsNode={aiDialog?.op.outputTarget === 'new-node'}
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
