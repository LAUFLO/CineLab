import { useState } from 'react'
import type {
  AgentContext,
  AgentMessage,
  AgentPlanResponse
} from '@shared/agent'
import { parseAgentPlan } from '@shared/agent'
import type { TimeRange } from '@shared/timeline-edit'
import { docDurationMs } from '@shared/timeline-layout'
import {
  buildBeatMarkerPlan,
  buildBeatSplitPlan,
  buildRemoveSilencePlan,
  buildSplitByShotsPlan,
  type TimelinePlan
} from '@shared/timeline-tools'
import type { TimelineClip, TimelineDoc } from '@shared/timeline-schema'
import { useTimelineStore } from '../stores/timeline'
import { useUIStore } from '../stores/ui'

interface PendingPlan {
  plan: TimelinePlan
  label: string
}

const WELCOME =
  '告诉我你想怎么剪，例如「删掉所有静音」「按镜头切开」「标记节拍」「跟着节拍切」。'

function contextOf(doc: TimelineDoc): AgentContext {
  const selectedId = useTimelineStore.getState().selectedIds[0]
  const selected = doc.clips.find((clip) => clip.id === selectedId)

  return {
    timelineName: doc.name,
    durationMs: docDurationMs(doc),
    clipCount: doc.clips.length,
    trackCount: doc.tracks.length,
    markerCount: doc.markers.length,
    selectedClip: selected
      ? {
          id: selected.id,
          kind: selected.kind,
          name: selected.name,
          startMs: selected.startMs,
          durationMs: selected.durationMs,
          hasMedia: Boolean(selected.media)
        }
      : undefined
  }
}

export function AssistantPane() {
  const dispatch = useTimelineStore((state) => state.dispatch)
  const showToast = useUIStore((state) => state.showToast)
  const [messages, setMessages] = useState<AgentMessage[]>([
    { role: 'assistant', content: WELCOME }
  ])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [pending, setPending] = useState<PendingPlan | null>(null)

  const append = (message: AgentMessage): void => {
    setMessages((current) => [...current, message])
  }

  const selectedAudioVisual = (doc: TimelineDoc): TimelineClip | null => {
    const state = useTimelineStore.getState()
    return (
      doc.clips.find(
        (clip) =>
          state.selectedIds.includes(clip.id) &&
          clip.media &&
          (clip.kind === 'video' || clip.kind === 'audio') &&
          !clip.muted
      ) ?? null
    )
  }

  const analyze = async (
    clip: TimelineClip,
    kind: 'shots' | 'silences' | 'beats'
  ): Promise<{ atMs: number; durationMs?: number }[]> => {
    if (!clip.media) return []
    const result = await window.api.timeline.analyze({
      kind,
      path: clip.media.path,
      scope: clip.media.scope,
      sourceStartMs: clip.sourceStartMs,
      durationMs: clip.durationMs,
      speed: clip.speed
    })
    return result.markers
  }

  const buildPlan = async (
    parsed: AgentPlanResponse
  ): Promise<PendingPlan | null> => {
    const state = useTimelineStore.getState()
    const doc = state.doc
    if (!doc) return null

    if (parsed.intent === 'remove_silence') {
      const selected = selectedAudioVisual(doc)
      const targets = selected
        ? [selected]
        : doc.clips.filter((clip) => {
            const track = doc.tracks.find((item) => item.id === clip.trackId)
            return (
              clip.media &&
              (clip.kind === 'video' || clip.kind === 'audio') &&
              !clip.muted &&
              track?.locked !== true
            )
          })
      if (targets.length === 0) {
        append({
          role: 'assistant',
          content: '时间线上没有可检测的视频/音频片段。'
        })
        return null
      }

      const ranges: TimeRange[] = []
      for (const clip of targets) {
        const markers = await analyze(clip, 'silences')
        for (const marker of markers) {
          if (!marker.durationMs) continue
          ranges.push({
            startMs: clip.startMs + marker.atMs,
            endMs: clip.startMs + marker.atMs + marker.durationMs
          })
        }
      }

      return {
        plan: buildRemoveSilencePlan(doc, ranges, {
          paddingMs: 120,
          minDurationMs: 400
        }),
        label: '删静音'
      }
    }

    const source = selectedAudioVisual(doc)
    if (!source) {
      append({
        role: 'assistant',
        content: '请先在时间线上选中一个视频或音频片段。'
      })
      return null
    }

    if (parsed.intent === 'split_by_shots') {
      if (source.kind !== 'video') {
        append({ role: 'assistant', content: '按镜头切分需要选中视频片段。' })
        return null
      }
      const markers = await analyze(source, 'shots')
      return {
        plan: buildSplitByShotsPlan(
          doc,
          source.id,
          markers.map((marker) => source.startMs + marker.atMs),
          { minShotMs: 500, edgePaddingMs: 100 }
        ),
        label: '按镜头切分'
      }
    }

    const markers = await analyze(source, 'beats')
    const beats = markers.map((marker) => source.startMs + marker.atMs)

    if (parsed.intent === 'beat_markers') {
      return {
        plan: buildBeatMarkerPlan(doc, beats),
        label: '节拍标记'
      }
    }

    return {
      plan: buildBeatSplitPlan(doc, beats, {
        trackId: source.kind === 'video' ? source.trackId : undefined
      }),
      label: '节拍切分'
    }
  }

  const send = async (): Promise<void> => {
    const text = input.trim()
    if (!text || sending) return

    const state = useTimelineStore.getState()
    if (!state.doc) {
      showToast('没有打开的时间线', 'error')
      return
    }

    const next = [...messages, { role: 'user' as const, content: text }]
    setMessages(next)
    setInput('')
    setSending(true)
    setPending(null)

    try {
      const result = await window.api.agent.chat({
        profileId: 'clip',
        messages: next.slice(-6),
        context: contextOf(state.doc)
      })
      const parsed = parseAgentPlan(result.content)
      append({ role: 'assistant', content: parsed.reply })

      if (parsed.intent === 'answer' || parsed.intent === 'unsupported') {
        return
      }

      const built = await buildPlan(parsed)
      if (!built) return
      if (built.plan.commands.length === 0) {
        append({ role: 'assistant', content: built.plan.summary })
        return
      }
      setPending(built)
    } catch (error) {
      append({
        role: 'assistant',
        content: error instanceof Error ? error.message : String(error)
      })
    } finally {
      setSending(false)
    }
  }

  const apply = (): void => {
    if (!pending) return
    const latest = useTimelineStore.getState()
    if (!latest.doc) return

    latest.dispatch({
      op: 'batch',
      label: `助手 · ${pending.label}`,
      commands: pending.plan.commands
    })
    latest.select([])
    showToast(pending.plan.summary)
    append({ role: 'assistant', content: `已应用：${pending.plan.summary}` })
    setPending(null)
  }

  return (
    <div className="studio-assistant">
      <div className="studio-assistant__messages">
        {messages.map((message, index) => (
          <div
            key={`${message.role}-${index}`}
            className={`studio-assistant__message ${
              message.role === 'user' ? 'is-user' : ''
            }`}
          >
            {message.content}
          </div>
        ))}

        {sending ? (
          <div className="studio-assistant__message is-pending">思考中…</div>
        ) : null}

        {pending ? (
          <div className="studio-assistant__plan">
            <div className="studio-assistant__plan-title">{pending.label}</div>
            <div className="studio-assistant__plan-summary">
              {pending.plan.summary}
            </div>
            {pending.plan.warnings.map((warning) => (
              <div key={warning} className="studio-assistant__warning">
                {warning}
              </div>
            ))}
            <div className="studio-assistant__plan-actions">
              <button
                type="button"
                className="studio-ghost-btn"
                onClick={() => setPending(null)}
              >
                取消
              </button>
              <button
                type="button"
                className="studio-ghost-btn is-primary"
                onClick={apply}
              >
                应用
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="studio-assistant__compose">
        <textarea
          value={input}
          rows={2}
          placeholder="例如：删掉所有静音"
          disabled={sending}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              void send()
            }
          }}
        />
        <button
          type="button"
          className="studio-ghost-btn is-primary"
          disabled={sending || !input.trim()}
          onClick={() => void send()}
        >
          {sending ? '处理中…' : '发送'}
        </button>
      </div>
    </div>
  )
}
