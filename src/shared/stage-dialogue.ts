import type {
  DirectorStageDoc,
  StageCamera,
  StageShot,
  StageShotIntentKey
} from './stage-schema'
import type { AutoCoveragePlan } from './stage-auto-coverage'
import { solveStageShotIntent } from './stage-shot-intent'

export interface DialogueLine {
  speaker: string
  text: string
}

const LABEL = /^([^：:\n]{1,20})[：:]\s*(.+)$/
const BRACKET = /^【([^】]{1,20})】\s*(.+)$/

function splitText(text: string): string[] {
  if (text.length <= 40) return [text]
  const parts = text
    .split(/(?<=[。！？；])/)
    .map((part) => part.trim())
    .filter(Boolean)
  const result: string[] = []
  let current = ''
  for (const part of parts) {
    if (current.length + part.length > 40 && current) {
      result.push(current)
      current = part
    } else {
      current += part
    }
  }
  if (current) result.push(current)
  return result.length > 0 ? result : [text]
}

export function parseDialogue(script: string): DialogueLine[] {
  const lines: DialogueLine[] = []
  for (const raw of script.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    const match = line.match(LABEL) ?? line.match(BRACKET)
    if (!match) continue
    const speaker = match[1]!.trim()
    const text = match[2]!.trim()
    if (!speaker || !text) continue
    for (const chunk of splitText(text)) {
      lines.push({ speaker, text: chunk })
    }
  }
  return lines.slice(0, 60)
}

function durationOf(text: string): number {
  return Math.round(
    Math.max(1.5, Math.min(12, 0.8 + text.length * 0.12)) * 1000
  )
}

export function buildDialogueCoverage(
  doc: DirectorStageDoc,
  lines: DialogueLine[],
  options: { pace?: number } = {}
): AutoCoveragePlan {
  const notes: string[] = []
  const humans = doc.objects.filter((object) => object.type === 'human')
  if (humans.length === 0) {
    return { cameras: [], shots: [], notes: ['场景里还没有人物。'] }
  }

  const resolveSpeaker = (name: string) =>
    humans.find(
      (object) =>
        object.name === name ||
        object.name.includes(name) ||
        name.includes(object.name)
    )

  const pace = Math.max(0.6, Math.min(1.6, options.pace ?? 1))
  const cameras: StageCamera[] = []
  const shots: StageShot[] = []
  let working = doc

  for (const [index, line] of lines.entries()) {
    const speaker = resolveSpeaker(line.speaker)
    if (!speaker) {
      notes.push(`找不到角色「${line.speaker}」，已跳过这句。`)
      continue
    }
    const partner = humans.find((object) => object.id !== speaker.id)
    const camera: StageCamera = {
      id: `camera_dialogue_${index}`,
      name: `对白 · ${line.speaker}`,
      position: [0, 2, 6],
      target: [0, 1, 0],
      fov: 50,
      source: 'auto'
    }
    cameras.push(camera)
    working = { ...working, cameras: [...working.cameras, camera] }

    const key: StageShotIntentKey = partner
      ? {
          timeMs: 0,
          subjectIds: [speaker.id],
          framing: 'single',
          relation: 'over_shoulder',
          towardId: partner.id,
          distance: 'medium',
          height: 'eye',
          aim: 'face'
        }
      : {
          timeMs: 0,
          subjectIds: [speaker.id],
          framing: 'single',
          relation: 'front_side',
          distance: 'medium',
          height: 'eye',
          aim: 'face'
        }

    const shot: StageShot = {
      id: `shot_dialogue_${index}`,
      name: `对白 · ${line.speaker}`,
      cameraId: camera.id,
      durationMs: Math.round(durationOf(line.text) / pace),
      aspect: doc.shots[0]?.aspect ?? '16:9',
      intent: { version: 1, keys: [key] },
      caption: line.text,
      source: 'auto'
    }
    const solved = solveStageShotIntent(working, shot)
    shots.push({ ...shot, cameraTrack: solved.track })
    notes.push(...solved.notes)
  }

  notes.push(`按对白生成 ${shots.length} 个镜头。`)
  return { cameras, shots, notes: [...new Set(notes)] }
}
