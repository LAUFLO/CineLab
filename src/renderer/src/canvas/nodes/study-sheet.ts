import type { FilmStudy, FilmStudySegment } from '@shared/film-study'
import type {
  FilmStudyCast,
  FilmStudyScene,
  FilmStudyShot,
  FilmStudyStyle
} from '@shared/film-study-v2'

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

export const STUDY_TABLE_HEADERS = [
  '镜号',
  '时间',
  '时长',
  '景别',
  '机位',
  '运镜',
  '光线',
  '画面',
  '台词',
  '制作方式',
  '提示词',
  '人声 / 音乐'
] as const

/** 分镜表统一行模型：弹窗和文本节点共用，优先 shots，旧数据回退 segments。 */
export interface StudyTableRow {
  index: number
  time: string
  duration: string
  shotSize: string
  cameraAngle: string
  cameraMove: string
  lighting: string
  visual: string
  dialogue: string
  production: string
  prompt: string
  sound: string
}

function soundLine(
  voiceOver?: string,
  musicCue?: string
): string {
  return [
    voiceOver ? `人声：${voiceOver}` : '',
    musicCue ? `音乐：${musicCue}` : ''
  ]
    .filter(Boolean)
    .join('；')
}

export function buildStudyTableRows(study: FilmStudy): StudyTableRow[] {
  const shots = study.shots ?? []
  if (shots.length > 0) {
    return shots.map((shot) => {
      const scene = study.scenes?.find(
        (item) =>
          shot.index >= item.shots[0] && shot.index <= item.shots[1]
      )
      const segment = study.segments[shot.index - 1]
      return {
        index: shot.index,
        time: `${studyClock(shot.startTime)} – ${studyClock(shot.endTime)}`,
        duration: `${shot.duration.toFixed(1)}s`,
        shotSize: shot.shotSize ?? '',
        cameraAngle: shot.cameraAngle ?? '',
        cameraMove: shot.cameraMove ?? '',
        lighting: shot.lighting ?? '',
        visual: shot.visualDescription ?? scene?.name ?? '',
        dialogue: (shot.dialogue ?? [])
          .map(
            (line) =>
              `${line.speaker ? `${line.speaker}：` : ''}${line.text}`
          )
          .join(' / '),
        production: shot.production
          ? `${PRODUCTION_LABEL[shot.production.label] ?? shot.production.label} ${Math.round(shot.production.confidence * 100)}%`
          : '',
        prompt: shot.imagePrompt ?? '',
        sound: soundLine(segment?.voiceOver, segment?.musicCue)
      }
    })
  }

  return study.segments.map((segment, index) => ({
    index: index + 1,
    time: `${studyClock(segment.startTime)} – ${studyClock(segment.endTime)}`,
    duration: `${segmentDuration(segment).toFixed(1)}s`,
    shotSize: segment.shotSize ?? '',
    cameraAngle: segment.cameraAngle ?? '',
    cameraMove: segment.cameraMove ?? '',
    lighting: segment.lighting ?? '',
    visual: segment.visualDescription ?? segment.title ?? '',
    dialogue: '',
    production: '',
    prompt: segment.imagePrompt ?? '',
    sound: soundLine(segment.voiceOver, segment.musicCue)
  }))
}

export function buildStudyTableMarkdown(study: FilmStudy): string {
  const rows = buildStudyTableRows(study)
  const shotCount = study.shots?.length ?? 0
  const summary =
    shotCount > 0
      ? `片长 ${studyClock(study.duration)} · ${shotCount} 个镜头`
      : `片长 ${studyClock(study.duration)} · ${study.segments.length} 个分镜 · ${study.frames.length} 张代表帧`
  const divider = `| ${STUDY_TABLE_HEADERS.map(() => '---').join(' | ')} |`
  const body = rows.map((row) =>
    `| ${[
      String(row.index).padStart(2, '0'),
      row.time,
      row.duration,
      row.shotSize,
      row.cameraAngle,
      row.cameraMove,
      row.lighting,
      row.visual,
      row.dialogue,
      row.production,
      row.prompt,
      row.sound
    ]
      .map(escapeCell)
      .join(' | ')} |`
  )

  const lines = [
    `# ${study.sourceName} · 分镜表`,
    '',
    summary
  ]
  if (study.analysisModel) lines.push(`分析模型 ${study.analysisModel}`)
  lines.push(
    '',
    `| ${STUDY_TABLE_HEADERS.join(' | ')} |`,
    divider,
    ...body
  )
  return lines.join('\n')
}

const PRODUCTION_LABEL: Record<string, string> = {
  live_action: '实拍',
  ai_video: 'AI 生成',
  avatar: '数字人',
  cg_3d: '3D 渲染',
  code_render: '代码渲染',
  screen_capture: '录屏',
  still_motion: '静态图推拉',
  static_hold: '静帧',
  anim_2d: '2D 动画',
  stop_motion: '定格动画',
  film_footage: '影视片段'
}

export function buildShotMarkdown(
  shot: FilmStudyShot,
  scene?: FilmStudyScene,
  cast: FilmStudyCast[] = []
): string {
  const lines: string[] = [
    `## 镜 ${String(shot.index).padStart(2, '0')} · ${studyClock(shot.startTime)} – ${studyClock(shot.endTime)}（${shot.duration.toFixed(1)}s）`,
    ''
  ]

  const meta = [
    shot.shotSize ? `景别 ${shot.shotSize}` : '',
    shot.cameraAngle ? `机位 ${shot.cameraAngle}` : '',
    shot.cameraMove ? `运镜 ${shot.cameraMove}` : ''
  ]
    .filter(Boolean)
    .join(' · ')
  if (meta) lines.push(`- ${meta}`)
  if (shot.lighting) lines.push(`- 光线：${shot.lighting}`)
  if (shot.visualDescription) lines.push(`- 画面：${shot.visualDescription}`)
  if (shot.actionSummary) lines.push(`- 动作：${shot.actionSummary}`)
  if (shot.dialogue?.length) {
    lines.push(
      `- 台词：${shot.dialogue
        .map((line) => `${line.speaker ? `${line.speaker}：` : ''}${line.text}`)
        .join(' / ')}`
    )
  }
  if (shot.sfx?.length) {
    lines.push(
      `- 音效：${shot.sfx
        .map(
          (item) =>
            `${studyClock(item.time)} ${item.type}${item.event ? `（${item.event}）` : ''}`
        )
        .join(' / ')}`
    )
  }
  if (shot.production) {
    const label =
      PRODUCTION_LABEL[shot.production.label] ?? shot.production.label
    const evidence = shot.production.evidence.length
      ? `（${shot.production.evidence.join('；')}）`
      : ''
    lines.push(
      `- 制作方式：${label} ${Math.round(shot.production.confidence * 100)}%${evidence}`
    )
  }
  const castNames = (shot.castIds ?? [])
    .map((id) => cast.find((item) => item.id === id)?.name ?? id)
    .filter(Boolean)
  if (castNames.length) lines.push(`- 角色：${castNames.join('、')}`)
  if (scene) lines.push(`- 场景：${scene.id} · ${scene.name}`)

  if (shot.imagePrompt) {
    lines.push('', '### 提示词', '', shot.imagePrompt)
  }
  if (shot.videoPrompt) {
    lines.push('', '### 视频提示词', '', shot.videoPrompt)
  }

  return lines.join('\n')
}

export function buildRemakePrompt(shot: FilmStudyShot): string {
  return (
    shot.videoPrompt ||
    shot.imagePrompt ||
    shot.visualDescription ||
    shot.actionSummary ||
    ''
  )
}

export function buildStyleMarkdown(style: FilmStudyStyle): string {  const lines: string[] = ['# 风格档案', '']
  if (style.look) lines.push(`- 画风：${style.look}`)
  if (style.palette) lines.push(`- 色调：${style.palette}`)
  if (style.composition) lines.push(`- 构图：${style.composition}`)
  if (style.camera) lines.push(`- 运镜：${style.camera}`)
  if (style.pacing) lines.push(`- 节奏：${style.pacing}`)
  if (style.prompt) {
    lines.push('', '## 风格提示词', '', style.prompt)
  }
  return lines.join('\n')
}

export interface ShotGroup {
  title: string
  scene?: FilmStudyScene
  shots: FilmStudyShot[]
}

export function groupShotsByScene(
  shots: FilmStudyShot[],
  scenes?: FilmStudyScene[]
): ShotGroup[] {
  if (!scenes || scenes.length === 0) {
    const groups: ShotGroup[] = []
    for (let start = 0; start < shots.length; start += 10) {
      groups.push({
        title: `第 ${groups.length + 1} 段`,
        shots: shots.slice(start, start + 10)
      })
    }
    return groups
  }

  return scenes
    .map((scene) => ({
      scene,
      title: `${scene.id} · ${scene.name}`,
      shots: shots.filter(
        (shot) => shot.index >= scene.shots[0] && shot.index <= scene.shots[1]
      )
    }))
    .filter((group) => group.shots.length > 0)
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
