import type { FilmStudy, FilmStudySegment } from '@shared/film-study'

export function studyClock(seconds: number): string {
  const total = Math.max(0, seconds)
  const minutes = Math.floor(total / 60)
  const rest = total % 60
  const whole = Math.floor(rest)
  const tenth = Math.floor((rest - whole) * 10)
  return `${String(minutes).padStart(2, '0')}:${String(whole).padStart(2, '0')}.${tenth}`
}

export function segmentDuration(segment: FilmStudySegment): number {
  return Math.max(0, segment.endTime - segment.startTime)
}

export function segmentMetaLine(segment: FilmStudySegment): string {
  return [
    segment.shotSize ? `景别 ${segment.shotSize}` : '',
    segment.cameraAngle ? `机位 ${segment.cameraAngle}` : '',
    segment.cameraMove ? `运镜 ${segment.cameraMove}` : ''
  ]
    .filter(Boolean)
    .join(' · ')
}

export function buildStudySheetMarkdown(study: FilmStudy): string {
  const lines: string[] = [
    `# ${study.sourceName} · 分镜表`,
    '',
    `片长 ${studyClock(study.duration)} · ${study.segments.length} 个分镜 · ${study.frames.length} 张代表帧`
  ]

  if (study.analysisModel) {
    lines.push(`分析模型 ${study.analysisModel}`)
  }
  if (study.autoAnalyzedAt) {
    lines.push(`分析时间 ${new Date(study.autoAnalyzedAt).toLocaleString()}`)
  }

  for (let index = 0; index < study.segments.length; index += 1) {
    const segment = study.segments[index]
    lines.push(
      '',
      `## ${segment.title || `镜 ${String(index + 1).padStart(2, '0')}`} · ${studyClock(segment.startTime)} – ${studyClock(segment.endTime)}（${segmentDuration(segment).toFixed(1)}s）`
    )
    const meta = segmentMetaLine(segment)
    if (meta) lines.push(`- ${meta}`)
    if (segment.lighting) lines.push(`- 光线：${segment.lighting}`)
    if (segment.visualDescription) {
      lines.push(`- 画面：${segment.visualDescription}`)
    }
    if (segment.imagePrompt) lines.push(`- 提示词：${segment.imagePrompt}`)
    if (segment.voiceOver) lines.push(`- 人声：${segment.voiceOver}`)
    if (segment.musicCue) lines.push(`- 音乐：${segment.musicCue}`)
  }

  return lines.join('\n')
}

function escapeCell(value?: string): string {
  return (value ?? '—')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, '<br>')
    .trim()
}

export function buildStudyTableMarkdown(study: FilmStudy): string {
  const header =
    '| 镜号 | 时间 | 时长 | 景别 | 机位 | 运镜 | 光线 | 画面 | 提示词 | 人声 / 音乐 |'
  const divider =
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |'

  const rows = study.segments.map((segment, index) => {
    const sound = [segment.voiceOver ? `人声：${segment.voiceOver}` : '', segment.musicCue ? `音乐：${segment.musicCue}` : '']
      .filter(Boolean)
      .join('；')
    return [
      `| ${String(index + 1).padStart(2, '0')}`,
      `${studyClock(segment.startTime)} – ${studyClock(segment.endTime)}`,
      `${segmentDuration(segment).toFixed(1)}s`,
      escapeCell(segment.shotSize),
      escapeCell(segment.cameraAngle),
      escapeCell(segment.cameraMove),
      escapeCell(segment.lighting),
      escapeCell(segment.visualDescription ?? segment.title),
      escapeCell(segment.imagePrompt),
      `${escapeCell(sound)} |`
    ].join(' | ')
  })

  return [
    `# ${study.sourceName} · 分镜表`,
    '',
    `片长 ${studyClock(study.duration)} · ${study.segments.length} 个分镜 · ${study.frames.length} 张代表帧`,
    study.analysisModel ? `分析模型 ${study.analysisModel}` : '',
    '',
    header,
    divider,
    ...rows
  ].join('\n')
}

export function segmentCopyText(
  segment: FilmStudySegment,
  index: number
): string {
  return [
    `镜 ${String(index + 1).padStart(2, '0')} · ${studyClock(segment.startTime)} – ${studyClock(segment.endTime)}`,
    segment.imagePrompt ?? segment.visualDescription ?? '',
    segmentMetaLine(segment)
  ]
    .filter(Boolean)
    .join('\n')
}
