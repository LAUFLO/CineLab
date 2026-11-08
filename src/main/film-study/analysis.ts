import { randomUUID } from 'node:crypto'
import type {
  FilmStudy,
  FilmStudyAudiencePoint,
  FilmStudyFrame,
  FilmStudyMacroAnalysis,
  FilmStudySegment,
  FilmStudyStoryLine
} from '@shared/film-study'

export const AI_SCHEMA = {
  type: 'object',
  required: ['segments'],
  properties: {
    macroAnalysis: {
      type: 'object',
      properties: {
        overallStructure: { type: 'string' },
        narrativeStrategy: { type: 'string' },
        rhythmPattern: { type: 'string' },
        informationStrategy: { type: 'string' },
        coreCreativeIntent: { type: 'string' },
        writingLessons: { type: 'array', items: { type: 'string' } }
      }
    },
    segments: {
      type: 'array',
      items: {
        type: 'object',
        required: ['startTime', 'endTime', 'title', 'type'],
        properties: {
          startTime: { type: 'number' },
          endTime: { type: 'number' },
          title: { type: 'string' },
          type: { type: 'string' },
          segmentFunction: { type: 'string' },
          keyBeats: { type: 'string' },
          creativeIntent: { type: 'string' },
          techniques: { type: 'string' },
          audienceExperience: { type: 'string' },
          notes: { type: 'string' },
          primaryLine: { type: 'string' },
          sharedLines: { type: 'array', items: { type: 'string' } },
          structureRole: { type: 'string' }
        }
      }
    },
    storyLines: {
      type: 'array',
      items: {
        type: 'object',
        required: ['title'],
        properties: {
          title: { type: 'string' },
          subtitle: { type: 'string' },
          description: { type: 'string' }
        }
      }
    },
    audienceCurvePoints: {
      type: 'array',
      items: {
        type: 'object',
        required: ['time', 'intensity', 'title'],
        properties: {
          time: { type: 'number' },
          intensity: { type: 'number' },
          valence: { type: 'number' },
          emotionType: { type: 'string' },
          rhythmRole: { type: 'string' },
          title: { type: 'string' },
          description: { type: 'string' }
        }
      }
    }
  }
}

export function packageFrameName(frame: FilmStudyFrame): string {
  const tenths = Math.round(frame.time * 10)
  const minutes = Math.floor(tenths / 600)
  const seconds = Math.floor((tenths % 600) / 10)
  const fraction = tenths % 10
  return `frame_${String(frame.index).padStart(6, '0')}_${String(minutes).padStart(2, '0')}-${String(seconds).padStart(2, '0')}-${fraction}.jpg`
}

export function buildAiPrompt(study: FilmStudy): string {
  return [
    `# 拉片分析任务：${study.sourceName}`,
    '',
    '你是一名电影拉片助手。请根据 frames/ 中的截图和 project.json 的时间映射，分析这部影片的段落、结构和观众情绪。',
    '',
    `- 片长：${study.duration.toFixed(1)} 秒`,
    `- 抽帧间隔：${study.frameInterval} 秒`,
    `- 帧数：${study.frames.length}`,
    '- frames/ 文件名包含帧序号和时间，project.json 里有精确映射。',
    '',
    '## 输出要求',
    '',
    '只输出一个 JSON 对象，严格符合 schema.json，不要输出 Markdown、解释或代码块。',
    '',
    '1. segments 必填：按时间顺序覆盖全片，尽量连续、不重叠。',
    '2. 每个 segment 至少包含 startTime、endTime、title、type。',
    '3. 可选字段：segmentFunction、keyBeats、creativeIntent、techniques、audienceExperience、notes、primaryLine、sharedLines、structureRole。',
    '4. type 建议使用：开场、起、承、转、合、冲突、推进、转折、升级、低谷、高潮、结尾、支线、过渡。',
    '5. primaryLine 填 storyLines 里的剧情线 id 或名称；sharedLines 填同时承载该段落的其它剧情线；structureRole 填该段的结构角色。',
    '6. 如果能判断，请同时输出 macroAnalysis、storyLines、audienceCurvePoints。',
    '7. audienceCurvePoints 的 time 使用全片秒数，intensity 使用 0-100。',
    '',
    '不要虚构字幕；本包没有字幕文件。'
  ].join('\n')
}

export function buildAiReadme(study: FilmStudy): string {
  return [
    `# ${study.sourceName} · AI 拉片分析包`,
    '',
    '这个 ZIP 可以直接交给支持图片和文件上传的 AI，按 `prompt.md` 分析并返回 JSON。',
    '',
    '- `prompt.md`：分析任务与输出要求',
    '- `schema.json`：返回 JSON 的结构',
    '- `project.json`：影片、帧数与时间映射',
    '- `frames/`：按抽帧间隔生成的截图',
    '',
    '不需要 API Key，模型和平台任意；返回 JSON 后回到 CineLab 拉片室导入即可。'
  ].join('\n')
}

export function buildAiProject(study: FilmStudy): string {
  return JSON.stringify(
    {
      sourceName: study.sourceName,
      duration: study.duration,
      fps: study.fps,
      frameInterval: study.frameInterval,
      frameCount: study.frames.length,
      frames: study.frames.map((frame) => ({
        index: frame.index,
        time: frame.time,
        file: `frames/${packageFrameName(frame)}`
      }))
    },
    null,
    2
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function normalizeSegments(
  raw: unknown,
  duration: number
): FilmStudySegment[] {
  if (!Array.isArray(raw)) return []

  return raw
    .filter(isRecord)
    .map((item): FilmStudySegment | null => {
      const startTime = readNumber(item.startTime)
      const endTime = readNumber(item.endTime)
      if (startTime === undefined || endTime === undefined) return null
      if (endTime <= startTime) return null

      const start = Math.max(0, Math.min(startTime, duration))
      const end = Math.max(0, Math.min(endTime, duration))
      if (end <= start) return null

      return {
        id: randomUUID(),
        startTime: start,
        endTime: end,
        title: readText(item.title) ?? '未命名段落',
        type: readText(item.type) ?? '过渡',
        segmentFunction: readText(item.segmentFunction),
        keyBeats: readText(item.keyBeats),
        creativeIntent: readText(item.creativeIntent),
        techniques: readText(item.techniques),
        audienceExperience: readText(item.audienceExperience),
        notes: readText(item.notes),
        primaryLine: readText(item.primaryLine),
        sharedLines: Array.isArray(item.sharedLines)
          ? item.sharedLines
              .map(readText)
              .filter((value): value is string => Boolean(value))
          : undefined,
        structureRole: readText(item.structureRole)
      }
    })
    .filter((item): item is FilmStudySegment => item !== null)
    .sort((a, b) => a.startTime - b.startTime)
}

export function normalizeFilmStudyAnalysis(
  study: FilmStudy,
  input: unknown
): FilmStudy {
  const payload = isRecord(input) ? input : { segments: input }
  const segments = normalizeSegments(payload.segments, study.duration)

  if (segments.length === 0) {
    throw new Error('AI 结果里没有可用段落，请检查 segments 时间范围')
  }

  let macroAnalysis: FilmStudyMacroAnalysis | undefined
  if (isRecord(payload.macroAnalysis)) {
    macroAnalysis = {
      overallStructure: readText(payload.macroAnalysis.overallStructure),
      narrativeStrategy: readText(payload.macroAnalysis.narrativeStrategy),
      rhythmPattern: readText(payload.macroAnalysis.rhythmPattern),
      informationStrategy: readText(payload.macroAnalysis.informationStrategy),
      coreCreativeIntent: readText(payload.macroAnalysis.coreCreativeIntent),
      writingLessons: Array.isArray(payload.macroAnalysis.writingLessons)
        ? payload.macroAnalysis.writingLessons
            .map(readText)
            .filter((item): item is string => Boolean(item))
        : undefined
    }
  }

  const storyLines: FilmStudyStoryLine[] | undefined = Array.isArray(
    payload.storyLines
  )
    ? payload.storyLines
        .filter(isRecord)
        .map((item) => ({
          id: randomUUID(),
          title: readText(item.title) ?? '未命名剧情线',
          subtitle: readText(item.subtitle),
          description: readText(item.description)
        }))
    : undefined

  const audienceCurvePoints: FilmStudyAudiencePoint[] | undefined =
    Array.isArray(payload.audienceCurvePoints)
      ? payload.audienceCurvePoints
          .filter(isRecord)
          .map((item): FilmStudyAudiencePoint | null => {
            const time = readNumber(item.time)
            if (time === undefined) return null
            return {
              id: randomUUID(),
              time: Math.max(0, Math.min(time, study.duration)),
              intensity: Math.max(
                0,
                Math.min(100, readNumber(item.intensity) ?? 50)
              ),
              valence: readNumber(item.valence),
              emotionType: readText(item.emotionType) ?? 'neutral',
              rhythmRole: readText(item.rhythmRole),
              title: readText(item.title) ?? '情绪点',
              description: readText(item.description)
            }
          })
          .filter(
            (item): item is FilmStudyAudiencePoint => item !== null
          )
      : undefined

  return {
    ...study,
    segments,
    ...(macroAnalysis ? { macroAnalysis } : {}),
    ...(storyLines ? { storyLines } : {}),
    ...(audienceCurvePoints ? { audienceCurvePoints } : {}),
    aiImportedAt: new Date().toISOString()
  }
}
