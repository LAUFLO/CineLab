export interface SubtitleCue {
  startMs: number
  endMs: number
  text: string
}

function parseTimestamp(value: string): number | null {
  const match = /^(?:(\d+):)?(\d{1,2}):(\d{1,2})[.,](\d{1,3})$/.exec(value.trim())
  if (!match) return null
  const [, h, m, s, ms] = match
  return (
    Number(h ?? 0) * 3_600_000 +
    Number(m) * 60_000 +
    Number(s) * 1000 +
    Number(ms.padEnd(3, '0'))
  )
}

function cleanText(lines: string[]): string {
  return lines
    .join(' ')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function splitBlocks(input: string): string[] {
  return input
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
}

/**
 * 解析 SRT / VTT。两种格式的时间轴都形如
 * `00:00:01,000 --> 00:00:04,000`，VTT 允许点号。
 */
export function parseSubtitle(input: string): SubtitleCue[] {
  const cues: SubtitleCue[] = []

  for (const block of splitBlocks(input)) {
    const lines = block.split('\n')
    const timelineIndex = lines.findIndex((line) => line.includes('-->'))
    if (timelineIndex < 0) continue

    const [rawStart, rawEnd] = lines[timelineIndex].split('-->')
    const startMs = parseTimestamp(rawStart ?? '')
    // 去掉 VTT 时间轴后的 cue 设置
    const endToken = (rawEnd ?? '').trim().split(/\s+/)[0] ?? ''
    const endMs = parseTimestamp(endToken)
    if (startMs === null || endMs === null) continue

    const text = cleanText(lines.slice(timelineIndex + 1))
    if (!text) continue

    cues.push({
      startMs: Math.max(0, startMs),
      endMs: Math.max(startMs + 200, endMs),
      text
    })
  }

  cues.sort((a, b) => a.startMs - b.startMs)
  return cues
}
