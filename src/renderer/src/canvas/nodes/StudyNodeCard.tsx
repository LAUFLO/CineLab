import { useEffect, useMemo, useState } from 'react'
import type { CineNodeData } from '@shared/canvas-schema'
import type { FilmStudyOutputOptions } from '@shared/film-study'
import { modelInputs, type ModelDef } from '@shared/provider-schema'
import { Icon } from '../../components/Icon'

import { useCanvasStore } from '../../stores/canvas'
import { useFilmStudyStore } from '../../stores/film-study'
import { useSettingsStore } from '../../stores/settings'
import { Button, Select, cn } from '../../components/ui'

interface StudyNodeCardProps {
  nodeId: string
  data: CineNodeData
}

const CHIP_CLASS =
  'h-7 rounded-[7px] bg-surface-hover px-[11px] text-[11.5px] !font-normal !text-fg-subtle'
const CHIP_ACTIVE_CLASS =
  '!bg-[color-mix(in_srgb,var(--link)_16%,transparent)] !text-fg'

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
  const [storyboard, setStoryboard] = useState(
    data.studyOutputs?.storyboard !== false
  )
  const [sheet, setSheet] = useState(data.studyOutputs?.sheet !== false)
  const [motion, setMotion] = useState(data.studyOutputs?.motion === true)
  const [music, setMusic] = useState(data.studyOutputs?.music === true)

  useEffect(() => {
    setModelKey(data.studyModelKey ?? '')
    setStoryboard(data.studyOutputs?.storyboard !== false)
    setSheet(data.studyOutputs?.sheet !== false)
    setMotion(data.studyOutputs?.motion === true)
    setMusic(data.studyOutputs?.music === true)
  }, [nodeId])

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
    { value: 'none', label: '不分析，仅出分镜组' },
    ...visionModels
  ]

  const outputs: FilmStudyOutputOptions = {
    storyboard,
    sheet,
    motion,
    music
  }

  const start = (): void => {
    void runAuto(nodeId, {
      interval: 0,
      modelKey: modelKey === 'none' ? 'none' : modelKey || undefined,
      outputs
    })
  }

  return (
    <div
      className="flex h-full w-full flex-col gap-2 rounded-[10px] border border-border bg-surface px-3 py-2.5"
      onDoubleClick={(event) => {
        event.stopPropagation()
        if (ready) void openSheet(nodeId)
      }}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="inline-flex shrink-0 items-center gap-1 rounded-[5px] bg-surface-hover px-1.5 py-0.5 text-[10px] text-fg-muted">
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

      {summary ? (
        <div className="text-[11px] text-fg-subtle">
          {summary.segmentCount} 个分镜 · {summary.frameCount} 帧 ·{' '}
          {Math.round(summary.duration)}s
        </div>
      ) : (
        <div className="text-[11px] text-fg-subtle">
          连到视频节点后开始拆解分镜
        </div>
      )}

      {busy ? (
        <>
          <div className="h-1 overflow-hidden rounded-pill bg-surface-hover">
            <div
              className="h-full rounded-[inherit] bg-link [transition:width_0.2s_ease]"
              style={{ width: `${Math.max(2, data.progress ?? 0)}%` }}
            />
          </div>
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
        </>
      ) : (
        <>
          <label className="nodrag nopan flex items-center gap-2 text-[11px] text-fg-subtle">
            <span className="w-[52px] shrink-0">AI 分析</span>
            <Select
              value={modelKey}
              options={modelOptions}
              onChange={(value) => setModelKey(value)}
            />
          </label>

          <div className="nodrag nopan flex flex-wrap gap-1.5">
            <Button
              type="button"
              variant="ghost"
              size="none"
              className={cn(CHIP_CLASS, storyboard && CHIP_ACTIVE_CLASS)}
              onClick={(event) => {
                event.stopPropagation()
                setStoryboard((value) => !value)
              }}
            >
              分镜组
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="none"
              className={cn(CHIP_CLASS, sheet && CHIP_ACTIVE_CLASS)}
              onClick={(event) => {
                event.stopPropagation()
                setSheet((value) => !value)
              }}
            >
              分镜表
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="none"
              className={cn(CHIP_CLASS, motion && CHIP_ACTIVE_CLASS)}
              onClick={(event) => {
                event.stopPropagation()
                setMotion((value) => !value)
              }}
            >
              动态切片
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="none"
              className={cn(CHIP_CLASS, music && CHIP_ACTIVE_CLASS)}
              onClick={(event) => {
                event.stopPropagation()
                setMusic((value) => !value)
              }}
            >
              BGM
            </Button>
          </div>
        </>
      )}

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
        {busy ? null : ready ? (
          <>
            <Button
              type="button"
              variant="ghost"
              size="none"
              disabled={opening}
              className="nodrag nopan h-[30px] gap-[5px] rounded-[7px] border border-border-strong bg-surface-hover px-[11px] text-xs !font-normal !text-fg enabled:hover:!border-border-selected enabled:hover:!bg-surface-raised disabled:!pointer-events-auto disabled:!cursor-not-allowed disabled:!opacity-45"
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
              className="nodrag nopan h-[30px] rounded-[7px] px-[11px] text-xs"
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
            className="nodrag nopan h-[30px] rounded-[7px] px-[11px] text-xs"
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
            className="nodrag nopan h-[30px] rounded-[7px] px-[11px] text-xs"
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
