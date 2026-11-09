import type { AgentToolCallRequest } from '@shared/agent'
import type {
  ClipMove,
  TimelineCommand
} from '@shared/timeline-commands'
import { docDurationMs } from '@shared/timeline-layout'
import {
  newMarkerId,
  type TimelineClip,
  type TimelineDoc
} from '@shared/timeline-schema'
import { useTimelineStore } from '../stores/timeline'
import { useStudioStore } from '../stores/studio'

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
      ? { transitionIn: clip.transitionIn.type }
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

export function executeTimelineTool(
  call: AgentToolCallRequest
): TimelineToolResult {
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

    return { ok: false, error: `未实现的剪辑工具：${call.name}` }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : '剪辑工具执行失败'
    }
  }
}
