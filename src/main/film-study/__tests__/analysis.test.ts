import { describe, expect, it } from 'vitest'
import type { FilmStudy } from '@shared/film-study'
import {
  buildAiProject,
  buildSrt,
  normalizeFilmStudyAnalysis,
  packageFrameName,
  parseSrt
} from '../analysis'

const study: FilmStudy = {
  schemaVersion: 1,
  id: 'study-test',
  sourceNodeId: 'video-1',
  sourcePath: 'assets/vid/test.mp4',
  sourceName: '测试影片',
  duration: 4,
  fps: 24,
  frameInterval: 0.5,
  frames: [
    { index: 1, time: 0, file: 'assets/study/study-test/frames/frame_000001.jpg' },
    { index: 2, time: 0.5, file: 'assets/study/study-test/frames/frame_000002.jpg' },
    { index: 3, time: 1, file: 'assets/study/study-test/frames/frame_000003.jpg' }
  ],
  segments: [],
  createdAt: '2026-11-08T00:00:00.000Z',
  updatedAt: '2026-11-08T00:00:00.000Z'
}

describe('normalizeFilmStudyAnalysis', () => {
  it('accepts a segments array, sorts and clamps times', () => {
    const next = normalizeFilmStudyAnalysis(study, [
      { startTime: 2, endTime: 99, title: '后段', type: '高潮' },
      { startTime: 0, endTime: 1, title: '开场', type: '开场' }
    ])

    expect(next.segments.map((segment) => segment.title)).toEqual([
      '开场',
      '后段'
    ])
    expect(next.segments[1].endTime).toBe(4)
    expect(next.aiImportedAt).toBeTruthy()
  })

  it('keeps optional structure and emotion data', () => {
    const next = normalizeFilmStudyAnalysis(study, {
      segments: [
        {
          startTime: 0,
          endTime: 2,
          title: '建立',
          type: '起',
          segmentFunction: '交代目标',
          keyBeats: '目标 → 阻力',
          techniques: '手持跟拍',
          primaryLine: 'main',
          sharedLines: ['emotion'],
          structureRole: '铺垫'
        }
      ],
      macroAnalysis: {
        overallStructure: '三幕',
        writingLessons: ['先给目标', '再给压力']
      },
      storyLines: [{ title: '主线', description: '主角目标' }],
      audienceCurvePoints: [
        {
          time: 1,
          intensity: 120,
          emotionType: 'tension',
          title: '压力上升'
        }
      ]
    })

    expect(next.segments[0].segmentFunction).toBe('交代目标')
    expect(next.segments[0].primaryLine).toBe('main')
    expect(next.segments[0].sharedLines).toEqual(['emotion'])
    expect(next.segments[0].structureRole).toBe('铺垫')
    expect(next.macroAnalysis?.overallStructure).toBe('三幕')
    expect(next.storyLines?.[0].title).toBe('主线')
    expect(next.audienceCurvePoints?.[0].intensity).toBe(100)
  })

  it('rejects empty or invalid segments', () => {
    expect(() => normalizeFilmStudyAnalysis(study, { segments: [] })).toThrow(
      '没有可用段落'
    )
    expect(() =>
      normalizeFilmStudyAnalysis(study, {
        segments: [{ startTime: 2, endTime: 1, title: '坏段落' }]
      })
    ).toThrow('没有可用段落')
  })
})

describe('AI package helpers', () => {
  it('maps frames with timecode file names', () => {
    expect(packageFrameName(study.frames[1])).toBe(
      'frame_000002_00-00-5.jpg'
    )

    const project = JSON.parse(buildAiProject(study)) as {
      frameCount: number
      frames: Array<{ time: number; file: string }>
    }
    expect(project.frameCount).toBe(3)
    expect(project.frames[2]).toEqual({
      index: 3,
      time: 1,
      file: 'frames/frame_000003_00-01-0.jpg'
    })
  })
})

describe('SRT helpers', () => {
  it('parses and rebuilds subtitles', () => {
    const srt = `1
00:00:01,500 --> 00:00:03,000
第一句对白

2
00:00:04.000 --> 00:00:05.250
第二句
跨行对白
`
    const subtitles = parseSrt(srt)
    expect(subtitles).toEqual([
      { startTime: 1.5, endTime: 3, text: '第一句对白' },
      { startTime: 4, endTime: 5.25, text: '第二句\n跨行对白' }
    ])
    expect(parseSrt(buildSrt(subtitles))).toEqual(subtitles)
  })

  it('rejects malformed blocks', () => {
    expect(parseSrt('not a subtitle')).toEqual([])
    expect(
      parseSrt('1\n00:00:03,000 --> 00:00:01,000\n时间倒置')
    ).toEqual([])
  })
})
