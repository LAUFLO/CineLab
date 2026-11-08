import { app } from 'electron'
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
import type { GeneratedAsset } from '@shared/generation'
import { probeMedia, runFfmpeg } from '../media/ffmpeg'
import { resolveInside, resolveMediaPath } from '../media/paths'
import { ingestAsset } from '../assets/ingest'
import { httpFetch } from '../providers/http'
import { resolveProvider } from '../settings/store'
import {
  AI_SCHEMA,
  buildAiProject,
  buildAiPrompt,
  buildAiReadme,
  buildSrt,
  normalizeFilmStudyAnalysis,
  packageFrameName,
  parseSrt
} from './analysis'
import { zipDirectory } from '../export/zip'


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

export async function saveFilmStudy(
  root: string,
  study: FilmStudy
): Promise<FilmStudy> {
  if (
    study.schemaVersion !== 1 ||
    !study.id ||
    !Array.isArray(study.frames) ||
    !Array.isArray(study.segments)
  ) {
    throw new Error('拉片数据格式不正确')
  }

  const next: FilmStudy = {
    ...study,
    updatedAt: new Date().toISOString()
  }
  const target = studyFile(root, next.id)
  await fs.mkdir(dirname(target), { recursive: true })
  const temp = `${target}.tmp`
  await fs.writeFile(temp, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
  await fs.rename(temp, target)
  return next
}

export async function createFilmStudyContactSheet(
  root: string,
  studyId: string
): Promise<GeneratedAsset> {
  const study = await loadFilmStudy(root, studyId)
  const frames = study.frames
  if (frames.length === 0) throw new Error('拉片还没有帧')

  const count = Math.min(12, frames.length)
  const picks: FilmStudyFrame[] =
    count === frames.length
      ? frames
      : Array.from({ length: count }, (_, index) => {
          const sourceIndex = Math.round(
            (index * (frames.length - 1)) / Math.max(1, count - 1)
          )
          return frames[sourceIndex]
        })

  const tempDir = join(app.getPath('temp'), `cinelab-study-sheet-${randomUUID()}`)
  await fs.mkdir(tempDir, { recursive: true })
  const output = join(tempDir, 'sheet.png')

  try {
    const inputs = picks.map((frame) => resolveInside(root, frame.file))
    const cols = 4
    const rows = Math.ceil(picks.length / cols)
    const filters = picks.map(
      (_frame, index) =>
        `[${index}:v]scale=320:180:force_original_aspect_ratio=decrease,pad=320:180:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1[v${index}]`
    )
    const layout = picks
      .map((_frame, index) => {
        const column = index % cols
        const row = Math.floor(index / cols)
        return `${column * 320}_${row * 180}`
      })
      .join('|')
    const stack =
      picks.length === 1
        ? `[v0]null[out]`
        : `${picks.map((_frame, index) => `[v${index}]`).join('')}xstack=inputs=${picks.length}:layout=${layout}:fill=black[out]`

    await runFfmpeg([
      '-y',
      ...inputs.flatMap((input) => ['-i', input]),
      '-filter_complex',
      `${filters.join(';')};${stack}`,
      '-map',
      '[out]',
      '-frames:v',
      '1',
      output
    ])

    const data = await fs.readFile(output)
    return await ingestAsset({
      projectPath: root,
      data,
      kind: 'image',
      mime: 'image/png',
      model: `逐帧拉片拼图（${picks.length} 帧）`
    })
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined)
  }
}

export async function exportFilmStudyAnalysisPackage(
  root: string,
  studyId: string,
  targetFile: string
): Promise<void> {
  const study = await loadFilmStudy(root, studyId)
  const staging = await fs.mkdtemp(
    join(app.getPath('temp'), 'cinelab-ai-study-')
  )

  try {
    const framesDir = join(staging, 'frames')
    await fs.mkdir(framesDir, { recursive: true })

    for (const frame of study.frames) {
      const source = resolveInside(root, frame.file)
      await fs.copyFile(source, join(framesDir, packageFrameName(frame)))
    }

    await fs.writeFile(
      join(staging, 'README.md'),
      buildAiReadme(study),
      'utf8'
    )
    await fs.writeFile(
      join(staging, 'prompt.md'),
      buildAiPrompt(study),
      'utf8'
    )
    await fs.writeFile(
      join(staging, 'schema.json'),
      `${JSON.stringify(AI_SCHEMA, null, 2)}\n`,
      'utf8'
    )
    await fs.writeFile(
      join(staging, 'project.json'),
      buildAiProject(study),
      'utf8'
    )
    if (study.subtitles?.length) {
      await fs.writeFile(
        join(staging, 'subtitles.srt'),
        buildSrt(study.subtitles),
        'utf8'
      )
    }

    const safe = study.sourceName.replace(/[\\/:*?"<>|]/g, '_').trim()
    await zipDirectory(staging, targetFile, {
      rootName: `${safe || '拉片'}-AI分析包`
    })
  } finally {
    await fs.rm(staging, { recursive: true, force: true }).catch(() => undefined)
  }
}

export async function importFilmStudyAnalysis(
  root: string,
  studyId: string,
  input: unknown
): Promise<FilmStudy> {
  const study = await loadFilmStudy(root, studyId)
  const normalized = normalizeFilmStudyAnalysis(study, input)
  return saveFilmStudy(root, normalized)
}

export async function extractFilmStudySubtitles(
  root: string,
  studyId: string
): Promise<FilmStudy> {
  const study = await loadFilmStudy(root, studyId)
  const absolute = await resolveMediaPath(
    root,
    study.sourcePath,
    study.sourceScope
  )
  const tempDir = join(
    app.getPath('temp'),
    `cinelab-study-subs-${randomUUID()}`
  )
  await fs.mkdir(tempDir, { recursive: true })
  const output = join(tempDir, 'subtitles.srt')

  try {
    await runFfmpeg([
      '-y',
      '-i',
      absolute,
      '-map',
      '0:s:0',
      '-c:s',
      'srt',
      output
    ])
    const text = await fs.readFile(output, 'utf8')
    const subtitles = parseSrt(text)
    if (subtitles.length === 0) {
      throw new Error('没有解析到字幕内容')
    }
    return saveFilmStudy(root, { ...study, subtitles })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(
      message.includes('ffmpeg 失败') || message.includes('字幕')
        ? `未能提取内嵌字幕：${message.slice(0, 200)}`
        : message
    )
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined)
  }
}

export async function importFilmStudySubtitles(
  root: string,
  studyId: string,
  text: string
): Promise<FilmStudy> {
  const study = await loadFilmStudy(root, studyId)
  const subtitles = parseSrt(text)
  if (subtitles.length === 0) {
    throw new Error('SRT 文件里没有解析到字幕')
  }
  return saveFilmStudy(root, { ...study, subtitles })
}

export async function analyzeFilmStudy(
  root: string,
  studyId: string,
  modelKey: string
): Promise<FilmStudy> {
  const study = await loadFilmStudy(root, studyId)
  const slash = modelKey.indexOf('/')
  if (slash <= 0) throw new Error('模型标识无效')
  const provider = await resolveProvider(modelKey.slice(0, slash))
  if (!provider) throw new Error('找不到模型供应商，请先在设置中配置')
  if (!provider.apiKey) throw new Error('该供应商没有配置 API Key')

  const model = provider.models.find(
    (item) => item.id === modelKey.slice(slash + 1)
  )
  if (!model) throw new Error('找不到该模型')
  if (model.capability !== 'text.chat') {
    throw new Error('直连拉片分析需要文本模型')
  }

  const limit = 12
  const picks =
    study.frames.length <= limit
      ? study.frames
      : Array.from({ length: limit }, (_, index) => {
          const sourceIndex = Math.round(
            (index * (study.frames.length - 1)) / Math.max(1, limit - 1)
          )
          return study.frames[sourceIndex]
        })

  if (picks.length === 0) throw new Error('拉片还没有帧')

  const content: Array<Record<string, unknown>> = []
  const timeList: string[] = []
  for (let index = 0; index < picks.length; index += 1) {
    const frame = picks[index]
    const data = await fs.readFile(resolveInside(root, frame.file))
    timeList.push(
      `图 ${index + 1}：${frame.time.toFixed(1)} 秒（第 ${frame.index} 帧）`
    )
    content.push({
      type: 'image_url',
      image_url: {
        url: `data:image/jpeg;base64,${data.toString('base64')}`
      }
    })
  }

  const prompt = [
    `你是电影拉片助手。请分析《${study.sourceName}》。`,
    `片长 ${study.duration.toFixed(1)} 秒，抽帧间隔 ${study.frameInterval} 秒。`,
    `下面附上 ${picks.length} 张按时间顺序排列的图片：`,
    ...timeList,
    '请按以下 JSON Schema 返回分析结果，只输出 JSON，不要 Markdown、解释或代码块：',
    JSON.stringify(AI_SCHEMA),
    'segments 的 startTime/endTime 使用全片秒数，覆盖全片，尽量连续不重叠。',
    '如果能判断，请同时给出 storyLines、macroAnalysis 和 audienceCurvePoints。'
  ].join('\n')

  const response = await httpFetch(
    `${provider.baseUrl.replace(/\/+$/, '')}/chat/completions`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${provider.apiKey}`,
        ...(provider.headers ?? {})
      },
      body: JSON.stringify({
        model: model.remoteModel,
        temperature: 0.2,
        max_tokens: 4096,
        messages: [
          {
            role: 'user',
            content: [{ type: 'text', text: prompt }, ...content]
          }
        ]
      })
    }
  )

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`模型返回 HTTP ${response.status}：${text.slice(0, 300)}`)
  }

  const json = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const raw = json.choices?.[0]?.message?.content?.trim()
  if (!raw) throw new Error('模型没有返回分析内容')

  const cleaned = raw
    .replace(/^\uFEFF/, '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
  const parsed = JSON.parse(cleaned) as unknown
  const normalized = normalizeFilmStudyAnalysis(study, parsed)
  return saveFilmStudy(root, normalized)
}

export async function exportFilmStudyBundle(
  root: string,
  studyId: string,
  targetFile: string
): Promise<void> {
  const study = await loadFilmStudy(root, studyId)
  const staging = await fs.mkdtemp(
    join(app.getPath('temp'), 'cinelab-study-bundle-')
  )

  try {
    const framesDir = join(staging, 'frames')
    await fs.mkdir(framesDir, { recursive: true })
    for (const frame of study.frames) {
      await fs.copyFile(
        resolveInside(root, frame.file),
        join(framesDir, packageFrameName(frame))
      )
    }

    await fs.writeFile(
      join(staging, 'study.json'),
      `${JSON.stringify(study, null, 2)}\n`,
      'utf8'
    )
    await fs.writeFile(
      join(staging, '拉片笔记.md'),
      buildFilmStudyMarkdown(study),
      'utf8'
    )
    await fs.writeFile(
      join(staging, 'README.md'),
      [
        `# ${study.sourceName} · 拉片包`,
        '',
        '- `study.json`：完整拉片数据，可被 CineLab 重新导入',
        '- `拉片笔记.md`：可读笔记',
        '- `frames/`：抽帧截图',
        ...(study.subtitles?.length
          ? ['- `subtitles.srt`：字幕']
          : [])
      ].join('\n'),
      'utf8'
    )
    if (study.subtitles?.length) {
      await fs.writeFile(
        join(staging, 'subtitles.srt'),
        buildSrt(study.subtitles),
        'utf8'
      )
    }

    const safe = study.sourceName.replace(/[\\/:*?"<>|]/g, '_').trim()
    await zipDirectory(staging, targetFile, {
      rootName: `${safe || '拉片'}-拉片包`
    })
  } finally {
    await fs.rm(staging, { recursive: true, force: true }).catch(() => undefined)
  }
}

function formatStudyTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const rest = Math.max(0, seconds - minutes * 60)
  return `${String(minutes).padStart(2, '0')}:${rest.toFixed(1).padStart(4, '0')}`
}

function formatStudyClock(seconds: number): string {
  const total = Math.max(0, seconds)
  const minutes = Math.floor(total / 60)
  const rest = total % 60
  const whole = Math.floor(rest)
  const tenth = Math.floor((rest - whole) * 10)
  return `${String(minutes).padStart(2, '0')}:${String(whole).padStart(2, '0')}.${tenth}`
}

function escapeTableCell(value?: string): string {
  return (value ?? '—')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, '<br>')
    .trim()
}

function buildStoryboardTableMarkdown(study: FilmStudy): string {
  const rows = [...study.segments]
    .sort((a, b) => a.startTime - b.startTime)
    .map((segment, index) => {
      const sound = [
        segment.voiceOver ? `人声：${segment.voiceOver}` : '',
        segment.musicCue ? `音乐：${segment.musicCue}` : ''
      ]
        .filter(Boolean)
        .join('；')
      return [
        `| ${String(index + 1).padStart(2, '0')}`,
        `${formatStudyClock(segment.startTime)} – ${formatStudyClock(segment.endTime)}`,
        `${Math.max(0, segment.endTime - segment.startTime).toFixed(1)}s`,
        escapeTableCell(segment.shotSize),
        escapeTableCell(segment.cameraAngle),
        escapeTableCell(segment.cameraMove),
        escapeTableCell(segment.lighting),
        escapeTableCell(segment.visualDescription ?? segment.title),
        escapeTableCell(segment.imagePrompt),
        `${escapeTableCell(sound)} |`
      ].join(' | ')
    })

  return [
    `# ${study.sourceName} · 分镜表`,
    '',
    `片长 ${formatStudyClock(study.duration)} · ${study.segments.length} 个分镜 · ${study.frames.length} 张代表帧`,
    ...(study.analysisModel ? [`分析模型 ${study.analysisModel}`] : []),
    '',
    '| 镜号 | 时间 | 时长 | 景别 | 机位 | 运镜 | 光线 | 画面 | 提示词 | 人声 / 音乐 |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...rows
  ].join('\n') + '\n'
}

export function buildFilmStudyMarkdown(study: FilmStudy): string {
  if (
    study.autoAnalyzedAt ||
    study.segments.some((segment) => segment.shotSize || segment.imagePrompt)
  ) {
    return buildStoryboardTableMarkdown(study)
  }

  const lines: string[] = [
    `# 拉片笔记：${study.sourceName}`,
    '',
    `- 片长：${formatStudyTime(study.duration)}`,
    `- 抽帧间隔：${study.frameInterval}s`,
    `- 帧数：${study.frames.length}`,
    `- 段落数：${study.segments.length}`,
    ...(study.subtitles?.length
      ? [`- 字幕：${study.subtitles.length} 条`]
      : []),
    ''
  ]

  const notes = study.frames.filter((frame) => frame.note?.trim())
  if (notes.length > 0) {
    lines.push('## 帧备注', '')
    for (const frame of notes) {
      lines.push(
        `- ${formatStudyTime(frame.time)}（第 ${frame.index} 帧）：${frame.note}`
      )
    }
    lines.push('')
  }

  if (study.segments.length > 0) {
    lines.push('## 段落', '')
    for (const segment of [...study.segments].sort(
      (a, b) => a.startTime - b.startTime
    )) {
      lines.push(
        `### ${formatStudyTime(segment.startTime)} - ${formatStudyTime(segment.endTime)} · ${segment.title || '未命名段落'}`,
        ''
      )
      lines.push(`- 类型：${segment.type || '未填写'}`)
      if (segment.segmentFunction) {
        lines.push(`- 段落功能：${segment.segmentFunction}`)
      }
      if (segment.keyBeats) lines.push(`- 关键节拍：${segment.keyBeats}`)
      if (segment.creativeIntent) {
        lines.push(`- 创作意图：${segment.creativeIntent}`)
      }
      if (segment.techniques) lines.push(`- 视听手法：${segment.techniques}`)
      if (segment.audienceExperience) {
        lines.push(`- 观众体验：${segment.audienceExperience}`)
      }
      if (segment.notes) lines.push(`- 备注：${segment.notes}`)
      lines.push('')
    }
  }

  return `${lines.join('\n').trimEnd()}\n`
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
