import { useEffect, useMemo, useState } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { OutputRef } from '@shared/canvas-schema'
import {
  modelInputs,
  modelModeIds,
  modelSupportsOperation,
  type ModelDef
} from '@shared/provider-schema'
import {
  VIDEO_OPERATIONS,
  type VideoOperationId
} from '@shared/operation-schema'
import type { ReferenceInput } from '@shared/generation'
import { Icon, type IconName } from '../../components/Icon'
import { assetUrl } from '../../lib/asset-url'
import { VideoPreview } from './VideoPreview'
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

const BADGE_TONE: Record<string, string> = {
  done: 'bg-[color-mix(in_srgb,var(--link)_14%,transparent)] text-link',
  error: 'bg-[color-mix(in_srgb,var(--danger)_14%,transparent)] text-danger'
}
const FIELD_CLASS =
  'grid grid-cols-[52px_1fr_64px] items-center gap-2 text-[11.5px] text-fg-subtle'

const RANGE_CLASS = 'w-full accent-link !h-6 !border-0 !bg-transparent !px-0'

const NUMBER_CLASS =
  'w-full !h-[26px] !rounded-md !bg-surface-hover !px-1.5 !text-[11px]'

const TAB_BASE = '!h-6 !rounded-md !px-2 !text-[11px] !font-normal'

const tabClass = (active: boolean): string =>
  `${TAB_BASE} ${
    active
      ? '!bg-[color-mix(in_srgb,var(--link)_14%,transparent)] !text-fg'
      : '!bg-surface-hover !text-fg-subtle'
  }`

const modelClass = (active: boolean, disabled: boolean): string =>
  `flex !h-8 w-full !justify-between !rounded-md !px-2 !text-[11.5px] !font-normal ${
    active
      ? '!border !border-link !bg-surface-hover !text-fg'
      : '!bg-surface-hover !text-fg-muted'
  }${disabled ? ' cursor-not-allowed opacity-55' : ''}`

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
    const modeId =
      data.operation === 'extend' ? 'video-extend' : 'video-edit'
    if (!modelModeIds(model).includes(modeId)) {
      return data.operation === 'extend'
        ? '未声明视频延长模式'
        : '未声明视频编辑模式'
    }
    if (!modelInputs(model).includes('video')) return '未开启视频输入'
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
    <div
      data-cnode
      data-node-kind="video-op"
      data-selected={selected || undefined}
      className="group relative flex h-full w-full flex-col"
    >
      <div className="flex h-7 shrink-0 items-center gap-[5px] overflow-hidden pl-1 text-xs whitespace-nowrap text-fg-muted group-data-[selected]:text-fg">
        <Icon name={OPERATION_ICON[data.operation]} size={12} />
        <span>{data.title}</span>
        <span
          className={`ml-auto rounded-md bg-surface-hover px-1.5 py-px text-[10px] ${
            BADGE_TONE[resultStatus] ?? 'text-fg-subtle'
          }`}
        >
          {STATUS_LABEL[resultStatus] ?? resultStatus}
        </span>
      </div>

      <div
        data-node-card
        className={`relative flex min-h-0 flex-1 flex-col gap-2 overflow-hidden rounded-card border bg-surface-raised p-2.5 shadow-node transition-colors duration-[120ms] ${
          selected
            ? 'border-border-selected'
            : 'border-border group-hover:border-border-strong'
        }`}
      >
        <div className="flex flex-col gap-0.5 text-[11px] text-fg-subtle">
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
          variant="ghost"
          size="none"
          className="nodrag nopan !h-[26px] self-start !rounded-md !bg-surface-hover !px-2.5 !text-[11px] !font-normal !text-fg-muted hover:!bg-surface-hover hover:!text-fg-muted"
          onClick={() => patchVideoOpNode(id, { expanded: !data.expanded })}
        >
          {data.expanded ? '收起参数' : '设置参数'}
        </Button>

        {data.expanded ? (
          <div className="nodrag nopan flex flex-col gap-3 border-t border-border pt-1">
            {sourceOutput ? (
              <div className="relative aspect-video w-full overflow-hidden rounded-card bg-media-bg">
                <VideoPreview
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
              <div className="rounded-card border border-dashed border-danger p-2.5 text-center text-[11px] text-danger">
                源节点没有视频输出
              </div>
            )}

            {needsRange ? (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2 text-[11.5px] text-fg-muted">
                  <span>重拍区间</span>
                  <span>
                    {startValue.toFixed(1)}s – {endValue.toFixed(1)}s
                  </span>
                </div>

                <div className="flex h-14 overflow-hidden rounded-card bg-surface-hover">
                  {thumbs.map((item) => (
                    <img
                      key={item.at}
                      src={item.url}
                      alt=""
                      className="h-full min-w-0 flex-1 object-cover"
                    />
                  ))}
                  {thumbs.length === 0 ? (
                    <div className="flex w-full items-center justify-center text-[11px] text-fg-subtle">
                      加载缩略帧…
                    </div>
                  ) : null}
                </div>

                <div className="relative h-1 rounded-[2px] bg-surface-hover">
                  <div
                    className="absolute top-0 bottom-0 rounded-[2px] bg-link"
                    style={{
                      left: `${(startValue / max) * 100}%`,
                      right: `${100 - (endValue / max) * 100}%`
                    }}
                  />
                </div>

                <label className={FIELD_CLASS}>
                  <span>开始</span>
                  <Input
                    type="range"
                    min={0}
                    max={max}
                    step={0.1}
                    value={startValue}
                    className={RANGE_CLASS}
                    onChange={(event) =>
                      setStart(
                        Math.min(Number(event.target.value), endValue - 0.1)
                      )
                    }
                  />
                  <Input
                    type="number"
                    min={0}
                    max={max}
                    step={0.1}
                    value={startValue.toFixed(1)}
                    className={NUMBER_CLASS}
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

                <label className={FIELD_CLASS}>
                  <span>结束</span>
                  <Input
                    type="range"
                    min={0}
                    max={max}
                    step={0.1}
                    value={endValue}
                    className={RANGE_CLASS}
                    onChange={(event) =>
                      setEnd(
                        Math.max(Number(event.target.value), startValue + 0.1)
                      )
                    }
                  />
                  <Input
                    type="number"
                    min={0}
                    max={max}
                    step={0.1}
                    value={endValue.toFixed(1)}
                    className={NUMBER_CLASS}
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
                  />
                </label>
              </div>
            ) : null}

            {data.operation === 'extend' ? (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2 text-[11.5px] text-fg-muted">
                  <span>续写方向</span>
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="none"
                      className={tabClass(direction === 'forward')}
                      onClick={() => setDirection('forward')}
                    >
                      向后
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="none"
                      className={tabClass(direction === 'backward')}
                      onClick={() => setDirection('backward')}
                    >
                      向前
                    </Button>
                  </div>
                </div>

                <label className={FIELD_CLASS}>
                  <span>新增时长</span>
                  <Input
                    type="range"
                    min={1}
                    max={10}
                    step={1}
                    value={extendDuration}
                    className={RANGE_CLASS}
                    onChange={(event) =>
                      setExtendDuration(Number(event.target.value))
                    }
                  />
                  <Input
                    type="number"
                    min={1}
                    max={10}
                    step={1}
                    value={extendDuration}
                    className={NUMBER_CLASS}
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
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2 text-[11.5px] text-fg-muted">
                  <span>替换素材</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="none"
                    className="!text-[11px] !font-normal !text-link hover:!bg-transparent hover:!text-link"
                    onClick={() => setPickerOpen((value) => !value)}
                  >
                    {reference ? '更换' : '选择图片'}
                  </Button>
                </div>

                {reference ? (
                  <div className="flex items-center gap-2 rounded-card bg-surface-hover p-1.5">
                    <img
                      src={assetUrl(reference.thumb, reference.scope)}
                      alt=""
                      className="h-11 w-11 rounded-md object-cover"
                    />
                    <span className="min-w-0 flex-1 truncate text-[11.5px] text-fg-muted">
                      {reference.name}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="none"
                      className="!h-7 !w-7 shrink-0 !rounded-md !text-fg-muted hover:!bg-surface-hover hover:!text-fg"
                      title="移除"
                      onClick={() => setReference(null)}
                    >
                      <Icon name="close" size={11} />
                    </Button>
                  </div>
                ) : (
                  <div className="rounded-card border border-dashed border-border p-2.5 text-center text-[11px] text-fg-subtle">
                    还没有选择替换目标
                  </div>
                )}

                {pickerOpen ? (
                  <div className="flex flex-col gap-2 rounded-card border border-border bg-surface-raised p-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="none"
                          className={tabClass(pickerTab === 'canvas')}
                          onClick={() => setPickerTab('canvas')}
                        >
                          画布
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="none"
                          className={tabClass(pickerTab === 'library')}
                          onClick={() => setPickerTab('library')}
                        >
                          资产库
                        </Button>
                      </div>
                      <Button
                        type="button"
                        variant="secondary"
                        size="xs"
                        disabled={uploading}
                        onClick={() => void handleUpload()}
                      >
                        {uploading ? '上传中…' : '上传'}
                      </Button>
                    </div>

                    <div className="grid max-h-[140px] grid-cols-5 gap-1 overflow-y-auto">
                      {pickerOptions.slice(0, 30).map((item) => (
                        <Button
                          key={`${item.scope ?? 'project'}:${item.path}`}
                          type="button"
                          variant="ghost"
                          size="none"
                          className={`aspect-square overflow-hidden !rounded-md !border !p-0 ${
                            reference?.path === item.path &&
                            (reference?.scope ?? 'project') ===
                              (item.scope ?? 'project')
                              ? '!border-link'
                              : '!border-transparent'
                          }`}
                          title={item.name}
                          onClick={() => {
                            setReference(item)
                            setPickerOpen(false)
                          }}
                        >
                          <img
                            src={assetUrl(item.thumb, item.scope)}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        </Button>
                      ))}
                    </div>

                    {pickerOptions.length === 0 ? (
                      <div className="p-3 text-center text-[11px] text-fg-subtle">
                        {pickerTab === 'canvas'
                          ? '画布上没有图片'
                          : '资产库没有图片'}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2 text-[11.5px] text-fg-muted">
                <span>模型</span>
                {activeMissing ? (
                  <span className="text-[10px] text-danger">{activeMissing}</span>
                ) : null}
              </div>

              <div className="flex max-h-40 flex-col gap-1 overflow-y-auto">
                {videoModels.map((item) => {
                  const reason = availability(item.model)
                  return (
                    <Button
                      key={item.key}
                      type="button"
                      variant="ghost"
                      size="none"
                      className={modelClass(
                        item.key === modelKey,
                        Boolean(reason)
                      )}
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
                      <span className="text-[10px] text-fg-subtle">
                        {reason ? reason : item.providerName}
                      </span>
                    </Button>
                  )
                })}
                {videoModels.length === 0 ? (
                  <div className="p-2.5 text-center text-[11px] text-fg-subtle">
                    还没有视频模型，请先在设置中添加
                  </div>
                ) : null}
              </div>
            </div>

            <label className={`${FIELD_CLASS} !grid-cols-1`}>
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
                className="!rounded-md !bg-surface-hover !p-2 !text-xs !min-h-0"
                onChange={(event) => setPrompt(event.target.value)}
              />
            </label>

            <Button
              type="button"
              variant="primary"
              size="none"
              className="nodrag nopan !h-[34px] w-full !rounded-md !text-[13px]"
              disabled={Boolean(activeMissing) || !prompt.trim()}
              onClick={handleGenerate}
            >
              开始生成
            </Button>
          </div>
        ) : null}
      </div>

      <Handle
        type="target"
        position={Position.Left}
        data-handle="left"
        title="接收源视频"
      >
        <Icon name="plus" size={12} />
      </Handle>

      <Handle
        type="source"
        position={Position.Right}
        data-handle="right"
        title="生成结果"
      />
    </div>
  )
}
