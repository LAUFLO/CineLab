import { useEffect, useMemo, useState } from 'react'
import type { CineNodeData } from '@shared/canvas-schema'
import type { FilmStudyOutputOptions } from '@shared/film-study'
import { modelInputs, type ModelDef } from '@shared/provider-schema'
import { Icon } from '../../components/Icon'
import { Select } from '../../components/Select'
import { useCanvasStore } from '../../stores/canvas'
import { useFilmStudyStore } from '../../stores/film-study'
import { useSettingsStore } from '../../stores/settings'

interface StudyNodeCardProps {
  nodeId: string
  data: CineNodeData
}

const INTERVAL_OPTIONS = [
  { value: '0', label: '自动分镜（推荐）' },
  { value: '0.5', label: '0.5 秒 / 镜' },
  { value: '1', label: '1 秒 / 镜' },
  { value: '2', label: '2 秒 / 镜' },
  { value: '5', label: '5 秒 / 镜' }
]

export function StudyNodeCard({ nodeId, data }: StudyNodeCardProps) {
  const providers = useSettingsStore((state) => state.providers)
  const runAuto = useFilmStudyStore((state) => state.runAuto)
  const cancel = useFilmStudyStore((state) => state.cancel)
  const openSheet = useFilmStudyStore((state) => state.openSheet)
  const opening = useFilmStudyStore((state) => state.sheetLoading)
  const summary = data.studySummary
  const busy = data.status === 'queued' || data.status === 'running'
  const ready = data.status === 'done' && Boolean(data.studyId)
  const [interval, setInterval] = useState(String(data.studyInterval ?? 0))
  const [modelKey, setModelKey] = useState(data.studyModelKey ?? '')
  const [storyboard, setStoryboard] = useState(
    data.studyOutputs?.storyboard !== false
  )
  const [sheet, setSheet] = useState(data.studyOutputs?.sheet !== false)
  const [motion, setMotion] = useState(data.studyOutputs?.motion === true)
  const [music, setMusic] = useState(data.studyOutputs?.music === true)

  useEffect(() => {
    setInterval(String(data.studyInterval ?? 0))
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
      interval: Number(interval) || 0,
      modelKey: modelKey === 'none' ? 'none' : modelKey || undefined,
      outputs
    })
  }

  return (
    <div
      className="study-node-card"
      onDoubleClick={(event) => {
        event.stopPropagation()
        if (ready) void openSheet(nodeId)
      }}
    >
      <div className="study-node-card__head">
        <span className="study-node-card__badge">
          <Icon name="film" size={12} />
          逐帧拉片
        </span>
        <span className="study-node-card__source" title={data.sourceName}>
          {data.sourceName ?? data.sourcePath ?? '未连接视频'}
        </span>
      </div>

      {summary ? (
        <div className="study-node-card__meta">
          {summary.segmentCount} 个分镜 · {summary.frameCount} 帧 ·{' '}
          {Math.round(summary.duration)}s
        </div>
      ) : (
        <div className="study-node-card__meta">
          连到视频节点后开始拆解分镜
        </div>
      )}

      {busy ? (
        <>
          <div className="study-node-card__progress">
            <div
              className="study-node-card__progress-fill"
              style={{ width: `${Math.max(2, data.progress ?? 0)}%` }}
            />
          </div>
          <button
            type="button"
            className="btn-secondary btn-sm nodrag nopan"
            onClick={(event) => {
              event.stopPropagation()
              void cancel(nodeId)
            }}
          >
            取消拉片
          </button>
        </>
      ) : (
        <>
          <label className="study-node-card__field nodrag nopan">
            <span>分镜精度</span>
            <Select
              value={interval}
              options={INTERVAL_OPTIONS}
              onChange={(value) => setInterval(value)}
            />
          </label>

          <label className="study-node-card__field nodrag nopan">
            <span>AI 描述</span>
            <Select
              value={modelKey}
              options={modelOptions}
              onChange={(value) => setModelKey(value)}
            />
          </label>

          <div className="study-node-card__chips nodrag nopan">
            <button
              type="button"
              className={`study-node-card__chip${
                storyboard ? ' is-active' : ''
              }`}
              onClick={(event) => {
                event.stopPropagation()
                setStoryboard((value) => !value)
              }}
            >
              分镜组
            </button>
            <button
              type="button"
              className={`study-node-card__chip${sheet ? ' is-active' : ''}`}
              onClick={(event) => {
                event.stopPropagation()
                setSheet((value) => !value)
              }}
            >
              分镜表
            </button>
            <button
              type="button"
              className={`study-node-card__chip${motion ? ' is-active' : ''}`}
              onClick={(event) => {
                event.stopPropagation()
                setMotion((value) => !value)
              }}
            >
              动态切片
            </button>
            <button
              type="button"
              className={`study-node-card__chip${music ? ' is-active' : ''}`}
              onClick={(event) => {
                event.stopPropagation()
                setMusic((value) => !value)
              }}
            >
              BGM
            </button>
          </div>
        </>
      )}

      {data.status === 'error' ? (
        <div className="study-node-card__error" title={data.error}>
          {data.error ?? '拉片失败'}
        </div>
      ) : null}

      {data.studyAnalysisError ? (
        <div className="study-node-card__warn" title={data.studyAnalysisError}>
          AI 描述失败，已保留基础分镜
        </div>
      ) : null}

      <div className="study-node-card__actions">
        {busy ? null : ready ? (
          <>
            <button
              type="button"
              className="study-node-card__enter nodrag nopan"
              disabled={opening}
              onClick={(event) => {
                event.stopPropagation()
                void openSheet(nodeId)
              }}
            >
              <Icon name="film" size={12} />
              {opening ? '正在打开…' : '查看分镜表'}
            </button>
            <button
              type="button"
              className="btn-secondary btn-sm nodrag nopan"
              onClick={(event) => {
                event.stopPropagation()
                start()
              }}
            >
              重新拉片
            </button>
          </>
        ) : (
          <button
            type="button"
            className="btn-primary btn-sm nodrag nopan"
            onClick={(event) => {
              event.stopPropagation()
              start()
            }}
          >
            <Icon name="play" size={12} />
            开始拉片
          </button>
        )}
      </div>

      {data.status === 'error' ? (
        <div className="study-node-card__actions">
          <button
            type="button"
            className="btn-secondary btn-sm nodrag nopan"
            onClick={(event) => {
              event.stopPropagation()
              void useCanvasStore.getState().patchNodeData(nodeId, {
                status: 'idle'
              })
              start()
            }}
          >
            重试拉片
          </button>
        </div>
      ) : null}
    </div>
  )
}
