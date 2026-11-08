import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useReactFlow, useViewport } from '@xyflow/react'
import {
  NODE_META,
  TITLE_HEIGHT,
  type OutputRef
} from '@shared/canvas-schema'
import {
  modelSupportsOperation,
  type ModelDef
} from '@shared/provider-schema'
import {
  VIDEO_OPERATIONS,
  type VideoOperationId
} from '@shared/operation-schema'
import type { ReferenceInput } from '@shared/generation'
import { Icon } from '../../components/Icon'
import { assetUrl } from '../../lib/asset-url'
import {
  absolutePosition,
  type CineNode,
  useCanvasStore
} from '../../stores/canvas'
import { useGenerationStore } from '../../stores/generation'
import { useLibraryStore } from '../../stores/library'
import { useSettingsStore } from '../../stores/settings'
import { useUIStore } from '../../stores/ui'
import { useVideoEditStore } from '../../stores/video-edit'

const PANEL_WIDTH = 380

interface ImageOption {
  path: string
  scope: ReferenceInput['scope']
  name: string
  thumb: string
}

function defaultParams(model: ModelDef): Record<string, unknown> {
  const values: Record<string, unknown> = {}
  for (const param of model.params) {
    if (param.defaultValue !== undefined) values[param.key] = param.defaultValue
  }
  return values
}

function formatSeconds(value: number): string {
  return `${value.toFixed(1)}s`
}

export function VideoEditPanel() {
  const open = useVideoEditStore((state) => state.open)
  const nodeId = useVideoEditStore((state) => state.nodeId)
  const operation = useVideoEditStore((state) => state.operation)
  const closePanel = useVideoEditStore((state) => state.closePanel)
  const setOperation = useVideoEditStore((state) => state.setOperation)

  const nodes = useCanvasStore((state) => state.nodes)
  const providers = useSettingsStore((state) => state.providers)
  const runGeneration = useGenerationStore((state) => state.run)
  const showToast = useUIStore((state) => state.showToast)
  const allAssets = useLibraryStore((state) => state.allAssets)
  const refreshLibrary = useLibraryStore((state) => state.refresh)
  const { flowToScreenPosition } = useReactFlow()
  const viewport = useViewport()

  const node = nodes.find((item) => item.id === nodeId)
  const videoNode: CineNode | null =
    node && node.type === 'cine' && node.data.kind === 'video'
      ? node
      : null
  const outputs: OutputRef[] = videoNode?.data.outputs ?? []
  const current: OutputRef | undefined =
    outputs.find((item) => item.id === videoNode?.data.selectedOutputId) ??
    outputs[0]

  const [modelKey, setModelKey] = useState<string | null>(null)
  const [prompt, setPrompt] = useState('')
  const [duration, setDuration] = useState(0)
  const [start, setStart] = useState(0)
  const [end, setEnd] = useState(0)
  const [direction, setDirection] = useState<'forward' | 'backward'>('forward')
  const [extendDuration, setExtendDuration] = useState(5)
  const [reference, setReference] = useState<ImageOption | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerTab, setPickerTab] = useState<'canvas' | 'library'>('canvas')
  const [uploading, setUploading] = useState(false)
  const [thumbs, setThumbs] = useState<Array<{ at: number; url: string }>>([])

  useEffect(() => {
    if (!open || !current) return
    setPrompt('')
    setStart(0)
    setEnd(0)
    setDirection('forward')
    setExtendDuration(5)
    setReference(null)
    setPickerOpen(false)
    setThumbs([])
    setDuration(current.duration ?? 0)
    void refreshLibrary()
  }, [open, current?.id, refreshLibrary])

  useEffect(() => {
    if (!open || !current) return
    let cancelled = false

    const load = async (): Promise<void> => {
      try {
        const info = current.duration
          ? null
          : await window.api.media.probe(current.path)
        if (cancelled) return
        const total = current.duration ?? info?.duration ?? 0
        setDuration(total)
        setEnd(total)
      } catch {
        // 时长读取失败时保留 0，面板会使用视频元数据兜底
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [open, current?.id])

  useEffect(() => {
    if (!open || !current || duration <= 0) return
    let cancelled = false
    const count = 10
    setThumbs([])

    void Promise.all(
      Array.from({ length: count }, (_, index) => {
        const at = (duration * (index + 0.5)) / count
        return window.api.media
          .thumbnail(current.path, at, 'video')
          .then((url) => (url ? { at, url } : null))
          .catch(() => null)
      })
    ).then((items) => {
      if (cancelled) return
      setThumbs(
        items.filter((item): item is { at: number; url: string } => Boolean(item))
      )
    })

    return () => {
      cancelled = true
    }
  }, [open, current?.id, duration])

  const videoModels = useMemo(
    () =>
      providers.flatMap((provider) =>
        provider.models
          .filter((model) => model.capability === 'video.t2v')
          .map((model) => ({
            key: `${provider.id}/${model.id}`,
            providerName: provider.name,
            model
          }))
      ),
    [providers]
  )

  const availability = (model: ModelDef): string | null => {
    if (model.adapter !== 'http-template') return '不是专用接口'
    if (!model.template) return '缺少 http-template'
    if (!modelSupportsOperation(model, operation)) {
      return `未声明支持${operationLabel(operation)}`
    }
    return null
  }

  const active = videoModels.find((item) => item.key === modelKey)?.model ?? null

  useEffect(() => {
    if (!open) return
    const first = videoModels.find((item) => availability(item.model) === null)
    setModelKey((currentKey) => {
      if (currentKey) {
        const existing = videoModels.find((item) => item.key === currentKey)
        if (existing && availability(existing.model) === null) return currentKey
      }
      return first?.key ?? null
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, operation, providers])

  const imageOptions = useMemo(() => {
    const fromCanvas: ImageOption[] = []

    for (const item of nodes) {
      if (item.type !== 'cine') continue
      const output =
        (item.data.outputs ?? []).find(
          (entry) => entry.id === item.data.selectedOutputId
        ) ?? item.data.outputs?.[0]
      if (!output || output.kind !== 'image') continue
      fromCanvas.push({
        path: output.path,
        scope: output.scope,
        name: item.data.title,
        thumb: output.path
      })
    }

    const fromLibrary: ImageOption[] = allAssets
      .filter((asset) => asset.kind === 'image')
      .map((asset) => ({
        path: asset.path,
        scope: 'global' as const,
        name: asset.name,
        thumb: asset.thumbnail ?? asset.path
      }))

    return { fromCanvas, fromLibrary }
  }, [nodes, allAssets])

  const layout = useMemo(() => {
    if (!videoNode) return null
    const absolute = absolutePosition(videoNode, nodes)
    const position = flowToScreenPosition(absolute)
    const width =
      videoNode.measured?.width ?? NODE_META[videoNode.data.kind].width
    const height =
      videoNode.measured?.height ??
      NODE_META[videoNode.data.kind].height + TITLE_HEIGHT
    const left = Math.min(
      window.innerWidth - PANEL_WIDTH - 16,
      Math.max(16, position.x + width * viewport.zoom + 16)
    )
    const top = Math.max(
      16,
      Math.min(position.y + 40, window.innerHeight - 320)
    )
    const maxHeight = Math.max(280, window.innerHeight - top - 16)
    return { left, top, maxHeight }
  }, [videoNode, nodes, flowToScreenPosition, viewport.zoom])

  if (!open || !videoNode || !current || !layout) return null

  const max = Math.max(duration, 1)
  const startValue = Math.min(Math.max(start, 0), max)
  const endValue = Math.min(Math.max(end, startValue + 0.1), max)
  const activeMissing = active ? availability(active) : '没有可用模型'
  const needsRange =
    operation === 'shot-retake' || operation === 'element-replace'
  const needsReference = operation === 'element-replace'

  const handleUpload = async (): Promise<void> => {
    setUploading(true)
    try {
      const assets = await window.api.library.importAssets('场景')
      const first = assets.find((asset) => asset.kind === 'image')
      if (first) {
        setReference({
          path: first.path,
          scope: 'global',
          name: first.name,
          thumb: first.thumbnail ?? first.path
        })
        setPickerOpen(false)
      }
    } finally {
      setUploading(false)
    }
  }

  const handleGenerate = (): void => {
    if (!videoNode || !current || !active) return
    if (activeMissing) {
      showToast(`当前模型${activeMissing}`, 'error')
      return
    }
    if (!prompt.trim()) {
      showToast('请输入描述', 'error')
      return
    }
    if (needsReference && !reference) {
      showToast('请选择替换目标图片', 'error')
      return
    }
    if (needsRange && endValue - startValue < 0.1) {
      showToast('时间区间太短', 'error')
      return
    }

    void runGeneration({
      nodeId: videoNode.id,
      modelKey: modelKey!,
      prompt: prompt.trim(),
      params: { ...defaultParams(active), watermark: false },
      video: {
        path: current.path,
        role: 'reference',
        ...(current.scope ? { scope: current.scope } : {})
      },
      ...(reference
        ? {
            refs: [
              {
                path: reference.path,
                role: 'reference' as const,
                scope: reference.scope
              }
            ]
          }
        : {}),
      videoOptions: {
        operation,
        ...(needsRange
          ? { range: { start: startValue, end: endValue } }
          : {}),
        ...(operation === 'extend'
          ? { duration: extendDuration, direction }
          : {})
      },
      op: operation
    })
    showToast(`已提交「${operationLabel(operation)}」`)
  }

  const pickerOptions =
    pickerTab === 'canvas'
      ? imageOptions.fromCanvas
      : imageOptions.fromLibrary

  return createPortal(
    <div
      className="video-edit-panel"
      style={{
        left: layout.left,
        top: layout.top,
        width: PANEL_WIDTH,
        maxHeight: layout.maxHeight
      }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="video-edit-panel__head">
        <div>
          <div className="video-edit-panel__title">视频编辑</div>
          <div className="video-edit-panel__subtitle">{videoNode.data.title}</div>
        </div>
        <button
          type="button"
          className="icon-btn"
          title="关闭"
          onClick={closePanel}
        >
          <Icon name="close" size={13} />
        </button>
      </div>

      <div className="video-edit-panel__tabs">
        {VIDEO_OPERATIONS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={item.id === operation ? 'is-active' : ''}
            onClick={() => setOperation(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="video-edit-panel__body">
        <video
          className="video-edit-panel__preview"
          src={assetUrl(current.path, current.scope)}
          controls
          preload="metadata"
          onLoadedMetadata={(event) => {
            const value = event.currentTarget.duration
            if (Number.isFinite(value) && value > 0 && duration <= 0) {
              setDuration(value)
              setEnd(value)
            }
          }}
        />

        {needsRange ? (
          <div className="video-edit-panel__section">
            <div className="video-edit-panel__section-head">
              <span>重拍区间</span>
              <span>
                {formatSeconds(startValue)} – {formatSeconds(endValue)}
              </span>
            </div>

            <div className="video-edit-thumbs">
              {thumbs.map((item) => (
                <img key={item.at} src={item.url} alt="" />
              ))}
              {thumbs.length === 0 ? (
                <div className="video-edit-thumbs__empty">加载缩略帧…</div>
              ) : null}
            </div>

            <div className="video-edit-range">
              <div
                className="video-edit-range__fill"
                style={{
                  left: `${(startValue / max) * 100}%`,
                  right: `${100 - (endValue / max) * 100}%`
                }}
              />
            </div>

            <label className="video-edit-panel__field">
              <span>开始</span>
              <input
                type="range"
                min={0}
                max={max}
                step={0.1}
                value={startValue}
                onChange={(event) =>
                  setStart(
                    Math.min(Number(event.target.value), endValue - 0.1)
                  )
                }
              />
              <input
                type="number"
                min={0}
                max={max}
                step={0.1}
                value={startValue.toFixed(1)}
                onChange={(event) =>
                  setStart(
                    Math.min(
                      Math.max(Number(event.target.value), 0),
                      endValue - 0.1
                    )
                  )
                }
              />
            </label>

            <label className="video-edit-panel__field">
              <span>结束</span>
              <input
                type="range"
                min={0}
                max={max}
                step={0.1}
                value={endValue}
                onChange={(event) =>
                  setEnd(
                    Math.max(Number(event.target.value), startValue + 0.1)
                  )
                }
              />
              <input
                type="number"
                min={0}
                max={max}
                step={0.1}
                value={endValue.toFixed(1)}
                onChange={(event) =>
                  setEnd(
                    Math.min(
                      Math.max(Number(event.target.value), startValue + 0.1),
                      max
                    )
                  )
                }
              />
            </label>
          </div>
        ) : null}

        {operation === 'extend' ? (
          <div className="video-edit-panel__section">
            <div className="video-edit-panel__section-head">
              <span>续写方向</span>
              <div className="video-edit-panel__direction">
                <button
                  type="button"
                  className={direction === 'forward' ? 'is-active' : ''}
                  onClick={() => setDirection('forward')}
                >
                  向后
                </button>
                <button
                  type="button"
                  className={direction === 'backward' ? 'is-active' : ''}
                  onClick={() => setDirection('backward')}
                >
                  向前
                </button>
              </div>
            </div>

            <label className="video-edit-panel__field">
              <span>新增时长</span>
              <input
                type="range"
                min={1}
                max={10}
                step={1}
                value={extendDuration}
                onChange={(event) =>
                  setExtendDuration(Number(event.target.value))
                }
              />
              <input
                type="number"
                min={1}
                max={10}
                step={1}
                value={extendDuration}
                onChange={(event) =>
                  setExtendDuration(
                    Math.min(10, Math.max(1, Number(event.target.value)))
                  )
                }
              />
            </label>
          </div>
        ) : null}

        {needsReference ? (
          <div className="video-edit-panel__section">
            <div className="video-edit-panel__section-head">
              <span>替换素材</span>
              <button
                type="button"
                className="video-edit-panel__link"
                onClick={() => setPickerOpen((value) => !value)}
              >
                {reference ? '更换' : '选择图片'}
              </button>
            </div>

            {reference ? (
              <div className="video-edit-ref">
                <img src={assetUrl(reference.thumb, reference.scope)} alt="" />
                <span>{reference.name}</span>
                <button
                  type="button"
                  className="icon-btn"
                  title="移除"
                  onClick={() => setReference(null)}
                >
                  <Icon name="close" size={11} />
                </button>
              </div>
            ) : (
              <div className="video-edit-ref__empty">还没有选择替换目标</div>
            )}

            {pickerOpen ? (
              <div className="video-edit-picker">
                <div className="video-edit-picker__head">
                  <div className="video-edit-picker__tabs">
                    <button
                      type="button"
                      className={pickerTab === 'canvas' ? 'is-active' : ''}
                      onClick={() => setPickerTab('canvas')}
                    >
                      画布
                    </button>
                    <button
                      type="button"
                      className={pickerTab === 'library' ? 'is-active' : ''}
                      onClick={() => setPickerTab('library')}
                    >
                      资产库
                    </button>
                  </div>
                  <button
                    type="button"
                    className="btn-secondary btn-small"
                    disabled={uploading}
                    onClick={() => void handleUpload()}
                  >
                    {uploading ? '上传中…' : '上传'}
                  </button>
                </div>

                <div className="video-edit-picker__grid">
                  {pickerOptions.slice(0, 30).map((item) => (
                    <button
                      key={`${item.scope ?? 'project'}:${item.path}`}
                      type="button"
                      className={`video-edit-picker__item${
                        reference?.path === item.path &&
                        (reference?.scope ?? 'project') ===
                          (item.scope ?? 'project')
                          ? ' is-active'
                          : ''
                      }`}
                      title={item.name}
                      onClick={() => {
                        setReference(item)
                        setPickerOpen(false)
                      }}
                    >
                      <img src={assetUrl(item.thumb, item.scope)} alt="" />
                    </button>
                  ))}
                </div>

                {pickerOptions.length === 0 ? (
                  <div className="video-edit-picker__empty">
                    {pickerTab === 'canvas' ? '画布上没有图片' : '资产库没有图片'}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="video-edit-panel__section">
          <div className="video-edit-panel__section-head">
            <span>模型</span>
            {activeMissing ? (
              <span className="video-edit-panel__warn">{activeMissing}</span>
            ) : null}
          </div>

          <div className="video-edit-models">
            {videoModels.map((item) => {
              const reason = availability(item.model)
              return (
                <button
                  key={item.key}
                  type="button"
                  className={`video-edit-model${
                    item.key === modelKey ? ' is-active' : ''
                  }${reason ? ' is-disabled' : ''}`}
                  title={reason ?? undefined}
                  onClick={() => {
                    if (reason) {
                      showToast(`「${item.model.name}」${reason}`, 'error')
                      return
                    }
                    setModelKey(item.key)
                  }}
                >
                  <span>{item.model.name}</span>
                  <span className="video-edit-model__meta">
                    {reason ? reason : item.providerName}
                  </span>
                </button>
              )
            })}
            {videoModels.length === 0 ? (
              <div className="video-edit-models__empty">
                还没有视频模型，请先在设置中添加
              </div>
            ) : null}
          </div>
        </div>

        <label className="video-edit-panel__field video-edit-panel__field--stack">
          <span>描述</span>
          <textarea
            rows={4}
            value={prompt}
            placeholder={
              operation === 'element-replace'
                ? '描述要替换的元素，例如：把主角替换为参考图中的人物'
                : operation === 'extend'
                  ? '描述延长部分发生的动作'
                  : '描述这一段应该怎么重拍'
            }
            onChange={(event) => setPrompt(event.target.value)}
          />
        </label>
      </div>

      <div className="video-edit-panel__footer">
        <button
          type="button"
          className="btn-primary"
          disabled={Boolean(activeMissing) || !prompt.trim()}
          onClick={handleGenerate}
        >
          开始生成
        </button>
      </div>
    </div>,
    document.body
  )
}

function operationLabel(operation: VideoOperationId): string {
  return (
    VIDEO_OPERATIONS.find((item) => item.id === operation)?.label ?? operation
  )
}
