import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import type { TimelineDoc } from '@shared/timeline-schema'

function pad(value: number, length = 2): string {
  return String(value).padStart(length, '0')
}

function vttTime(ms: number): string {
  const total = Math.max(0, Math.round(ms))
  const hours = Math.floor(total / 3_600_000)
  const minutes = Math.floor((total % 3_600_000) / 60_000)
  const seconds = Math.floor((total % 60_000) / 1000)
  const millis = total % 1000
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}.${pad(millis, 3)}`
}

/** 导出字幕轨为独立 WebVTT 文件 */
export async function exportVtt(
  projectRoot: string,
  doc: TimelineDoc
): Promise<string> {
  const tracks = new Map(doc.tracks.map((track) => [track.id, track]))

  const cues = doc.clips
    .filter((clip) => clip.kind === 'text' && clip.text?.content.trim())
    .filter((clip) => {
      const track = tracks.get(clip.trackId)
      return (
        track?.kind === 'subtitle' &&
        track.visible &&
        !track.muted &&
        !clip.muted
      )
    })
    .sort((a, b) => a.startMs - b.startMs)

  if (cues.length === 0) {
    throw new Error('时间线没有可导出的字幕')
  }

  const lines: string[] = ['WEBVTT', '']
  for (const clip of cues) {
    const content = clip
      .text!.content.replace(/\r\n/g, '\n')
      .replace(/\n{2,}/g, '\n')
      .trim()
    lines.push(
      `${vttTime(clip.startMs)} --> ${vttTime(clip.startMs + clip.durationMs)}`
    )
    lines.push(content)
    lines.push('')
  }

  const exportsDir = join(projectRoot, 'exports')
  await fs.mkdir(exportsDir, { recursive: true })
  const fileName = `字幕-${Date.now()}.vtt`
  await fs.writeFile(join(exportsDir, fileName), lines.join('\n'), 'utf8')
  return `exports/${fileName}`
}
