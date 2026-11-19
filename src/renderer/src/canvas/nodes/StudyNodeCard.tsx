import { useEffect, useMemo, useState } from 'react'
import type { CineNodeData } from '@shared/canvas-schema'
import { modelInputs, type ModelDef } from '@shared/provider-schema'
import { Icon } from '../../components/Icon'
import { assetUrl } from '../../lib/asset-url'
import { useCanvasStore } from '../../stores/canvas'
import { useFilmStudyStore } from '../../stores/film-study'
import { useSettingsStore } from '../../stores/settings'
import { Button, Select, cn } from '../../components/ui'

interface StudyNodeCardProps {
  nodeId: string
  data: CineNodeData
}

const CHIP_CLASS =
  'h-[22px] rounded-md bg-surface-hover px-1 text-[10.5px] !font-normal !text-fg-subtle'
const CHIP_DISABLED_CLASS = 'disabled:!opacity-40 disabled:!cursor-not-allowed'

const STAGES = ['切镜', '逐镜', '取证', '聚合'] as const

const KIND_LABEL: Record<string, string> = {
  live: '真人短剧',
  ai: 'AI 短剧',
  '2d': '2D 漫剧',
  '3d': '3D 动画',
  'motion-comic': '动态漫',
  commentary: '解说'
}

function stageIndex(progress: number): number {
  if (progress >= 85) return 3
  if (progress >= 60) return 2
  if (progress >= 25) return 1
  return 0
}

function percent(value?: number): string {
  return `${Math.round((value ?? 0) * 100)}%`
}

export function StudyNodeCard({ nodeId, data }: StudyNodeCardProps) {
  const providers = useSettingsStore((state) => state.providers)
  const runAuto = useFilmStudyStore((state) => state.runAuto)
  const cancel = useFilmStudyStore((state) => state.cancel)
  const openSheet = useFilmStudyStore((state) => state.openSheet)
  const opening = useFilmStudyStore((state) => state.sheetLoading)
  const summary = data.studySummary
  const busy = data.status === 'queued' || data.status === 'running'
  const ready = data.status === 'done' && Boolean(data.studyId)
  const [modelKey, setModelKey] = useState(data.studyModelKey ?? '')

  useEffect(() => {
    setModelKey(data.studyModelKey ?? '')
  }, [nodeId, data.studyModelKey])

  const visionModels = useMemo(
    () =>
      providers.flatMap((provider) =>
        provider.models
          .filter(
            (model) =>
              model.capability === 'text.chat' &&
              modelInputs(model as ModelDef).includes('image')
          )
          .map((model) => ({
            value: `${provider.id}/${model.id}`,
            label: `${provider.name} · ${model.name}`
          }))
      ),
    [providers]
  )

  const modelOptions = [
    { value: '', label: '自动选择（推荐）' },
    ...visionModels
  ]

  const start = (): void => {
    void runAuto(nodeId, {
      interval: 0,
      modelKey: modelKey || undefined,
      outputs: { storyboard: true, sheet: true }
    })
  }

  const shotCount = summary?.shotCount ?? summary?.segmentCount ?? 0
  const kindLabel = summary?.kind ? KIND_LABEL[summary.kind] : undefined
  const duration = summary ? `${Math.round(summary.duration)}s` : undefined

  const productionLine = summary?.production
    ? [
        summary.production.live ? `实拍 ${percent(summary.production.live)}` : '',
        summary.production.ai ? `AI ${percent(summary.production.ai)}` : '',
        summary.production.cg ? `3D ${percent(summary.production.cg)}` : '',
        summary.production.code ? `代码 ${percent(summary.production.code)}` : ''
      ]
        .filter(Boolean)
        .join(' · ')
    : ''

  const countLine = summary
    ? [
        summary.castCount ? `${summary.castCount} 角色` : '',
        summary.sceneCount ? `${summary.sceneCount} 场景` : '',
        summary.dialogueCount ? `${summary.dialogueCount} 句台词` : ''
      ]
        .filter(Boolean)
        .join(' · ')
    : ''

  const covers = summary?.coverPaths ?? []
  const currentStage = stageIndex(data.progress ?? 0)

  return (
    <div
      className="flex h-full w-full flex-col gap-1.5 overflow-y-auto rounded-card border border-border bg-surface px-3 py-2.5"
      onDoubleClick={(event) => {
        event.stopPropagation()
        if (ready) void openSheet(nodeId)
      }}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-surface-hover px-1.5 py-0.5 text-[10px] text-fg-muted">
          <Icon name="film" size={12} />
          逐帧拉片
        </span>
        <span
          className="min-w-0 flex-1 truncate text-xs text-fg"
          title={data.sourceName}
        >
          {data.sourceName ?? data.sourcePath ?? '未连接视频'}
        </span>
      </div>

      {covers.length > 0 ? (
        <div className="grid shrink-0 grid-cols-3 gap-1 overflow-hidden rounded-md">
          {covers.slice(0, 3).map((path) => (
            <img
              key={path}
              src={assetUrl(path, 'project')}
              alt=""
              className="h-12 w-full bg-surface-hover object-cover"
              draggable={false}
            />
          ))}
        </div>
      ) : null}

      {summary ? (
        <div className="space-y-0.5 text-[11px] leading-[1.45] text-fg-subtle">
          <div className="truncate">
            {shotCount} 镜
            {duration ? ` · ${duration}` : ''}
            {kindLabel ? ` · ${kindLabel}` : ''}
          </div>
          {productionLine ? (
            <div className="truncate">{productionLine}</div>
          ) : null}
          {countLine ? <div className="truncate">{countLine}</div> : null}
        </div>
      ) : (
        <div className="text-[11px] text-fg-subtle">
          连到视频节点后开始拆解分镜
        </div>
      )}

      {busy ? (
        <div className="nodrag nopan space-y-1">
          <div className="flex items-center gap-1 text-[10px]">
            {STAGES.map((stage, index) => (
              <span
                key={stage}
                className={cn(
                  'inline-flex items-center gap-1',
                  index <= currentStage ? 'text-fg' : 'text-fg-subtle'
                )}
              >
                <i
                  className={cn(
                    'h-1.5 w-1.5 rounded-full',
                    index <= currentStage ? 'bg-link' : 'bg-surface-hover'
                  )}
                />
                {stage}
              </span>
            ))}
            <span className="ml-auto tabular-nums text-fg-subtle">
              {Math.round(data.progress ?? 0)}%
            </span>
          </div>
          <div className="h-1 overflow-hidden rounded-pill bg-surface-hover">
            <div
              className="h-full rounded-[inherit] bg-link [transition:width_0.2s_ease]"
              style={{ width: `${Math.max(2, data.progress ?? 0)}%` }}
            />
          </div>
        </div>
      ) : (
        <label className="nodrag nopan flex items-center gap-2 text-[11px] text-fg-subtle">
          <span className="w-[52px] shrink-0">分析模型</span>
          <Select
            value={modelKey}
            options={modelOptions}
            onChange={(value) => setModelKey(value)}
          />
        </label>
      )}

      <div className="nodrag nopan grid grid-cols-4 gap-1">
        <Button
          type="button"
          variant="ghost"
          size="none"
          disabled={!ready || opening}
          className={cn(
            CHIP_CLASS,
            CHIP_DISABLED_CLASS,
            ready && '!text-fg'
          )}
          onClick={(event) => {
            event.stopPropagation()
            if (ready) void openSheet(nodeId)
          }}
        >
          分镜表
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="none"
          disabled={!ready || opening}
          title="镜头节点在 R1 接入"
          className={cn(CHIP_CLASS, CHIP_DISABLED_CLASS)}
          onClick={(event) => {
            event.stopPropagation()
            if (ready) void openSheet(nodeId)
          }}
        >
          镜头
        </Button>
        {(
          [
            ['角色', 'cast'],
            ['场景', 'scene'],
            ['风格', 'style'],
            ['音频', 'audio']
          ] as const
        ).map(([label, kind]) => (
          <Button
            key={kind}
            type="button"
            variant="ghost"
            size="none"
            disabled={!ready}
            title={ready ? label : '拉片完成后可用'}
            className={cn(CHIP_CLASS, CHIP_DISABLED_CLASS)}
            onClick={(event) => {
              event.stopPropagation()
              void useFilmStudyStore.getState().addStudyGroup(nodeId, kind)
            }}
          >
            {label}
          </Button>
        ))}
        <Button
          type="button"
          variant="ghost"
          size="none"
          disabled={!ready}
          title={ready ? '整片复刻：每个镜头建一个生成节点' : '拉片完成后可用'}
          className={cn(CHIP_CLASS, CHIP_DISABLED_CLASS)}
          onClick={(event) => {
            event.stopPropagation()
            void useFilmStudyStore.getState().remakeAll(nodeId)
          }}
        >
          复刻
        </Button>
      </div>

      {data.status === 'error' ? (
        <div
          className="line-clamp-2 text-[11px] leading-[1.45] text-danger"
          title={data.error}
        >
          {data.error ?? '拉片失败'}
        </div>
      ) : null}

      {data.studyAnalysisError ? (
        <div
          className="text-[10px] leading-[1.4] text-warning"
          title={data.studyAnalysisError}
        >
          AI 描述失败，已保留基础分镜
        </div>
      ) : null}

      <div className="mt-auto flex flex-wrap items-center justify-end gap-2 pt-0.5">
        {busy ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="nodrag nopan"
            onClick={(event) => {
              event.stopPropagation()
              void cancel(nodeId)
            }}
          >
            取消拉片
          </Button>
        ) : ready ? (
          <>
            <Button
              type="button"
              variant="ghost"
              size="none"
              disabled={opening}
              className="nodrag nopan h-[30px] gap-[5px] rounded-md border border-border-strong bg-surface-hover px-[11px] text-xs !font-normal !text-fg enabled:hover:!border-border-selected enabled:hover:!bg-surface-raised disabled:!pointer-events-auto disabled:!cursor-not-allowed disabled:!opacity-45"
              onClick={(event) => {
                event.stopPropagation()
                void openSheet(nodeId)
              }}
            >
              <Icon name="film" size={12} />
              {opening ? '正在打开…' : '查看分镜表'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="none"
              className="nodrag nopan h-[30px] rounded-md px-[11px] text-xs"
              onClick={(event) => {
                event.stopPropagation()
                start()
              }}
            >
              重新拉片
            </Button>
          </>
        ) : (
          <Button
            type="button"
            variant="primary"
            size="none"
            className="nodrag nopan h-[30px] rounded-md px-[11px] text-xs"
            onClick={(event) => {
              event.stopPropagation()
              start()
            }}
          >
            <Icon name="play" size={12} />
            开始拉片
          </Button>
        )}
      </div>

      {data.status === 'error' ? (
        <div className="mt-auto flex flex-wrap items-center justify-end gap-2 pt-0.5">
          <Button
            type="button"
            variant="secondary"
            size="none"
            className="nodrag nopan h-[30px] rounded-md px-[11px] text-xs"
            onClick={(event) => {
              event.stopPropagation()
              void useCanvasStore.getState().patchNodeData(nodeId, {
                status: 'idle'
              })
              start()
            }}
          >
            重试拉片
          </Button>
        </div>
      ) : null}
    </div>
  )
}
