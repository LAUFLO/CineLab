import { useEffect, useMemo, useRef, useState } from 'react'
import type { FilmStudySegment } from '@shared/film-study'

import { Icon } from '../../components/Icon'
import { assetUrl } from '../../lib/asset-url'
import { useCanvasStore } from '../../stores/canvas'
import { useFilmStudyStore } from '../../stores/film-study'
import { usePreferencesStore } from '../../stores/preferences'
import { useSettingsStore } from '../../stores/settings'
import { useUIStore } from '../../stores/ui'
import { VideoPlayer, type VideoPlayerHandle } from './VideoPlayer'
import { EmotionPanel, StructurePanel } from './FilmStudyInsights'
import {
  Button,
  Textarea,
  Input,
  Select,
  IconButton,
  cn
} from '../../components/ui'

const ITEM_WIDTH = 104
const ITEM_GAP = 6
const STEP = ITEM_WIDTH + ITEM_GAP
const PADDING = 12

const SEGMENT_TYPES = [
  '开场',
  '起',
  '承',
  '转',
  '合',
  '冲突',
  '推进',
  '转折',
  '升级',
  '低谷',
  '高潮',
  '结尾',
  '支线',
  '过渡'
] as const

function studyTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const rest = Math.max(0, seconds - minutes * 60)
  return `${String(minutes).padStart(2, '0')}:${rest.toFixed(1).padStart(4, '0')}`
}

const SIDE_TITLE_CLASS = 'mb-1.5 text-[11px] text-fg-subtle'
const EMPTY_CLASS = 'py-2 text-[11px] text-fg-subtle'

const EDITOR_INPUT_CLASS =
  '!h-auto !min-h-[30px] !rounded-md !border-border-strong !px-2 !py-1.5 !text-xs !leading-[1.5] focus:!border-border-selected'
const EDITOR_TEXTAREA_CLASS =
  '!min-h-12 !rounded-md !border-border-strong !px-2 !py-1.5 !text-xs !leading-[1.5] focus:!border-border-selected'

const SUBTITLE_ROW_CLASS =
  '!flex w-full !items-start !justify-start gap-1.5 !rounded-md px-[5px] py-1 text-left !font-normal text-fg-muted'

const SEGMENT_MAIN_CLASS =
  '!flex min-w-0 flex-1 !items-center !justify-start gap-[7px] px-[5px] py-1 text-left !font-normal text-fg-muted hover:!bg-transparent hover:!text-fg-muted'

const FRAME_BASE_CLASS =
  '!absolute top-3 !flex h-[112px] w-[104px] flex-col !items-stretch !justify-start gap-1 !rounded-card border border-border bg-surface p-[5px] text-left !font-normal !text-fg-subtle hover:!border-border-strong hover:!bg-surface hover:!text-fg-subtle'
const FRAME_ACTIVE_CLASS = '!border-border-selected !text-fg hover:!text-fg'

export function FilmStudyRoom() {
  const study = useFilmStudyStore((state) => state.study)
  const closeRoom = useFilmStudyStore((state) => state.closeRoom)
  const updateStudy = useFilmStudyStore((state) => state.updateStudy)
  const replaceStudy = useFilmStudyStore((state) => state.replaceStudy)
  const saveStudyNow = useFilmStudyStore((state) => state.saveNow)
  const showToast = useUIStore((state) => state.showToast)
  const requestConfirm = useUIStore((state) => state.requestConfirm)
  const providers = useSettingsStore((state) => state.providers)
  const defaultTextModel = usePreferencesStore(
    (state) => state.preferences.generation.defaultModels.text
  )
  const playerRef = useRef<VideoPlayerHandle>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [inIndex, setInIndex] = useState(0)
  const [outIndex, setOutIndex] = useState(1)
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(
    null
  )
  const [tab, setTab] = useState<'notes' | 'structure' | 'emotion'>('notes')
  const [playingSegment, setPlayingSegment] = useState<{
    id: string
    endTime: number
  } | null>(null)
  const [contactBusy, setContactBusy] = useState(false)
  const [analysisOpen, setAnalysisOpen] = useState(false)
  const [analysisModel, setAnalysisModel] = useState('')
  const [analysisBusy, setAnalysisBusy] = useState(false)
  const [scrollLeft, setScrollLeft] = useState(0)
  const [viewportWidth, setViewportWidth] = useState(900)

  useEffect(() => {
    setSelectedIndex(0)
    setInIndex(0)
    setOutIndex(1)
    setSelectedSegmentId(null)
    setPlayingSegment(null)
    setScrollLeft(0)
    setTab('notes')
  }, [study?.id])

  useEffect(() => {
    if (!study) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') closeRoom()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [study, closeRoom])

  useEffect(() => {
    const element = scrollRef.current
    if (!element) return
    const resize = new ResizeObserver(() => {
      setViewportWidth(element.clientWidth)
    })
    resize.observe(element)
    setViewportWidth(element.clientWidth)
    return () => resize.disconnect()
  }, [study?.id])

  const frames = study?.frames ?? []
  const selected = frames[selectedIndex]
  const selectedSegment = study?.segments.find(
    (segment) => segment.id === selectedSegmentId
  )
  const totalWidth = frames.length * STEP + PADDING * 2
  const startIndex = Math.max(0, Math.floor((scrollLeft - PADDING) / STEP) - 3)
  const endIndex = Math.min(
    frames.length,
    startIndex + Math.ceil(viewportWidth / STEP) + 8
  )
  const sourceUrl = useMemo(
    () =>
      study ? assetUrl(study.sourcePath, study.sourceScope ?? 'project') : null,
    [study]
  )

  const textModels = useMemo(
    () =>
      providers.flatMap((provider) =>
        provider.models
          .filter((model) => model.capability === 'text.chat')
          .map((model) => ({
            value: `${provider.id}/${model.id}`,
            label: `${provider.name} / ${model.name}`
          }))
      ),
    [providers]
  )

  useEffect(() => {
    if (!analysisOpen) return
    setAnalysisModel(
      (current) => current || defaultTextModel || textModels[0]?.value || ''
    )
  }, [analysisOpen, defaultTextModel, textModels])

  if (!study) return null

  const indexAt = (time: number): number =>
    Math.max(
      0,
      Math.min(frames.length - 1, Math.round(time / study.frameInterval))
    )

  const seekFrame = (index: number): void => {
    const frame = frames[index]
    if (!frame) return
    setSelectedIndex(index)
    playerRef.current?.seek(frame.time)
  }

  const seekToTime = (time: number): void => {
    setSelectedIndex(indexAt(time))
    playerRef.current?.seek(time)
  }

  const onTimeChange = (time: number): void => {
    if (study.frameInterval <= 0 || frames.length === 0) return
    const index = indexAt(time)
    setSelectedIndex((current) => (current === index ? current : index))

    if (playingSegment && time >= playingSegment.endTime - 0.02) {
      playerRef.current?.pause()
      setPlayingSegment(null)
    }
  }

  const updateFrameNote = (note: string): void => {
    updateStudy((current) => ({
      ...current,
      frames: current.frames.map((frame, index) =>
        index === selectedIndex ? { ...frame, note } : frame
      )
    }))
  }

  const updateSegment = (patch: Partial<FilmStudySegment>): void => {
    if (!selectedSegmentId) return
    updateStudy((current) => ({
      ...current,
      segments: current.segments.map((segment) =>
        segment.id === selectedSegmentId ? { ...segment, ...patch } : segment
      )
    }))
  }

  const createSegment = (): void => {
    const start = Math.min(inIndex, outIndex)
    const end = Math.max(inIndex, outIndex)
    const startFrame = frames[start]
    const endFrame = frames[end]
    if (!startFrame || !endFrame) return

    const segment: FilmStudySegment = {
      id: crypto.randomUUID(),
      startTime: startFrame.time,
      endTime: Math.max(endFrame.time, startFrame.time + study.frameInterval),
      title: `段落 ${study.segments.length + 1}`,
      type: '起'
    }
    updateStudy((current) => ({
      ...current,
      segments: [...current.segments, segment]
    }))
    setSelectedSegmentId(segment.id)
    setSelectedIndex(start)
    playerRef.current?.seek(startFrame.time)
  }

  const selectSegment = (segment: FilmStudySegment): void => {
    setSelectedSegmentId(segment.id)
    const start = indexAt(segment.startTime)
    const end = indexAt(segment.endTime)
    setInIndex(start)
    setOutIndex(end)
    setSelectedIndex(start)
    playerRef.current?.seek(segment.startTime)
  }

  const playSegment = (segment: FilmStudySegment): void => {
    setSelectedSegmentId(segment.id)
    setSelectedIndex(indexAt(segment.startTime))
    playerRef.current?.seek(segment.startTime)
    playerRef.current?.play()
    setPlayingSegment({ id: segment.id, endTime: segment.endTime })
  }

  const deleteSegment = (segment: FilmStudySegment): void => {
    updateStudy((current) => ({
      ...current,
      segments: current.segments.filter((item) => item.id !== segment.id)
    }))
    if (selectedSegmentId === segment.id) setSelectedSegmentId(null)
    if (playingSegment?.id === segment.id) {
      playerRef.current?.pause()
      setPlayingSegment(null)
    }
  }

  const sourceOrigin = (): { x: number; y: number } => {
    const source = useCanvasStore
      .getState()
      .nodes.find((node) => node.id === study.sourceNodeId)
    if (!source) return { x: 200, y: 200 }
    const width = source.measured?.width ?? source.width ?? 480
    const height = source.measured?.height ?? source.height ?? 300
    return {
      x: source.position.x + width + 48,
      y: source.position.y + height + 40
    }
  }

  const addFrameToCanvas = async (): Promise<void> => {
    if (!selected) return
    try {
      const result = await window.api.media.extractFrame({
        path: study.sourcePath,
        mode: 'current',
        time: selected.time
      })
      useCanvasStore
        .getState()
        .addAssetNodes(
          'image',
          sourceOrigin(),
          [result.asset],
          `${study.sourceName} · ${studyTime(selected.time)}`,
          study.sourceNodeId
        )
      showToast('当前帧已放入画布')
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), 'error')
    }
  }

  const addContactSheetToCanvas = async (): Promise<void> => {
    setContactBusy(true)
    try {
      await saveStudyNow()
      const asset = await window.api.filmStudy.contactSheet(study.id)
      useCanvasStore
        .getState()
        .addAssetNodes(
          'image',
          sourceOrigin(),
          [asset],
          `${study.sourceName} · 拉片拼图`,
          study.sourceNodeId
        )
      showToast('拉片拼图已放入画布')
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), 'error')
    } finally {
      setContactBusy(false)
    }
  }

  const addSegmentToCanvas = (): void => {
    if (!selectedSegment) return
    const text = [
      `## ${selectedSegment.title}`,
      '',
      `时间：${studyTime(selectedSegment.startTime)} - ${studyTime(selectedSegment.endTime)}`,
      `类型：${selectedSegment.type}`,
      selectedSegment.segmentFunction
        ? `段落功能：${selectedSegment.segmentFunction}`
        : '',
      selectedSegment.keyBeats ? `关键节拍：${selectedSegment.keyBeats}` : '',
      selectedSegment.creativeIntent
        ? `创作意图：${selectedSegment.creativeIntent}`
        : '',
      selectedSegment.techniques
        ? `视听手法：${selectedSegment.techniques}`
        : '',
      selectedSegment.audienceExperience
        ? `观众体验：${selectedSegment.audienceExperience}`
        : '',
      selectedSegment.notes ? `备注：${selectedSegment.notes}` : ''
    ]
      .filter(Boolean)
      .join('\n')

    const id = useCanvasStore.getState().addNode('text', sourceOrigin())
    useCanvasStore.getState().patchNodeData(id, {
      title: `${study.sourceName} · ${selectedSegment.title}`,
      text,
      status: 'done'
    })
    showToast('段落摘要已放入画布')
  }

  const exportMarkdown = async (): Promise<void> => {
    try {
      await saveStudyNow()
      const result = await window.api.filmStudy.exportMarkdown(study.id)
      if (result.path) showToast('拉片笔记已导出')
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), 'error')
    }
  }

  const exportAnalysisPackage = async (): Promise<void> => {
    try {
      await saveStudyNow()
      const result = await window.api.filmStudy.exportAnalysisPackage(study.id)
      if (result.path) showToast('AI 拉片分析包已导出')
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), 'error')
    }
  }

  const exportBundle = async (): Promise<void> => {
    try {
      await saveStudyNow()
      const result = await window.api.filmStudy.exportBundle(study.id)
      if (result.path) showToast('拉片包已导出')
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), 'error')
    }
  }

  const importAnalysis = (): void => {
    requestConfirm({
      title: '导入 AI 拉片结果',
      message:
        '导入会替换当前 study.json 里的段落、结构和情绪数据。建议先导出 AI 包或备份项目。',
      confirmLabel: '选择 JSON 并导入',
      onConfirm: async () => {
        try {
          const next = await window.api.filmStudy.importAnalysis(study.id)
          if (!next) return
          replaceStudy(next)
          setSelectedSegmentId(next.segments[0]?.id ?? null)
          showToast(`已导入 ${next.segments.length} 个段落`)
        } catch (error) {
          showToast(
            error instanceof Error ? error.message : String(error),
            'error'
          )
        }
      }
    })
  }

  const extractSubtitles = async (): Promise<void> => {
    try {
      const next = await window.api.filmStudy.extractSubtitles(study.id)
      replaceStudy(next)
      showToast(`已提取 ${next.subtitles?.length ?? 0} 条字幕`)
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), 'error')
    }
  }

  const importSubtitles = async (): Promise<void> => {
    try {
      const next = await window.api.filmStudy.importSubtitles(study.id)
      if (!next) return
      replaceStudy(next)
      showToast(`已导入 ${next.subtitles?.length ?? 0} 条字幕`)
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), 'error')
    }
  }

  const runDirectAnalysis = async (): Promise<void> => {
    if (!analysisModel) {
      showToast('请先选择支持图片输入的文本模型', 'error')
      return
    }
    setAnalysisBusy(true)
    try {
      await saveStudyNow()
      const next = await window.api.filmStudy.analyze(study.id, analysisModel)
      replaceStudy(next)
      setSelectedSegmentId(next.segments[0]?.id ?? null)
      setAnalysisOpen(false)
      showToast(`直连分析完成：${next.segments.length} 个段落`)
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), 'error')
    } finally {
      setAnalysisBusy(false)
    }
  }

  const segmentOptions = SEGMENT_TYPES.map((type) => ({
    value: type,
    label: type
  }))

  return (
    <div
      className="fixed inset-0 z-[900] flex items-center justify-center bg-overlay p-6"
      onPointerDown={closeRoom}
    >
      <div
        className="flex h-[min(820px,calc(100vh_-_48px))] w-[min(1280px,calc(100vw_-_48px))] flex-col overflow-hidden rounded-panel border border-border bg-surface shadow-float"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <header className="flex h-[52px] shrink-0 items-center gap-4 border-b border-divider pr-3.5 pl-[18px]">
          <div className="flex min-w-0 items-center gap-[7px] text-[13px] text-fg">
            <Icon name="film" size={15} />
            <span>拉片室</span>
            <span className="max-w-[320px] truncate text-xs text-fg-subtle">
              {study.sourceName}
            </span>
          </div>
          <div className="ml-auto flex items-center gap-3 whitespace-nowrap text-[11px] text-fg-subtle">
            <span>{study.frames.length} 帧</span>
            <span>{study.segments.length} 段</span>
            <span>{study.frameInterval}s / 帧</span>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => void exportMarkdown()}
            >
              导出 Markdown
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => void exportBundle()}
            >
              导出拉片包
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => void exportAnalysisPackage()}
            >
              导出 AI 包
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={importAnalysis}
            >
              导入 AI 结果
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setAnalysisOpen(true)}
            >
              直连分析
            </Button>
          </div>
          <IconButton label="关闭拉片室" size="sm" onClick={closeRoom}>
            <Icon name="close" size={14} />
          </IconButton>
        </header>

        <div className="flex min-h-0 flex-1">
          <div className="flex min-h-0 min-w-0 flex-1 items-center justify-center bg-media-bg p-4 [&_.video-node]:h-full [&_.video-node]:w-[min(100%,760px)] [&_.video-node]:overflow-hidden [&_.video-node]:rounded-card">
            <VideoPlayer
              ref={playerRef}
              src={sourceUrl}
              path={study.sourcePath}
              fps={study.fps}
              onTimeChange={onTimeChange}
            />
          </div>

          <aside className="w-[284px] shrink-0 overflow-y-auto border-l border-divider p-[18px]">
            <div className="mb-3.5 flex gap-0.5 rounded-card bg-surface-hover p-0.5">
              {(
                [
                  ['notes', '笔记'],
                  ['structure', '结构'],
                  ['emotion', '情绪']
                ] as const
              ).map(([id, label]) => (
                <Button
                  key={id}
                  type="button"
                  variant="ghost"
                  size="none"
                  className={cn(
                    'h-[26px] flex-1 !rounded-md text-[11px] !font-normal',
                    tab === id
                      ? 'bg-surface !text-fg hover:!bg-surface'
                      : '!text-fg-subtle hover:!text-fg-muted'
                  )}
                  onClick={() => setTab(id)}
                >
                  {label}
                </Button>
              ))}
            </div>

            {tab === 'notes' ? (
              <>
                <div className={SIDE_TITLE_CLASS}>当前帧</div>
                <div className="mb-5 text-[26px] text-fg tabular-nums">
                  {selected ? studyTime(selected.time) : '00:00.0'}
                </div>
                <div className="flex justify-between gap-3 border-b border-divider py-[7px] text-xs text-fg-muted">
                  <span>帧序号</span>
                  <strong className="font-medium text-fg">
                    {selected?.index ?? 0} / {frames.length}
                  </strong>
                </div>
                <div className="flex justify-between gap-3 border-b border-divider py-[7px] text-xs text-fg-muted">
                  <span>抽帧间隔</span>
                  <strong className="font-medium text-fg">
                    {study.frameInterval}s
                  </strong>
                </div>
                <div className="flex justify-between gap-3 border-b border-divider py-[7px] text-xs text-fg-muted">
                  <span>片长</span>
                  <strong className="font-medium text-fg">
                    {studyTime(study.duration)}
                  </strong>
                </div>

                <Textarea
                  className="mt-3 !min-h-[76px] !rounded-card !border-border-strong !px-[9px] !py-2 !text-xs !leading-[1.55] focus:!border-border-selected"
                  value={selected?.note ?? ''}
                  placeholder="记录这一帧的画面、表演、构图或声音…"
                  onChange={(event) => updateFrameNote(event.target.value)}
                />

                <div className="mt-3.5 rounded-card border border-border bg-surface-raised px-[9px] py-2">
                  <div className="flex items-center justify-between gap-2 text-[11px] text-fg-muted">
                    <span>字幕 {study.subtitles?.length ?? 0} 条</span>
                    <div className="flex gap-1">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => void extractSubtitles()}
                      >
                        提取
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => void importSubtitles()}
                      >
                        导入 SRT
                      </Button>
                    </div>
                  </div>
                  {study.subtitles?.length ? (
                    <details className="mt-1.5">
                      <summary className="cursor-pointer text-[10.5px] text-fg-subtle select-none">
                        查看字幕
                      </summary>
                      <div className="mt-[5px] flex max-h-[180px] flex-col gap-0.5 overflow-y-auto">
                        {(study.subtitles ?? []).map((subtitle, index) => (
                          <Button
                            key={`${subtitle.startTime}-${index}`}
                            type="button"
                            variant="ghost"
                            size="none"
                            className={SUBTITLE_ROW_CLASS}
                            onClick={() => seekToTime(subtitle.startTime)}
                          >
                            <span className="shrink-0 pt-px text-[9.5px] text-fg-subtle tabular-nums">
                              {studyTime(subtitle.startTime)}
                            </span>
                            <strong className="min-w-0 text-[10.5px] leading-[1.45] font-normal">
                              {subtitle.text}
                            </strong>
                          </Button>
                        ))}
                      </div>
                    </details>
                  ) : (
                    <div className="mt-1.5 text-[10.5px] text-fg-subtle">
                      暂无字幕，可提取内嵌字幕或导入 SRT
                    </div>
                  )}
                </div>

                <div className={SIDE_TITLE_CLASS}>段落搭建</div>
                <div className="mb-2 flex items-center gap-1.5 text-[10px] text-fg-subtle">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setInIndex(selectedIndex)
                      if (outIndex < selectedIndex) setOutIndex(selectedIndex)
                    }}
                  >
                    设为入点
                  </Button>
                  <span className="min-w-10 tabular-nums">
                    {studyTime(frames[inIndex]?.time ?? 0)}
                  </span>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setOutIndex(selectedIndex)
                      if (inIndex > selectedIndex) setInIndex(selectedIndex)
                    }}
                  >
                    设为出点
                  </Button>
                  <span className="min-w-10 tabular-nums">
                    {studyTime(frames[outIndex]?.time ?? 0)}
                  </span>
                </div>
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  className="w-full"
                  onClick={createSegment}
                >
                  用当前入点/出点新建段落
                </Button>

                <div className={SIDE_TITLE_CLASS}>段落列表</div>
                <div className="flex flex-col gap-1">
                  {study.segments.length === 0 ? (
                    <div className={EMPTY_CLASS}>还没有段落</div>
                  ) : (
                    [...study.segments]
                      .sort((a, b) => a.startTime - b.startTime)
                      .map((segment) => (
                        <div
                          key={segment.id}
                          className={cn(
                            'flex items-center gap-0.5 rounded-md border border-transparent p-[3px]',
                            segment.id === selectedSegmentId &&
                              'border-border-strong bg-surface-raised'
                          )}
                        >
                          <Button
                            type="button"
                            variant="ghost"
                            size="none"
                            className={SEGMENT_MAIN_CLASS}
                            onClick={() => selectSegment(segment)}
                          >
                            <span className="shrink-0 text-[10px] text-fg-subtle tabular-nums">
                              {studyTime(segment.startTime)}
                            </span>
                            <strong className="truncate text-xs font-medium">
                              {segment.title}
                            </strong>
                          </Button>
                          <IconButton
                            label="播放本段"
                            size="xs"
                            className="!h-[22px] !w-[22px] !rounded-md !text-fg-subtle"
                            onClick={() => playSegment(segment)}
                          >
                            <Icon name="play" size={12} />
                          </IconButton>
                          <IconButton
                            label="删除段落"
                            size="xs"
                            className="!h-[22px] !w-[22px] !rounded-md !text-fg-subtle"
                            onClick={() => deleteSegment(segment)}
                          >
                            <Icon name="trash" size={12} />
                          </IconButton>
                        </div>
                      ))
                  )}
                </div>

                {selectedSegment ? (
                  <div className="mt-4 flex flex-col gap-2 border-t border-divider pt-3">
                    <div className={SIDE_TITLE_CLASS}>段落详情</div>
                    <label className="flex flex-col gap-1 text-[10px] text-fg-subtle">
                      <span>标题</span>
                      <Input
                        className={EDITOR_INPUT_CLASS}
                        value={selectedSegment.title}
                        onChange={(event) =>
                          updateSegment({ title: event.target.value })
                        }
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-[10px] text-fg-subtle">
                      <span>类型</span>
                      <Select
                        value={selectedSegment.type}
                        options={segmentOptions}
                        onChange={(type) => updateSegment({ type })}
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-[10px] text-fg-subtle">
                      <span>剧情线（id 或名称）</span>
                      <Input
                        className={EDITOR_INPUT_CLASS}
                        value={selectedSegment.primaryLine ?? ''}
                        placeholder="例如 main / 主线"
                        onChange={(event) =>
                          updateSegment({ primaryLine: event.target.value })
                        }
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-[10px] text-fg-subtle">
                      <span>共用剧情线（逗号分隔）</span>
                      <Input
                        className={EDITOR_INPUT_CLASS}
                        value={(selectedSegment.sharedLines ?? []).join(', ')}
                        placeholder="例如 romance, information"
                        onChange={(event) =>
                          updateSegment({
                            sharedLines: event.target.value
                              .split(',')
                              .map((item) => item.trim())
                              .filter(Boolean)
                          })
                        }
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-[10px] text-fg-subtle">
                      <span>结构角色</span>
                      <Input
                        className={EDITOR_INPUT_CLASS}
                        value={selectedSegment.structureRole ?? ''}
                        placeholder="例如 铺垫 / 冲突 / 高潮"
                        onChange={(event) =>
                          updateSegment({ structureRole: event.target.value })
                        }
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-[10px] text-fg-subtle">
                      <span>段落功能</span>
                      <Textarea
                        className={EDITOR_TEXTAREA_CLASS}
                        value={selectedSegment.segmentFunction ?? ''}
                        onChange={(event) =>
                          updateSegment({
                            segmentFunction: event.target.value
                          })
                        }
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-[10px] text-fg-subtle">
                      <span>关键节拍</span>
                      <Textarea
                        className={EDITOR_TEXTAREA_CLASS}
                        value={selectedSegment.keyBeats ?? ''}
                        onChange={(event) =>
                          updateSegment({ keyBeats: event.target.value })
                        }
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-[10px] text-fg-subtle">
                      <span>创作意图</span>
                      <Textarea
                        className={EDITOR_TEXTAREA_CLASS}
                        value={selectedSegment.creativeIntent ?? ''}
                        onChange={(event) =>
                          updateSegment({ creativeIntent: event.target.value })
                        }
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-[10px] text-fg-subtle">
                      <span>视听手法</span>
                      <Textarea
                        className={EDITOR_TEXTAREA_CLASS}
                        value={selectedSegment.techniques ?? ''}
                        onChange={(event) =>
                          updateSegment({ techniques: event.target.value })
                        }
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-[10px] text-fg-subtle">
                      <span>观众体验</span>
                      <Textarea
                        className={EDITOR_TEXTAREA_CLASS}
                        value={selectedSegment.audienceExperience ?? ''}
                        onChange={(event) =>
                          updateSegment({
                            audienceExperience: event.target.value
                          })
                        }
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-[10px] text-fg-subtle">
                      <span>备注</span>
                      <Textarea
                        className={EDITOR_TEXTAREA_CLASS}
                        value={selectedSegment.notes ?? ''}
                        onChange={(event) =>
                          updateSegment({ notes: event.target.value })
                        }
                      />
                    </label>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      <Button
                        type="button"
                        variant="primary"
                        size="sm"
                        onClick={playSegment.bind(null, selectedSegment)}
                      >
                        播放本段
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={addSegmentToCanvas}
                      >
                        段落摘要放入画布
                      </Button>
                    </div>
                  </div>
                ) : null}

                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="mt-4 w-full"
                  onClick={() => void addFrameToCanvas()}
                >
                  当前帧放入画布
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="mt-1.5 w-full"
                  disabled={contactBusy}
                  onClick={() => void addContactSheetToCanvas()}
                >
                  {contactBusy ? '正在生成拼图…' : '拉片拼图放入画布'}
                </Button>
              </>
            ) : tab === 'structure' ? (
              <StructurePanel
                study={study}
                selectedSegmentId={selectedSegmentId}
                onSelectSegment={selectSegment}
              />
            ) : (
              <EmotionPanel
                points={study.audienceCurvePoints ?? []}
                duration={study.duration}
                onSeek={seekToTime}
              />
            )}
          </aside>
        </div>

        <div
          ref={scrollRef}
          className="h-[142px] shrink-0 overflow-x-auto overflow-y-hidden border-t border-divider bg-surface-raised"
          onScroll={(event) => setScrollLeft(event.currentTarget.scrollLeft)}
        >
          <div className="relative h-full" style={{ width: totalWidth }}>
            {frames.slice(startIndex, endIndex).map((frame, offset) => {
              const index = startIndex + offset
              return (
                <Button
                  key={frame.index}
                  type="button"
                  variant="ghost"
                  size="none"
                  className={cn(
                    FRAME_BASE_CLASS,
                    index === selectedIndex && FRAME_ACTIVE_CLASS
                  )}
                  style={{ left: PADDING + index * STEP }}
                  onClick={() => seekFrame(index)}
                  title={`${studyTime(frame.time)} · 第 ${frame.index} 帧`}
                >
                  <img
                    src={assetUrl(frame.file, 'project')}
                    alt=""
                    loading="lazy"
                    className="min-h-0 w-full flex-1 rounded-md bg-media-bg object-cover"
                  />
                  <span className="shrink-0 pl-0.5 text-[10px] tabular-nums">
                    {studyTime(frame.time)}
                  </span>
                </Button>
              )
            })}
          </div>
        </div>
      </div>

      {analysisOpen ? (
        <div
          className="absolute inset-0 flex items-center justify-center bg-[color-mix(in_srgb,var(--canvas-bg)_60%,transparent)]"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <div className="flex w-[400px] max-w-[calc(100vw_-_48px)] flex-col gap-3 rounded-card border border-border bg-surface-raised p-[18px] shadow-float">
            <div className="text-sm text-fg">直连多模态分析</div>
            <div className="text-[11px] leading-[1.65] text-fg-subtle">
              选择支持图片输入的文本模型。会抽取最多 12 张代表帧发送，
              结果将替换当前段落。
            </div>
            {textModels.length === 0 ? (
              <div className="rounded-md bg-surface p-2.5 text-[11px] text-fg-subtle">
                还没有 text.chat 模型，请先在设置中配置。
              </div>
            ) : (
              <Select
                value={analysisModel}
                options={textModels}
                onChange={setAnalysisModel}
              />
            )}
            <div className="mt-0.5 flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={analysisBusy}
                onClick={() => setAnalysisOpen(false)}
              >
                取消
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                disabled={
                  analysisBusy || textModels.length === 0 || !analysisModel
                }
                onClick={() => void runDirectAnalysis()}
              >
                {analysisBusy ? '分析中…' : '开始分析'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
