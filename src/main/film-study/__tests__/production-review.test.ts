import { describe, expect, it } from 'vitest'
import type { FilmStudyShot } from '@shared/film-study-v2'
import type { ProductionResult } from '../production'
import {
  buildReviewPrompt,
  fuseProduction,
  parseReview
} from '../production-review'

function shot(index: number): FilmStudyShot {
  return {
    index,
    startTime: (index - 1) * 2,
    endTime: index * 2,
    duration: 2,
    firstFrame: `frames/${index}_first.jpg`,
    midFrame: `frames/${index}_mid.jpg`,
    lastFrame: `frames/${index}_last.jpg`
  }
}

function production(overrides: Partial<ProductionResult> = {}): ProductionResult {
  return {
    label: 'ai_video',
    confidence: 0.35,
    evidence: ['纹理能量 60'],
    material: 'ai',
    ...overrides
  }
}

describe('buildReviewPrompt', () => {
  it('lists the labels and the image ranges', () => {
    const prompt = buildReviewPrompt('参考片', [shot(1), shot(2)])
    expect(prompt).toContain('live_action')
    expect(prompt).toContain('图 1–3 是镜 1')
    expect(prompt).toContain('图 4–6 是镜 2')
    expect(prompt).toContain('手指或文字变形')
  })
})

describe('parseReview', () => {
  const batch = [shot(1), shot(2)]

  it('parses a valid verdict', () => {
    const raw = JSON.stringify({
      shots: [
        {
          index: 1,
          label: 'ai_video',
          confidence: 0.8,
          evidence: '手指数目不对'
        }
      ]
    })
    const parsed = parseReview(raw, batch)
    expect(parsed.get(1)).toEqual({
      label: 'ai_video',
      confidence: 0.8,
      evidence: '手指数目不对'
    })
  })

  it('drops unknown labels and out-of-range indexes', () => {
    const raw = JSON.stringify({
      shots: [
        { index: 1, label: 'made_up', confidence: 0.8 },
        { index: 9, label: 'ai_video', confidence: 0.8 }
      ]
    })
    expect(parseReview(raw, batch).size).toBe(0)
  })

  it('clamps confidence to 0..1', () => {
    const raw = JSON.stringify({
      shots: [{ index: 1, label: 'live_action', confidence: 3 }]
    })
    expect(parseReview(raw, batch).get(1)?.confidence).toBe(1)
  })

  it('returns an empty map for invalid JSON', () => {
    expect(parseReview('not json', batch).size).toBe(0)
  })
})

describe('fuseProduction', () => {
  it('keeps the detected result without a verdict', () => {
    const detected = production()
    expect(fuseProduction(detected, undefined)).toEqual(detected)
  })

  it('raises confidence when both agree', () => {
    const fused = fuseProduction(production(), {
      label: 'ai_video',
      confidence: 0.8,
      evidence: '手指变形'
    })
    expect(fused.label).toBe('ai_video')
    expect(fused.confidence).toBeGreaterThan(0.35)
    expect(fused.evidence).toContain('手指变形')
  })

  it('lowers confidence and marks a disagreement', () => {
    const fused = fuseProduction(production(), {
      label: 'live_action',
      confidence: 0.9
    })
    expect(fused.label).toBe('ai_video')
    expect(fused.confidence).toBeLessThan(0.35)
    expect(fused.evidence.some((line) => line.includes('待确认'))).toBe(true)
  })

  it('does not override a strong deterministic result', () => {
    const detected = production({
      label: 'code_render',
      confidence: 0.9
    })
    const fused = fuseProduction(detected, {
      label: 'live_action',
      confidence: 0.9
    })
    expect(fused).toEqual(detected)
  })

  it('deduplicates evidence', () => {
    const fused = fuseProduction(production(), {
      label: 'ai_video',
      confidence: 0.8,
      evidence: '纹理能量 60'
    })
    expect(fused.evidence.filter((line) => line === '纹理能量 60')).toHaveLength(
      1
    )
  })
})
