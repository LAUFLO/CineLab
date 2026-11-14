import { useEffect, useMemo, useState } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { OutputRef } from '@shared/canvas-schema'
import { modelSupportsOperation, type ModelDef } from '@shared/provider-schema'
import {
  VIDEO_OPERATIONS,
  type VideoOperationId
} from '@shared/operation-schema'
import type { ReferenceInput } from '@shared/generation'
import { Icon, type IconName } from '../../components/Icon'
import { assetUrl } from '../../lib/asset-url'
import { VideoPlayer } from './VideoPlayer'
import {
  absolutePosition,
  nodeSize,
  useCanvasStore,
  type CanvasNode,
  type VideoOpNode
} from '../../stores/canvas'
import { useGenerationStore } from '../../stores/generation'
import { useLibraryStore } from '../../stores/library'
import { useSettingsStore } from '../../stores/settings'
import { useUIStore } from '../../stores/ui'
import { Button, Input, Textarea } from '../../components/ui'

interface ImageOption {
  path: string
  scope: ReferenceInput['scope']
  name: string
  thumb: string
}

const OPERATION_ICON: Record<VideoOperationId, IconName> = {
  'shot-retake': 'history',
  'element-replace': 'cursor',
  extend: 'arrow-up'
}

const STATUS_LABEL: Record<string, string> = {
  idle: '待生成',
  queued: '排队中',
  running: '生成中',
  done: '已完成',
  error: '失败'
}

function operationDef(operation: VideoOperationId) {
  return VIDEO_OPERATIONS.find((item) => item.id === operation)
}

function defaultParams(model: ModelDef): Record<string, unknown> {
  const values: Record<string, unknown> = {}
  for (const param of model.params) {
    if (param.defaultValue !== undefined) values[param.key] = param.defaultValue
  }
  return values
}

function sourceOutputOf(node: CanvasNode | undefined): OutputRef | undefined {
  if (!node) return undefined
  if (node.type !== 'cine' && node.type !== 'film') return undefined
  const outputs = node.data.outputs ?? []
  return (
    outputs.find((item) => item.id === node.data.selectedOutputId) ?? outputs[0]
  )
}

export function VideoOpNodeView({
  id,
  data,
  selected
}: NodeProps<VideoOpNode>) {
  const nodes = useCanvasStore((state) => state.nodes)
  const patchVideoOpNode = useCanvasStore((state) => state.patchVideoOpNode)
  const addNode = useCanvasStore((state) => state.addNode)
  const onConnect = useCanvasStore((state) => state.onConnect)
  const patchNodeData = useCanvasStore((state) => state.patchNodeData)
  const providers = useSettingsStore((state) => state.providers)
  const runGeneration = useGenerationStore((state) => state.run)
  const showToast = useUIStore((state) => state.showToast)
  const allAssets = useLibraryStore((state) => state.allAssets)
  const refreshLibrary = useLibraryStore((state) => state.refresh)

  const node = nodes.find((item) => item.id === id) as VideoOpNode | undefined
  const source = nodes.find((item) => item.id === data.sourceNodeId)
  const sourceOutput = sourceOutputOf(source)
  const resultNode = data.resultNodeId
    ? nodes.find((item) => item.id === data.resultNodeId)
    : undefined
  const resultStatus =
    resultNode?.type === 'cine' ? resultNode.data.status : data.status

  const [duration, setDuration] = useState(sourceOutput?.duration ?? 0)
  const [start, setStart] = useState(data.range?.start ?? 0)
  const [end, setEnd] = useState(data.range?.end ?? sourceOutput?.duration ?? 0)
  const [direction, setDirection] = useState<'forward' | 'backward'>(
    data.direction ?? 'forward'
  )
  const [extendDuration, setExtendDuration] = useState(data.duration ?? 5)
  const [modelKey, setModelKey] = useState<string | null>(data.modelKey ?? null)
  const [prompt, setPrompt] = useState(data.prompt ?? '')
  const [reference, setReference] = useState<ImageOption | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerTab, setPickerTab] = useState<'canvas' | 'library'>('canvas')
  const [uploading, setUploading] = useState(false)
  const [thumbs, setThumbs] = useState<Array<{ at: number; url: string }>>([])

  useEffect(() => {
    void refreshLibrary()
  }, [refreshLibrary])

  useEffect(() => {
    setStart(data.range?.start ?? 0)
    setEnd(data.range?.end ?? sourceOutput?.duration ?? 0)
    setDirection(data.direction ?? 'forward')
    setExtendDuration(data.duration ?? 5)
    setModelKey(data.modelKey ?? null)
    setPrompt(data.prompt ?? '')
  }, [id])

  useEffect(() => {
    if (!sourceOutput) return
    let cancelled = false

    const load = async (): Promise<void> => {
      if (sourceOutput.duration && sourceOutput.duration > 0) {
        setDuration(sourceOutput.duration)
        setEnd((current) =>
          current > 0 ? current : (sourceOutput.duration ?? 0)
        )
        return
      }
      try {
        const info = await window.api.media.probe(sourceOutput.path)
        if (cancelled) return
        if (info.duration) {
          setDuration(info.duration)
          setEnd((current) => (current > 0 ? current : (info.duration ?? 0)))
        }
      } catch {
        // 保留 0，使用视频元数据兜底
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [sourceOutput?.id, sourceOutput?.path])

  useEffect(() => {
    if (!sourceOutput || duration <= 0) return
    let cancelled = false
    const count = 10
    setThumbs([])

    void Promise.all(
      Array.from({ length: count }, (_, index) => {
        const at = (duration * (index + 0.5)) / count
        return window.api.media
          .thumbnail(sourceOutput.path, at, 'video')
          .then((url) => (url ? { at, url } : null))
          .catch(() => null)
      })
    ).then((items) => {
      if (cancelled) return
      setThumbs(
        items.filter((item): item is { at: number; url: string } =>
          Boolean(item)
        )
      )
    })

    return () => {
      cancelled = true
    }
  }, [sourceOutput?.id, sourceOutput?.path, duration])

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
    if (!modelSupportsOperation(model, data.operation)) {
      return `未声明支持${operationDef(data.operation)?.label ?? data.operation}`
    }
    return null
  }

  const active =
    videoModels.find((item) => item.key === modelKey)?.model ?? null

  useEffect(() => {
    if (!data.expanded) return
    const first = videoModels.find((item) => availability(item.model) === null)
    setModelKey((current) => {
      if (current) {
        const existing = videoModels.find((item) => item.key === current)
        if (existing && availability(existing.model) === null) return current
      }
      return first?.key ?? null
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.expanded, data.operation, providers])

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

  useEffect(() => {
    if (!data.referencePath) {
      setReference(null)
      return
    }
    const found = [
      ...imageOptions.fromCanvas,
      ...imageOptions.fromLibrary
    ].find(
      (item) =>
        item.path === data.referencePath &&
        (item.scope ?? 'project') === (data.referenceScope ?? 'project')
    )
    setReference(
      found ?? {
        path: data.referencePath,
        scope: data.referenceScope,
        name: data.referencePath,
        thumb: data.referencePath
      }
    )
  }, [id, data.referencePath, data.referenceScope])

  if (!node) return null

  const label = operationDef(data.operation)?.label ?? data.operation
  const needsRange =
    data.operation === 'shot-retake' || data.operation === 'element-replace'
  const needsReference = data.operation === 'element-replace'
  const max = Math.max(duration, 1)
  const startValue = Math.min(Math.max(start, 0), max)
  const endValue = Math.min(Math.max(end, startValue + 0.1), max)
  const activeMissing = active ? availability(active) : '没有可用模型'
  const pickerOptions =
    pickerTab === 'canvas' ? imageOptions.fromCanvas : imageOptions.fromLibrary

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
    if (!sourceOutput) {
      showToast('源视频没有可用输出', 'error')
      return
    }
    if (!active || activeMissing) {
      showToast('没有可用的视频接口模型，请先在设置中配置', 'error')
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

    const state = useCanvasStore.getState()
    const absolute = absolutePosition(node, state.nodes)
    const width = nodeSize(node).width
    const resultId = addNode('video', {
      x: absolute.x + width + 80,
      y: absolute.y
    })
    patchNodeData(resultId, { title: `${label} · 结果` })
    onConnect({ source: id, target: resultId })

    patchVideoOpNode(id, {
      status: 'queued',
      resultNodeId: resultId,
      modelKey: modelKey ?? undefined,
      prompt: prompt.trim(),
      ...(needsRange ? { range: { start: startValue, end: endValue } } : {}),
      ...(data.operation === 'extend'
        ? { duration: extendDuration, direction }
        : {}),
      ...(reference
        ? {
            referencePath: reference.path,
            referenceScope: reference.scope
          }
        : {})
    })

    void runGeneration({
      nodeId: resultId,
      modelKey: modelKey!,
      prompt: prompt.trim(),
      params: { ...defaultParams(active), watermark: false },
      video: {
        path: sourceOutput.path,
        role: 'reference',
        ...(sourceOutput.scope ? { scope: sourceOutput.scope } : {})
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
        operation: data.operation,
        ...(needsRange ? { range: { start: startValue, end: endValue } } : {}),
        ...(data.operation === 'extend'
          ? { duration: extendDuration, direction }
          : {})
      },
      op: data.operation
    })

    showToast(`已提交「${label}」`)
  }

  return (
    <div className={`cnode video-op-node ${selected ? 'is-selected' : ''}`}>
      <div className="cnode__title">
        <Icon name={OPERATION_ICON[data.operation]} size={12} />
        <span>{data.title}</span>
        <span className={`video-op-node__badge is-${resultStatus}`}>
          {STATUS_LABEL[resultStatus] ?? resultStatus}
        </span>
      </div>

      <div className="cnode__card video-op-node__card">
        <div className="video-op-node__summary">
          <span>{source?.data.title ?? '源视频'}</span>
          <span>
            {needsRange
              ? `${startValue.toFixed(1)}s – ${endValue.toFixed(1)}s`
              : `${extendDuration}s · ${direction === 'forward' ? '向后' : '向前'}`}
          </span>
          <span>{active?.name ?? '未选择模型'}</span>
        </div>

        <Button
          type="button"
          className="video-op-node__toggle nodrag nopan"
          onClick={() => patchVideoOpNode(id, { expanded: !data.expanded })}
          unstyled
        >
          {data.expanded ? '收起参数' : '设置参数'}
        </Button>

        {data.expanded ? (
          <div className="video-op-node__form nodrag nopan">
            {sourceOutput ? (
              <div className="video-op-node__preview">
                <VideoPlayer
                  src={assetUrl(sourceOutput.path, sourceOutput.scope)}
                  path={sourceOutput.path}
                  onDurationChange={(value) => {
                    if (value <= 0) return
                    setDuration((current) => (current > 0 ? current : value))
                    setEnd((current) => (current > 0 ? current : value))
                  }}
                />
              </div>
            ) : (
              <div className="video-op-node__warn">源节点没有视频输出</div>
            )}

            {needsRange ? (
              <div className="video-op-node__section">
                <div className="video-op-node__section-head">
                  <span>重拍区间</span>
                  <span>
                    {startValue.toFixed(1)}s – {endValue.toFixed(1)}s
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
                  <Input
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
                    unstyled
                  />
                  <Input
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
                    unstyled
                  />
                </label>

                <label className="video-edit-panel__field">
                  <span>结束</span>
                  <Input
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
                    unstyled
                  />
                  <Input
                    type="number"
                    min={0}
                    max={max}
                    step={0.1}
                    value={endValue.toFixed(1)}
                    onChange={(event) =>
                      setEnd(
                        Math.min(
                          Math.max(
                            Number(event.target.value),
                            startValue + 0.1
                          ),
                          max
                        )
                      )
                    }
                    unstyled
                  />
                </label>
              </div>
            ) : null}

            {data.operation === 'extend' ? (
              <div className="video-op-node__section">
                <div className="video-op-node__section-head">
                  <span>续写方向</span>
                  <div className="video-edit-panel__direction">
                    <Button
                      type="button"
                      className={direction === 'forward' ? 'is-active' : ''}
                      onClick={() => setDirection('forward')}
                      unstyled
                    >
                      向后
                    </Button>
                    <Button
                      type="button"
                      className={direction === 'backward' ? 'is-active' : ''}
                      onClick={() => setDirection('backward')}
                      unstyled
                    >
                      向前
                    </Button>
                  </div>
                </div>

                <label className="video-edit-panel__field">
                  <span>新增时长</span>
                  <Input
                    type="range"
                    min={1}
                    max={10}
                    step={1}
                    value={extendDuration}
                    onChange={(event) =>
                      setExtendDuration(Number(event.target.value))
                    }
                    unstyled
                  />
                  <Input
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
                    unstyled
                  />
                </label>
              </div>
            ) : null}

            {needsReference ? (
              <div className="video-op-node__section">
                <div className="video-op-node__section-head">
                  <span>替换素材</span>
                  <Button
                    type="button"
                    className="video-edit-panel__link"
                    onClick={() => setPickerOpen((value) => !value)}
                    unstyled
                  >
                    {reference ? '更换' : '选择图片'}
                  </Button>
                </div>

                {reference ? (
                  <div className="video-edit-ref">
                    <img
                      src={assetUrl(reference.thumb, reference.scope)}
                      alt=""
                    />
                    <span>{reference.name}</span>
                    <Button
                      type="button"
                      className="icon-btn"
                      title="移除"
                      onClick={() => setReference(null)}
                      unstyled
                    >
                      <Icon name="close" size={11} />
                    </Button>
                  </div>
                ) : (
                  <div className="video-edit-ref__empty">
                    还没有选择替换目标
                  </div>
                )}

                {pickerOpen ? (
                  <div className="video-edit-picker">
                    <div className="video-edit-picker__head">
                      <div className="video-edit-picker__tabs">
                        <Button
                          type="button"
                          className={pickerTab === 'canvas' ? 'is-active' : ''}
                          onClick={() => setPickerTab('canvas')}
                          unstyled
                        >
                          画布
                        </Button>
                        <Button
                          type="button"
                          className={pickerTab === 'library' ? 'is-active' : ''}
                          onClick={() => setPickerTab('library')}
                          unstyled
                        >
                          资产库
                        </Button>
                      </div>
                      <Button
                        type="button"
                        className="btn-secondary btn-small"
                        disabled={uploading}
                        onClick={() => void handleUpload()}
                        unstyled
                      >
                        {uploading ? '上传中…' : '上传'}
                      </Button>
                    </div>

                    <div className="video-edit-picker__grid">
                      {pickerOptions.slice(0, 30).map((item) => (
                        <Button
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
                          unstyled
                        >
                          <img src={assetUrl(item.thumb, item.scope)} alt="" />
                        </Button>
                      ))}
                    </div>

                    {pickerOptions.length === 0 ? (
                      <div className="video-edit-picker__empty">
                        {pickerTab === 'canvas'
                          ? '画布上没有图片'
                          : '资产库没有图片'}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="video-op-node__section">
              <div className="video-op-node__section-head">
                <span>模型</span>
                {activeMissing ? (
                  <span className="video-edit-panel__warn">
                    {activeMissing}
                  </span>
                ) : null}
              </div>

              <div className="video-edit-models">
                {videoModels.map((item) => {
                  const reason = availability(item.model)
                  return (
                    <Button
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
                      unstyled
                    >
                      <span>{item.model.name}</span>
                      <span className="video-edit-model__meta">
                        {reason ? reason : item.providerName}
                      </span>
                    </Button>
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
              <Textarea
                rows={4}
                value={prompt}
                placeholder={
                  data.operation === 'element-replace'
                    ? '描述要替换的元素，例如：把主角替换为参考图中的人物'
                    : data.operation === 'extend'
                      ? '描述延长部分发生的动作'
                      : '描述这一段应该怎么重拍'
                }
                onChange={(event) => setPrompt(event.target.value)}
                unstyled
              />
            </label>

            <Button
              type="button"
              className="btn-primary video-op-node__generate nodrag nopan"
              disabled={Boolean(activeMissing) || !prompt.trim()}
              onClick={handleGenerate}
              unstyled
            >
              开始生成
            </Button>
          </div>
        ) : null}
      </div>

      <Handle
        type="target"
        position={Position.Left}
        className="cnode__handle cnode__handle--left"
        title="接收源视频"
      >
        <Icon name="plus" size={12} className="cnode__handle-icon" />
      </Handle>

      <Handle
        type="source"
        position={Position.Right}
        className="cnode__handle cnode__handle--right"
        title="生成结果"
      />
    </div>
  )
}
