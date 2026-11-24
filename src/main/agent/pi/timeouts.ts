export const TOOL_TIMEOUT_MS = 30_000

export const LONG_TOOL_TIMEOUTS: Record<string, number> = {
  timeline_auto_subtitles: 15 * 60_000,
  timeline_remove_silence: 10 * 60_000,
  timeline_split_by_shots: 5 * 60_000,
  timeline_beat_markers: 5 * 60_000,
  timeline_beat_split: 5 * 60_000,
  timeline_export: 30 * 60_000,
  stage_export_preview: 30 * 60_000,
  film_study_auto: 30 * 60_000,
  film_study_export: 10 * 60_000,
  canvas_node_operation: 30 * 60_000,
  stem_separate: 30 * 60_000
}

export function toolTimeoutMs(name: string | undefined): number {
  return (name && LONG_TOOL_TIMEOUTS[name]) || TOOL_TIMEOUT_MS
}
