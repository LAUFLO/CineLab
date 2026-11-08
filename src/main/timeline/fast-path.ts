import type { TimelineClip, TimelineDoc } from '@shared/timeline-schema'

/**
 * 快速路径判定：只有一条视频轨、片段首尾相接、无任何画面效果、无文字。
 * 满足时可以直接交给 ffmpeg 拼接，不走逐帧截图。
 */
export function fastPathClips(doc: TimelineDoc): TimelineClip[] | null {
  const videoTracks = doc.tracks.filter((track) => track.kind === 'video')
  if (videoTracks.length !== 1) return null

  const trackId = videoTracks[0].id
  const clips = doc.clips
    .filter((clip) => clip.trackId === trackId)
    .sort((a, b) => a.startMs - b.startMs)

  if (clips.length === 0) return null

  let cursor = 0
  for (const clip of clips) {
    if (clip.kind !== 'video') return null
    if (clip.startMs !== cursor) return null
    if (!clip.media) return null
    if (clip.transform || clip.crop) return null
    if (clip.opacity !== 1 || clip.blend !== 'normal') return null
    if (clip.speed !== 1 || clip.transitionIn) return null
    if (clip.text) return null
    cursor += clip.durationMs
  }

  if (doc.clips.some((clip) => clip.kind === 'text')) return null
  if (doc.clips.some((clip) => clip.kind === 'audio' && !clip.muted)) return null
  return clips
}
