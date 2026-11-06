import { useEffect, useState } from 'react'
import { NODE_META, type NodeKind, type OutputRef } from '@shared/canvas-schema'
import type { ModelDef } from '@shared/provider-schema'
import { Icon } from '../../components/Icon'
import { isGroupNode, useCanvasStore } from '../../stores/canvas'
import { useGenerationStore } from '../../stores/generation'
import { useToolbarStore } from '../../stores/toolbar'
import { useUIStore } from '../../stores/ui'
import { useSettingsStore } from '../../stores/settings'
import { trackDepthTask } from '../../stores/depth-tasks'
import { AiOperationDialog } from './AiOperationDialog'
import { CropDialog } from './CropDialog'
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

interface NodeToolbarProps {
  nodeId: string
  kind: NodeKind
  current: OutputRef
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
  onDownload,
  onExpand,
  libraryAction
}: NodeToolbarProps) {
  const pinned = useToolbarStore((state) => state.pinned)
  const openSettings = useToolbarStore((state) => state.openSettings)
  const showToast = useUIStore((state) => state.showToast)

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

  const executeGridSplit = async (item: OperationMenuItem): Promise<void> => {
    if (item.id === 'custom') {
      showToast('自定义行列暂未开放')
      return
    }

    const [rows, cols] = item.id.split('x').map(Number)
    if (!rows || !cols) return

    const found = useCanvasStore
      .getState()
      .nodes.find((entry) => entry.id === nodeId)
    const node = found && !isGroupNode(found) ? found : undefined
    if (!node) return

    setRunning(true)
    showToast(`正在切分 ${rows} × ${cols}…`)

    try {
      const result = await window.api.media.splitGrid({
        path: current.path,
        rows,
        cols
      })
      const width = node.measured?.width ?? NODE_META[node.data.kind].width

      useCanvasStore.getState().addAssetNodes(
        'image',
        { x: node.position.x + width + 48, y: node.position.y },
        result.assets,
        `${node.data.title} · 切分`,
        nodeId
      )
      showToast(`已生成 ${result.assets.length} 个切分节点`)
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), 'error')
    } finally {
      setRunning(false)
    }
  }

  const executeFrame = async (item: OperationMenuItem): Promise<void> => {
    const found = useCanvasStore
      .getState()
      .nodes.find((entry) => entry.id === nodeId)
    const node = found && !isGroupNode(found) ? found : undefined
    if (!node) return

    let time: number | undefined
    if (item.id === 'current') {
      const video = document.querySelector<HTMLVideoElement>(
        `.react-flow__node[data-id="${nodeId}"] video`
      )
      time = video?.currentTime ?? 0
    }

    setRunning(true)
    showToast(`正在截取${item.label}…`)

    try {
      const result = await window.api.media.extractFrame({
        path: current.path,
        mode: item.id as 'first' | 'last' | 'current',
        time
      })
      const width = node.measured?.width ?? NODE_META[node.data.kind].width

      useCanvasStore.getState().addAssetNodes(
        'image',
        { x: node.position.x + width + 48, y: node.position.y },
        [result.asset],
        `${node.data.title} · ${item.label}`,
        nodeId
      )
      showToast(`已生成${item.label}`)
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), 'error')
    } finally {
      setRunning(false)
    }
  }

  const executeSplitAv = async (): Promise<void> => {
    const found = useCanvasStore
      .getState()
      .nodes.find((entry) => entry.id === nodeId)
    const node = found && !isGroupNode(found) ? found : undefined
    if (!node) return

    setRunning(true)
    showToast('正在分离音视频…')

    try {
      const result = await window.api.media.splitAv({ path: current.path })
      const width = node.measured?.width ?? NODE_META[node.data.kind].width
      const origin = { x: node.position.x + width + 48, y: node.position.y }

      useCanvasStore.getState().addAssetNodes(
        'video',
        origin,
        [result.video],
        `${node.data.title} · 无声`,
        nodeId
      )

      if (result.audio) {
        useCanvasStore.getState().addAssetNodes(
          'audio',
          { x: origin.x, y: origin.y + 420 },
          [result.audio],
          `${node.data.title} · 音轨`,
          nodeId
        )
      }

      showToast(
        result.audio ? '已生成无声视频和音轨节点' : '已生成无声视频节点'
      )
    } catch (error) {
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
      showToast(error instanceof Error ? error.message : String(error), 'error')
    } finally {
      setRunning(false)
    }
  }

  const openSubtitleBox = async (): Promise<void> => {
    const width = current.width
    const height = current.height

    if (width && height) {
      setSubtitleDialog({
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
        showToast('无法读取视频尺寸', 'error')
        return
      }
      setSubtitleDialog({
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

  const executeSubtitleBox = async (rect: {
    x: number
    y: number
    width: number
    height: number
  }): Promise<void> => {
    setSubtitleDialog(null)
    setRunning(true)
    showToast('正在框选去字幕…')

    try {
      const result = await window.api.media.removeSubtitles({
        path: current.path,
        ...rect
      })
      useCanvasStore.getState().applyOutput(nodeId, result.asset, 'subtitle-box')
      showToast('去字幕完成')
    } catch (error) {
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
      showToast(`《${item?.label ?? op.label}》正在接入`)
      return
    }
    setAiDialog({ op, item, prompt })
  }

  const handleAiConfirm = (
    prompt: string,
    modelKey: string,
    model: ModelDef
  ): void => {
    if (!aiDialog) return

    const label = aiDialog.item?.label ?? aiDialog.op.label
    setAiDialog(null)
    showToast(`已提交「${label}」生成`)

    void useGenerationStore.getState().run({
      nodeId,
      modelKey,
      prompt,
      params: { ...defaultParams(model), watermark: false },
      refs: [{ path: current.path, role: 'reference' }]
    })
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
      refs: [{ path: current.path, role: 'reference' }]
    })
  }

  const openDepthDialog = async (): Promise<void> => {
    try {
      const [status, probe] = await Promise.all([
        window.api.components.status(),
        window.api.media.probe(current.path)
      ])
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

      if (!probe.duration) {
        showToast('无法读取视频时长', 'error')
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

    try {
      const { taskId } = await window.api.media.startDepthCapture({
        path: current.path,
        quality,
        fps
      })
      const node = useCanvasStore
        .getState()
        .nodes.find((entry) => entry.id === nodeId)
      trackDepthTask(taskId, {
        nodeId,
        title: node && !isGroupNode(node) ? node.data.title : '视频'
      })
      showToast('已开始深度动作捕捉，完成后自动创建节点')
    } catch (error) {
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
      showToast(`《${item?.label ?? op.label}》正在接入`)
      return
    }

    if (op.id === 'grid-split' && item) {
      void executeGridSplit(item)
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
        void openSubtitleBox()
        return
      }
      showToast('智能去字幕需要视频修复模型，暂未接入')
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

    if (op.prompt || op.promptByItem) {
      executeAiOperation(op, item)
      return
    }

    showToast(`《${item?.label ?? op.label}》正在接入`)
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
      <div className="cnode__toolbar nodrag nopan">
      {current.width && current.height ? (
        <span className="cnode__toolbar-size">
          {current.width} × {current.height}
        </span>
      ) : null}

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
              <Icon name={op.icon} size={15} />
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
            <Icon name="more" size={15} />
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
        title="下载素材"
        onClick={(event) => {
          event.stopPropagation()
          onDownload()
        }}
      >
        <Icon name="download" size={15} />
        <span>下载</span>
      </button>

      <button
        type="button"
        className="cnode__toolbar-btn"
        title="查看大图"
        onClick={(event) => {
          event.stopPropagation()
          onExpand()
        }}
      >
        <Icon name="expand" size={14} />
        <span>展开</span>
      </button>

      {libraryAction ? (
        <button
          type="button"
          className="cnode__toolbar-btn"
          title={libraryAction.title}
          onClick={(event) => {
            event.stopPropagation()
            libraryAction.onClick()
          }}
        >
          <Icon name="folder" size={14} />
          <span>{libraryAction.label}</span>
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
        onClose={() => setAiDialog(null)}
        onConfirm={handleAiConfirm}
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
