import type { AgentToolCallRequest } from '@shared/agent'
import type { OutputRef } from '@shared/canvas-schema'
import type {
  ClipMove,
  TimelineCommand
} from '@shared/timeline-commands'
import { docDurationMs } from '@shared/timeline-layout'
import {
  MAX_TRACKS,
  TIMELINE_TRANSITION_TYPES,
  createClip,
  createTrack,
  newMarkerId,
  type TimelineClip,
  type TimelineDoc
} from '@shared/timeline-schema'
import { buildRemoveSilencePlan } from '@shared/timeline-tools'
import {
  isFilmNode,
  isStudioNode,
  useCanvasStore
} from '../stores/canvas'
import { referencesFromDoc, upstreamSignature } from '../studio/references'
import { useTimelineStore } from '../stores/timeline'
import { useStudioStore } from '../stores/studio'
import { useAgentStore } from './agentStore'

export interface TimelineToolResult {
  ok: boolean
  result?: unknown
  error?: string
}

function requireTimeline(scope: { timelineId?: string }): TimelineDoc {
  if (!useStudioStore.getState().open) {
    throw new Error('请先打开剪辑室')
  }
  const doc = useTimelineStore.getState().doc
  if (!doc) throw new Error('时间线还没有加载')
  if (scope.timelineId && doc.id !== scope.timelineId) {
    throw new Error('当前剪辑室已切换，请重新发送指令')
  }
  return doc
}

function findClips(doc: TimelineDoc, clipIds: string[]): TimelineClip[] {
  const clips: TimelineClip[] = []
  for (const clipId of clipIds) {
    const clip = doc.clips.find((item) => item.id === clipId)
    if (!clip) throw new Error(`找不到片段 ${clipId}`)
    clips.push(clip)
  }
  return clips
}

function clipSummary(clip: TimelineClip): Record<string, unknown> {
  return {
    id: clip.id,
    trackId: clip.trackId,
    kind: clip.kind,
    name: clip.name,
    startMs: Math.round(clip.startMs),
    durationMs: Math.round(clip.durationMs),
    endMs: Math.round(clip.startMs + clip.durationMs),
    sourceStartMs: Math.round(clip.sourceStartMs),
    speed: clip.speed,
    muted: clip.muted,
    volume: clip.volume,
    opacity: clip.opacity,
    ...(clip.media ? { mediaPath: clip.media.path, mediaKind: clip.media.kind } : {}),
    ...(clip.text
      ? { text: clip.text.content.slice(0, 500) }
      : {}),
    ...(clip.transitionIn
      ? {
          transitionIn: clip.transitionIn.type,
          transitionDurationMs: clip.transitionIn.durationMs
        }
      : {})
  }
}

function timelineSummary(doc: TimelineDoc): Record<string, unknown> {
  const state = useTimelineStore.getState()
  return {
    timelineId: doc.id,
    name: doc.name,
    video: doc.video,
    durationMs: Math.round(docDurationMs(doc)),
    playheadMs: Math.round(state.playheadMs),
    selectedClipIds: state.selectedIds,
    clipCount: doc.clips.length,
    trackCount: doc.tracks.length,
    tracks: doc.tracks.map((track) => ({
      id: track.id,
      kind: track.kind,
      name: track.name,
      visible: track.visible,
      muted: track.muted,
      locked: track.locked
    })),
    clips: doc.clips.slice(0, 200).map(clipSummary),
    ...(doc.clips.length > 200
      ? { clipsTruncated: true }
      : {}),
    markers: doc.markers.slice(0, 200).map((marker) => ({
      id: marker.id,
      atMs: marker.atMs,
      label: marker.label,
      ...(marker.color ? { color: marker.color } : {})
    }))
  }
}

function apply(
  commands: TimelineCommand[],
  turnId: string
): void {
  useTimelineStore.getState().dispatchMany(commands, turnId)
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function subtitleText(content: string) {
  return {
    content,
    fontFamily: 'Arial',
    fontSize: 64,
    color: '#ffffff',
    bold: false,
    italic: false,
    align: 'center' as const,
    stroke: { color: '#000000', width: 2 },
    shadow: { color: '#000000', blur: 8, offsetX: 0, offsetY: 2 }
  }
}

function isMediaClip(clip: TimelineClip): boolean {
  return (
    Boolean(clip.media) &&
    (clip.kind === 'video' || clip.kind === 'audio') &&
    !clip.muted
  )
}

function selectedMediaClips(doc: TimelineDoc): TimelineClip[] {
  const selected = new Set(useTimelineStore.getState().selectedIds)
  return doc.clips.filter((clip) => selected.has(clip.id) && isMediaClip(clip))
}

function unlockedMediaClips(doc: TimelineDoc): TimelineClip[] {
  return doc.clips.filter((clip) => {
    if (!isMediaClip(clip)) return false
    return !clipOnLockedTrack(doc, clip)
  })
}

function clipOnLockedTrack(doc: TimelineDoc, clip: TimelineClip): boolean {
  return doc.tracks.find((item) => item.id === clip.trackId)?.locked === true
}

/** 长任务执行期间如果本轮已结束或取消，立即停止，避免迟到的写操作。 */
function ensureTurnActive(turnId: string): void {
  if (useAgentStore.getState().currentTurnId !== turnId) {
    throw new Error('本轮已结束或已取消')
  }
}

function runWithTurn<T>(
  turnId: string,
  promise: Promise<T>,
  onCancel?: () => void
): Promise<T> {
  let settled = false
  return new Promise<T>((resolve, reject) => {
    const timer = setInterval(() => {
      if (settled) return
      if (useAgentStore.getState().currentTurnId === turnId) return
      settled = true
      clearInterval(timer)
      onCancel?.()
      reject(new Error('已取消'))
    }, 500)

    promise.then(
      (value) => {
        if (settled) return
        settled = true
        clearInterval(timer)
        resolve(value)
      },
      (error: unknown) => {
        if (settled) return
        settled = true
        clearInterval(timer)
        reject(error)
      }
    )
  })
}

async function docHasAudio(doc: TimelineDoc): Promise<boolean> {
  if (
    doc.clips.some(
      (clip) => clip.kind === 'audio' && !clip.muted && Boolean(clip.media)
    )
  ) {
    return true
  }

  const paths = [
    ...new Set(
      doc.clips
        .filter(
          (clip) =>
            clip.kind === 'video' && !clip.muted && Boolean(clip.media)
        )
        .map((clip) => clip.media!.path)
    )
  ]
  const probes = await Promise.all(
    paths.map((path) =>
      window.api.media
        .probe(path)
        .then((probe) => probe.hasAudio)
        .catch(() => false)
    )
  )
  return probes.some(Boolean)
}

export async function executeTimelineTool(
  call: AgentToolCallRequest
): Promise<TimelineToolResult> {
  try {
    const doc = requireTimeline(call.scope)
    const turnId = call.turnId

    if (call.name === 'timeline_get') {
      return { ok: true, result: timelineSummary(doc) }
    }

    if (call.name === 'timeline_select_clips') {
      const clipIds = Array.isArray(call.args.clipIds)
        ? call.args.clipIds.map(String)
        : []
      if (clipIds.length > 0) findClips(doc, clipIds)
      useTimelineStore.getState().select(clipIds)
      return {
        ok: true,
        result: { selectedClipIds: clipIds }
      }
    }

    if (call.name === 'timeline_move_clips') {
      const clipIds = Array.isArray(call.args.clipIds)
        ? call.args.clipIds.map(String)
        : []
      const clips = findClips(doc, clipIds)
      const minStart = Math.min(...clips.map((clip) => clip.startMs))
      const startMs =
        typeof call.args.startMs === 'number' ? call.args.startMs : undefined
      const deltaMs =
        typeof call.args.deltaMs === 'number' ? call.args.deltaMs : undefined
      const offset =
        startMs !== undefined ? startMs - minStart : deltaMs ?? 0

      const moves: ClipMove[] = clips.map((clip) => {
        const nextStart = Math.round(clip.startMs + offset)
        if (nextStart < 0) {
          throw new Error('移动后片段起点不能小于 0')
        }
        return {
          clipId: clip.id,
          startMs: nextStart,
          trackId: clip.trackId
        }
      })

      const mode =
        call.args.mode === 'overwrite' ? 'overwrite' : 'insert'
      apply([{ op: 'moveClips', moves, mode }], turnId)
      const nextDoc = requireTimeline(call.scope)
      return {
        ok: true,
        result: {
          moves: moves.map((move) => ({
            clipId: move.clipId,
            startMs: move.startMs,
            trackId: move.trackId
          })),
          durationMs: Math.round(docDurationMs(nextDoc))
        }
      }
    }

    if (call.name === 'timeline_trim_clip') {
      const clipId = String(call.args.clipId ?? '')
      findClips(doc, [clipId])
      const edge = call.args.edge === 'start' ? 'start' : 'end'
      const deltaMs = Number(call.args.deltaMs)
      apply(
        [
          {
            op: 'trimClip',
            clipId,
            edge,
            deltaMs,
            ...(typeof call.args.ripple === 'boolean'
              ? { ripple: call.args.ripple }
              : {})
          }
        ],
        turnId
      )
      const nextDoc = requireTimeline(call.scope)
      const clip = nextDoc.clips.find((item) => item.id === clipId)
      return {
        ok: true,
        result: {
          clip: clip ? clipSummary(clip) : null,
          durationMs: Math.round(docDurationMs(nextDoc))
        }
      }
    }

    if (call.name === 'timeline_split_clips') {
      const clipIds = Array.isArray(call.args.clipIds)
        ? call.args.clipIds.map(String)
        : []
      findClips(doc, clipIds)
      const atMs = Math.round(Number(call.args.atMs))
      apply([{ op: 'splitClips', clipIds, atMs }], turnId)
      const nextDoc = requireTimeline(call.scope)
      return {
        ok: true,
        result: {
          atMs,
          clipCount: nextDoc.clips.length,
          durationMs: Math.round(docDurationMs(nextDoc))
        }
      }
    }

    if (call.name === 'timeline_remove_clips') {
      const clipIds = Array.isArray(call.args.clipIds)
        ? call.args.clipIds.map(String)
        : []
      findClips(doc, clipIds)
      apply(
        [
          {
            op: 'removeClips',
            clipIds,
            ...(typeof call.args.ripple === 'boolean'
              ? { ripple: call.args.ripple }
              : {})
          }
        ],
        turnId
      )
      const nextDoc = requireTimeline(call.scope)
      return {
        ok: true,
        result: {
          removedClipIds: clipIds,
          clipCount: nextDoc.clips.length,
          durationMs: Math.round(docDurationMs(nextDoc))
        }
      }
    }

    if (call.name === 'timeline_update_clip') {
      const clipId = String(call.args.clipId ?? '')
      findClips(doc, [clipId])
      const patch =
        call.args.patch &&
        typeof call.args.patch === 'object' &&
        !Array.isArray(call.args.patch)
          ? (call.args.patch as Record<string, unknown>)
          : {}

      const commands: TimelineCommand[] = []
      const { speed, ...rest } = patch
      if (typeof speed === 'number' && Number.isFinite(speed)) {
        commands.push({ op: 'setClipSpeed', clipId, speed })
      }
      if (Object.keys(rest).length > 0) {
        commands.push({
          op: 'updateClip',
          clipId,
          patch: rest as Partial<TimelineClip>
        })
      }
      if (commands.length === 0) {
        return { ok: false, error: '没有可修改的属性' }
      }

      apply(commands, turnId)
      const nextDoc = requireTimeline(call.scope)
      const clip = nextDoc.clips.find((item) => item.id === clipId)
      return {
        ok: true,
        result: { clip: clip ? clipSummary(clip) : null }
      }
    }

    if (call.name === 'timeline_set_track') {
      const trackId = String(call.args.trackId ?? '')
      if (!doc.tracks.some((track) => track.id === trackId)) {
        throw new Error(`找不到轨道 ${trackId}`)
      }
      const flag =
        call.args.flag === 'visible' ||
        call.args.flag === 'muted' ||
        call.args.flag === 'locked'
          ? call.args.flag
          : 'visible'
      apply(
        [
          {
            op: 'setTrackFlag',
            trackId,
            flag,
            value: Boolean(call.args.value)
          }
        ],
        turnId
      )
      const track = requireTimeline(call.scope).tracks.find(
        (item) => item.id === trackId
      )
      return {
        ok: true,
        result: {
          track: track
            ? {
                id: track.id,
                name: track.name,
                visible: track.visible,
                muted: track.muted,
                locked: track.locked
              }
            : null
        }
      }
    }

    if (call.name === 'timeline_add_marker') {
      const atMs = Math.round(Number(call.args.atMs))
      const marker = {
        id: newMarkerId(),
        atMs,
        label:
          typeof call.args.label === 'string' ? call.args.label : '标记',
        ...(typeof call.args.color === 'string'
          ? { color: call.args.color }
          : {})
      }
      apply([{ op: 'addMarker', marker }], turnId)
      return { ok: true, result: { marker } }
    }

    if (call.name === 'timeline_auto_subtitles') {
      const explicitId =
        typeof call.args.clipId === 'string' ? call.args.clipId.trim() : ''
      const state = useTimelineStore.getState()
      let source: TimelineClip | undefined

      if (explicitId) {
        source = findClips(doc, [explicitId])[0]
        if (
          !source.media ||
          (source.kind !== 'video' && source.kind !== 'audio')
        ) {
          throw new Error('自动字幕只支持视频或音频片段')
        }
      } else {
        const selected = new Set(state.selectedIds)
        source = doc.clips.find(
          (clip) => selected.has(clip.id) && isMediaClip(clip)
        )
      }

      if (!source && doc.clips.length === 0) {
        throw new Error('时间线还是空的，先添加片段')
      }

      const status = await window.api.components.status()
      const missing = ['whisper-runtime', 'whisper-model'].filter(
        (kind) =>
          status.find((item) => item.kind === kind)?.state !== 'installed'
      )
      if (missing.length > 0) {
        throw new Error(
          '自动字幕需要先在「设置 → 组件」中安装本地字幕运行时和 Whisper Base 模型'
        )
      }
      ensureTurnActive(turnId)

      const result = await runWithTurn(
        turnId,
        window.api.timeline.transcribe(
          source?.media
            ? {
                mode: 'clip',
                path: source.media.path,
                scope: source.media.scope,
                sourceStartMs: source.sourceStartMs,
                durationMs: source.durationMs,
                speed: source.speed
              }
            : { mode: 'timeline', doc }
        ),
        () => {
          void window.api.timeline.cancelTranscribe()
        }
      )

      if (result.segments.length === 0) {
        return { ok: false, error: '没有识别到语音' }
      }

      const latest = requireTimeline(call.scope)
      let track = latest.tracks.find(
        (item) => item.kind === 'subtitle' && !item.locked
      )
      const commands: TimelineCommand[] = []
      if (!track) {
        if (latest.tracks.length >= MAX_TRACKS) {
          throw new Error('轨道数量已达上限，无法添加字幕轨')
        }
        track = createTrack('subtitle', '字幕 1')
        commands.push({ op: 'addTrack', track })
      }

      const subtitleTrackId = track.id
      const speed = clamp(source?.speed ?? 1, 0.1, 10)
      const clips = result.segments.map((segment) =>
        createClip({
          trackId: subtitleTrackId,
          kind: 'text',
          name: segment.text.slice(0, 60),
          startMs: Math.max(
            0,
            Math.round(
              source
                ? source.startMs + segment.startMs / speed
                : segment.startMs
            )
          ),
          durationMs: Math.max(
            200,
            Math.round(
              source ? segment.durationMs / speed : segment.durationMs
            )
          ),
          text: subtitleText(segment.text)
        })
      )
      commands.push({ op: 'addClips', clips })
      apply(commands, turnId)
      useTimelineStore.getState().select([clips[0].id])

      return {
        ok: true,
        result: {
          trackId: subtitleTrackId,
          clipCount: clips.length,
          language: result.language ?? null,
          sourceClipId: source?.id ?? null
        }
      }
    }

    if (call.name === 'timeline_remove_silence') {
      const explicitIds = Array.isArray(call.args.clipIds)
        ? call.args.clipIds.map(String)
        : []
      let targets: TimelineClip[]
      let scopedTrackIds: string[] | undefined

      if (explicitIds.length > 0) {
        targets = findClips(doc, explicitIds)
        const invalid = targets.find((clip) => !isMediaClip(clip))
        if (invalid) {
          throw new Error(
            `片段 ${invalid.id} 不是未静音的视频或音频片段`
          )
        }
        const locked = targets.find((clip) => clipOnLockedTrack(doc, clip))
        if (locked) {
          throw new Error(`片段 ${locked.id} 所在轨道已锁定`)
        }
        scopedTrackIds = [...new Set(targets.map((clip) => clip.trackId))]
      } else {
        const selected = selectedMediaClips(doc)
        if (selected.length > 0) {
          const locked = selected.find((clip) => clipOnLockedTrack(doc, clip))
          if (locked) {
            throw new Error(`片段 ${locked.id} 所在轨道已锁定`)
          }
          targets = selected
          scopedTrackIds = [...new Set(targets.map((clip) => clip.trackId))]
        } else {
          targets = unlockedMediaClips(doc)
        }
      }

      if (targets.length === 0) {
        return { ok: false, error: '时间线上没有可检测的视频或音频片段' }
      }

      const paddingMs = clamp(
        typeof call.args.paddingMs === 'number' ? call.args.paddingMs : 120,
        0,
        10_000
      )
      const minDurationMs = clamp(
        typeof call.args.minDurationMs === 'number'
          ? call.args.minDurationMs
          : 400,
        0,
        10_000
      )
      const ranges: Array<{ startMs: number; endMs: number }> = []
      let failed = 0

      for (const item of targets) {
        ensureTurnActive(turnId)
        if (!item.media) continue
        try {
          const result = await window.api.timeline.analyze({
            kind: 'silences',
            path: item.media.path,
            scope: item.media.scope,
            sourceStartMs: item.sourceStartMs,
            durationMs: item.durationMs,
            speed: item.speed
          })
          for (const marker of result.markers) {
            if (!marker.durationMs) continue
            ranges.push({
              startMs: item.startMs + marker.atMs,
              endMs: item.startMs + marker.atMs + marker.durationMs
            })
          }
        } catch {
          failed += 1
        }
      }

      ensureTurnActive(turnId)
      const latest = requireTimeline(call.scope)
      const plan = buildRemoveSilencePlan(latest, ranges, {
        paddingMs,
        minDurationMs,
        ripple: call.args.ripple !== false,
        ...(scopedTrackIds ? { trackIds: scopedTrackIds } : {})
      })

      if (plan.commands.length === 0) {
        return {
          ok: true,
          result: {
            summary: plan.summary,
            removedMs: 0,
            rangeCount: 0,
            failedClipCount: failed
          }
        }
      }

      apply(plan.commands, turnId)
      useTimelineStore.getState().select([])
      return {
        ok: true,
        result: {
          summary: plan.summary,
          removedMs: plan.removedMs,
          rangeCount: plan.rangeCount,
          failedClipCount: failed,
          durationMs: Math.round(docDurationMs(requireTimeline(call.scope)))
        }
      }
    }

    if (call.name === 'timeline_set_transition') {
      const clipId = String(call.args.clipId ?? '')
      const clip = findClips(doc, [clipId])[0]
      if (clipOnLockedTrack(doc, clip)) {
        throw new Error('片段所在轨道已锁定，无法修改转场')
      }
      if (clip.kind === 'audio') {
        throw new Error('音频片段不支持转场')
      }
      const type = String(call.args.type)
      const durationMs = clamp(
        typeof call.args.durationMs === 'number'
          ? call.args.durationMs
          : 500,
        100,
        10_000
      )
      const transition =
        type === 'none'
          ? undefined
          : {
              type: type as (typeof TIMELINE_TRANSITION_TYPES)[number],
              durationMs
            }

      apply(
        [
          {
            op: 'updateClip',
            clipId,
            patch: { transitionIn: transition }
          }
        ],
        turnId
      )

      const nextDoc = requireTimeline(call.scope)
      const next = nextDoc.clips.find((item) => item.id === clipId)
      return {
        ok: true,
        result: {
          clip: next ? clipSummary(next) : null,
          transition: transition ?? null
        }
      }
    }

    if (call.name === 'timeline_export') {
      if (doc.clips.length === 0) {
        return { ok: false, error: '时间线为空，先添加片段' }
      }
      const codec =
        call.args.codec === 'hevc' || call.args.codec === 'av1'
          ? call.args.codec
          : 'h264'
      const result = await runWithTurn(
        turnId,
        window.api.timeline.export(doc, { codec }),
        () => {
          void window.api.timeline.cancelExport()
        }
      )

      if (result.canceled) {
        return { ok: false, error: '导出已取消' }
      }
      if (!result.ok || !result.path) {
        return { ok: false, error: '导出失败' }
      }

      let filmNodeId: string | undefined
      const canvasState = useCanvasStore.getState()
      const studioNode = call.scope.studioNodeId
        ? canvasState.nodes.find(
            (node) => node.id === call.scope.studioNodeId
          )
        : undefined

      if (studioNode && isStudioNode(studioNode)) {
        const linked = studioNode.data.filmNodeId
          ? canvasState.nodes.find(
              (node) => node.id === studioNode.data.filmNodeId
            )
          : undefined
        const film =
          linked && isFilmNode(linked)
            ? linked
            : canvasState.nodes.find(
                (node) =>
                  isFilmNode(node) &&
                  node.data.studioNodeId === studioNode.id
              )

        if (film && isFilmNode(film)) {
          const output: OutputRef = {
            id: `film_${Date.now().toString(36)}`,
            path: result.path,
            scope: 'project',
            kind: 'video',
            createdAt: new Date().toISOString(),
            model: '剪辑室',
            width: doc.video.width,
            height: doc.video.height,
            duration: docDurationMs(doc) / 1000,
            fps: doc.video.fps,
            hasAudio: await docHasAudio(doc)
          }
          canvasState.applyFilmOutput(film.id, output)
          canvasState.patchFilmNode(film.id, {
            upstreamAck: upstreamSignature(
              referencesFromDoc(doc),
              useCanvasStore.getState().nodes
            )
          })
          filmNodeId = film.id
        }
      }

      return {
        ok: true,
        result: {
          path: result.path,
          filmNodeId: filmNodeId ?? null,
          durationMs: Math.round(docDurationMs(doc)),
          width: doc.video.width,
          height: doc.video.height,
          fps: doc.video.fps
        }
      }
    }

    return { ok: false, error: `未实现的剪辑工具：${call.name}` }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : '剪辑工具执行失败'
    }
  }
}
