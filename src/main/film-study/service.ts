import { promises as fs } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { dirname, join } from 'node:path'
import type {
  FilmStudy,
  FilmStudyExtractRequest,
  FilmStudyExtractResult,
  FilmStudyFrame,
  FilmStudyProgress,
  FilmStudySummary
} from '@shared/film-study'
import { probeMedia, runFfmpeg } from '../media/ffmpeg'
import { resolveMediaPath } from '../media/paths'

const DEFAULT_MAX_FRAMES = 3000
const MIN_INTERVAL = 0.25
const MAX_INTERVAL = 60

type ProgressEmitter = (progress: FilmStudyProgress) => void

const tasks = new Map<string, AbortController>()

function studyFile(root: string, studyId: string): string {
  return join(root, 'study', `${studyId}.json`)
}

function framesDir(root: string, studyId: string): string {
  return join(root, 'assets', 'study', studyId, 'frames')
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export function cancelFilmStudy(nodeId: string): void {
  tasks.get(nodeId)?.abort()
}

export async function loadFilmStudy(
  root: string,
  studyId: string
): Promise<FilmStudy> {
  const raw = JSON.parse(
    await fs.readFile(studyFile(root, studyId), 'utf8')
  ) as FilmStudy

  if (raw.schemaVersion !== 1 || !Array.isArray(raw.frames)) {
    throw new Error('拉片数据格式不正确')
  }

  return raw
}

export async function extractFilmStudy(
  root: string,
  input: FilmStudyExtractRequest,
  emit: ProgressEmitter
): Promise<FilmStudyExtractResult> {
  const absolute = await resolveMediaPath(root, input.path, input.scope)
  const probe = await probeMedia(absolute)
  if (!probe.duration || probe.duration <= 0) {
    throw new Error('无法读取视频时长')
  }

  const requested = clamp(
    Number.isFinite(input.interval) ? input.interval : 1,
    MIN_INTERVAL,
    MAX_INTERVAL
  )
  const maxFrames = clamp(
    Math.floor(input.maxFrames ?? DEFAULT_MAX_FRAMES),
    24,
    12000
  )
  const interval = Math.max(requested, probe.duration / maxFrames)
  const studyId = randomUUID().slice(0, 10)
  const frameDir = framesDir(root, studyId)
  const controller = new AbortController()
  tasks.set(input.nodeId, controller)

  const totalEstimate = Math.max(1, Math.ceil(probe.duration / interval))
  emit({
    nodeId: input.nodeId,
    studyId,
    status: 'running',
    percent: 0,
    current: 0,
    total: totalEstimate,
    interval,
    message: '正在抽帧'
  })

  try {
    await fs.rm(frameDir, { recursive: true, force: true })
    await fs.mkdir(frameDir, { recursive: true })

    await runFfmpeg(
      [
        '-y',
        '-i',
        absolute,
        '-vf',
        `fps=${(1 / interval).toFixed(6)},scale=320:-2`,
        '-q:v',
        '6',
        '-start_number',
        '1',
        '-progress',
        'pipe:1',
        join(frameDir, 'frame_%06d.jpg')
      ],
      {
        signal: controller.signal,
        onProgress: (seconds) => {
          const percent = Math.min(
            99,
            Math.max(1, Math.round((seconds / probe.duration!) * 100))
          )
          emit({
            nodeId: input.nodeId,
            studyId,
            status: 'running',
            percent,
            current: Math.min(
              totalEstimate,
              Math.max(0, Math.round(seconds / interval))
            ),
            total: totalEstimate,
            interval
          })
        }
      }
    )
  } catch (error) {
    if (controller.signal.aborted) {
      emit({
        nodeId: input.nodeId,
        studyId,
        status: 'cancelled',
        percent: 0,
        interval,
        message: '已取消抽帧'
      })
      return { cancelled: true }
    }

    const message = error instanceof Error ? error.message : String(error)
    emit({
      nodeId: input.nodeId,
      studyId,
      status: 'error',
      percent: 0,
      error: message,
      interval
    })
    throw error
  } finally {
    tasks.delete(input.nodeId)
  }

  const names = (await fs.readdir(frameDir))
    .filter((name) => /^frame_\d+\.jpg$/i.test(name))
    .sort((a, b) => a.localeCompare(b))

  if (names.length === 0) {
    const message = '没有抽到任何画面，请检查视频文件'
    emit({
      nodeId: input.nodeId,
      studyId,
      status: 'error',
      percent: 0,
      error: message,
      interval
    })
    throw new Error(message)
  }

  const frames: FilmStudyFrame[] = names.map((name, index) => ({
    index: index + 1,
    time: index * interval,
    file: `assets/study/${studyId}/frames/${name}`
  }))

  const now = new Date().toISOString()
  const study: FilmStudy = {
    schemaVersion: 1,
    id: studyId,
    sourceNodeId: input.sourceNodeId ?? input.nodeId,
    sourcePath: input.path,
    sourceScope: input.scope,
    sourceName:
      input.sourceName?.trim() ||
      input.path.split(/[\\/]/).pop() ||
      '视频',
    duration: probe.duration,
    fps: probe.fps ?? 0,
    frameInterval: interval,
    frames,
    segments: [],
    createdAt: now,
    updatedAt: now
  }

  const target = studyFile(root, studyId)
  await fs.mkdir(dirname(target), { recursive: true })
  const temp = `${target}.tmp`
  await fs.writeFile(temp, `${JSON.stringify(study, null, 2)}\n`, 'utf8')
  await fs.rename(temp, target)

  const summary: FilmStudySummary = {
    studyId,
    frameCount: frames.length,
    segmentCount: 0,
    interval,
    duration: probe.duration,
    fps: probe.fps ?? 0
  }

  emit({
    nodeId: input.nodeId,
    studyId,
    status: 'done',
    percent: 100,
    current: frames.length,
    total: frames.length,
    frameCount: frames.length,
    interval,
    duration: probe.duration,
    fps: probe.fps ?? 0
  })

  return { summary }
}
