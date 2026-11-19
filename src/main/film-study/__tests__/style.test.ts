import { describe, expect, it } from 'vitest'
import type { FilmStudy } from '@shared/film-study'
import type { FilmStudyShot } from '@shared/film-study-v2'
import { buildStylePrompt, parseStyle } from '../style'

function shot(index: number): FilmStudyShot {
  return {
    index,
    startTime: (index - 1) * 2,
    endTime: index * 2,
    duration: 2,
    firstFrame: `frames/${index}_first.jpg`,
    lastFrame: `frames/${index}_last.jpg`
  }
}

function study(): FilmStudy {
  return {
    schemaVersion: 1,
    id: 'study-1',
    sourceNodeId: 'node-1',
    sourcePath: 'ref.mp4',
    sourceName: '参考片',
    duration: 6,
    fps: 30,
    frameInterval: 2,
    frames: [],
    segments: [],
    shots: [shot(1), shot(2), shot(3)],
    createdAt: '2026-11-18T00:00:00.000Z',
    updatedAt: '2026-11-18T00:00:00.000Z'
  }
}

describe('buildStylePrompt', () => {
  it('asks for every style field and the average shot length', () => {
    const prompt = buildStylePrompt(study())
    expect(prompt).toContain('平均镜头长度 2.00 秒')
    expect(prompt).toContain('look')
    expect(prompt).toContain('palette')
    expect(prompt).toContain('prompt')
  })
})

describe('parseStyle', () => {
  it('parses style fields', () => {
    const raw = JSON.stringify({
      style: {
        look: '写实电影感',
        palette: '青橙，暗部偏蓝',
        composition: '近景为主',
        camera: '手持',
        pacing: '2.4s 一镜',
        prompt: 'cinematic, teal-orange'
      }
    })
    expect(parseStyle(raw)).toEqual({
      look: '写实电影感',
      palette: '青橙，暗部偏蓝',
      composition: '近景为主',
      camera: '手持',
      pacing: '2.4s 一镜',
      prompt: 'cinematic, teal-orange'
    })
  })

  it('drops empty strings', () => {
    const raw = JSON.stringify({ style: { look: '  ', camera: '固定' } })
    expect(parseStyle(raw)).toEqual({ camera: '固定' })
  })

  it('returns an empty object for invalid JSON', () => {
    expect(parseStyle('not json')).toEqual({})
  })

  it('accepts a fenced code block', () => {
    const raw = '```json\n{"style":{"look":"3D 动画"}}\n```'
    expect(parseStyle(raw)).toEqual({ look: '3D 动画' })
  })
})
