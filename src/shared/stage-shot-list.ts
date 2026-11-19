import type { DirectorStageDoc, StageShot } from './stage-schema'
import { programAt } from './stage-program'
import type { ProgramTimeline } from './stage-program'

export interface StageShotRow {
  /** 素材镜号，从 1 开始 */
  number: number
  /** 成片镜号；0 表示未播 */
  programNumber: number
  shotId: string
  startMs: number
  endMs: number
  durationMs: number
  cameraName: string
  framing: string
  shotSize: string
  angle: string
  movement: string
  subjects: string[]
  caption: string
  note: string
}

function shotSizeOf(shot: StageShot, fov: number): string {
  const distance = shot.intent?.keys[0]?.distance
  if (distance === 'close') return '近景'
  if (distance === 'medium') return '中景'
  if (distance === 'far') return '全景'
  if (fov <= 30) return '近景'
  if (fov <= 60) return '中景'
  return '全景'
}

function angleOf(shot: StageShot): string {
  const key = shot.intent?.keys[0]
  if (key?.relation === 'over_shoulder') return '过肩'
  if (key?.height === 'floor') return '低角度'
  if (key?.height === 'high') return '俯拍'
  if (key?.height === 'crane') return '高俯'
  return '平视'
}

function framingOf(shot: StageShot): string {
  const framing = shot.intent?.keys[0]?.framing
  if (framing === 'two_shot') return '双人'
  if (framing === 'group') return '群戏'
  if (framing === 'single') return '单人'
  return '—'
}

function movementOf(shot: StageShot): string {
  const track = shot.cameraTrack ?? []
  if (track.length < 2) return '固定'
  const first = track[0]!
  const last = track[track.length - 1]!
  const distance = Math.hypot(
    last.position[0] - first.position[0],
    last.position[1] - first.position[1],
    last.position[2] - first.position[2]
  )
  return distance > 0.5 ? '移动' : '固定'
}

function subjectsOf(shot: StageShot, doc: DirectorStageDoc): string[] {
  const ids = shot.intent?.keys[0]?.subjectIds ?? []
  return ids
    .map((id) => doc.objects.find((object) => object.id === id)?.name)
    .filter((name): name is string => !!name)
}

export function buildShotList(
  doc: DirectorStageDoc,
  timeline: ProgramTimeline
): StageShotRow[] {
  const shots = [...timeline.segments].sort(
    (a, b) => a.startMs - b.startMs || a.entryIndex - b.entryIndex
  )
  const effectiveOrder = new Map<number, number>()
  let programNumber = 0
  for (const segment of shots) {
    const active = programAt(timeline, segment.startMs)
    if (active?.entryIndex === segment.entryIndex) {
      programNumber += 1
      effectiveOrder.set(segment.entryIndex, programNumber)
    }
  }

  const rows: StageShotRow[] = []
  const reused = new Set<string>()
  for (const segment of shots) {
    const shot = doc.shots.find((item) => item.id === segment.shotId)
    if (!shot) continue
    const number = doc.shots.indexOf(shot) + 1
    const camera = doc.cameras.find((item) => item.id === shot.cameraId)
    const isEffective = effectiveOrder.has(segment.entryIndex)
    const note: string[] = []
    if (!isEffective) note.push('未播')
    if (reused.has(shot.id)) note.push('复用')
    reused.add(shot.id)

    rows.push({
      number,
      programNumber: effectiveOrder.get(segment.entryIndex) ?? 0,
      shotId: shot.id,
      startMs: segment.startMs,
      endMs: segment.endMs,
      durationMs: shot.durationMs,
      cameraName: camera?.name ?? shot.cameraId,
      framing: framingOf(shot),
      shotSize: shotSizeOf(shot, camera?.fov ?? 50),
      angle: angleOf(shot),
      movement: movementOf(shot),
      subjects: subjectsOf(shot, doc),
      caption: shot.caption ?? '',
      note: note.join(' / ')
    })
  }
  return rows
}

function csvCell(value: string | number): string {
  const text = String(value)
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function shotListToCsv(rows: StageShotRow[]): string {
  const header = [
    '成片镜号',
    '素材镜号',
    '时长(秒)',
    '机位',
    '构图',
    '景别',
    '角度',
    '运镜',
    '主体',
    '台词',
    '备注'
  ]
  const lines = rows.map((row) =>
    [
      row.programNumber || '',
      row.number,
      (row.durationMs / 1000).toFixed(1),
      row.cameraName,
      row.framing,
      row.shotSize,
      row.angle,
      row.movement,
      row.subjects.join('、'),
      row.caption,
      row.note
    ]
      .map(csvCell)
      .join(',')
  )
  return `\uFEFF${header.join(',')}\r\n${lines.join('\r\n')}\r\n`
}

export function shotListToMarkdown(
  rows: StageShotRow[],
  title = '白模镜头表'
): string {
  const header =
    '| 成片镜号 | 素材镜号 | 时长 | 机位 | 构图 | 景别 | 角度 | 运镜 | 主体 | 台词 | 备注 |'
  const divider =
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |'
  const body = rows.map((row) =>
    [
      row.programNumber || '—',
      row.number,
      `${(row.durationMs / 1000).toFixed(1)}s`,
      row.cameraName,
      row.framing,
      row.shotSize,
      row.angle,
      row.movement,
      row.subjects.join('、') || '—',
      row.caption || '—',
      row.note || '—'
    ]
      .map((cell) => String(cell).replace(/\|/g, '\\|'))
      .join(' | ')
  )
  return [`# ${title}`, '', header, divider, ...body.map((line) => `| ${line} |`), ''].join('\n')
}
