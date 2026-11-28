import { describe, expect, it } from 'vitest'
import {
  buildLayerSplitPrompt,
  clampAutoMax,
  layerMaxImages,
  layerSplitModeOf,
  normalizeLayerRect,
  validateLayerSource
} from '../layer-split-prompt'

const RECT = { x: 0, y: 0, width: 10, height: 10 }

describe('layer-split-prompt', () => {
  it('infers all four input modes', () => {
    expect(layerSplitModeOf([], '')).toBe('auto')
    expect(layerSplitModeOf([RECT], '')).toBe('box')
    expect(layerSplitModeOf([], '蓝色房子')).toBe('prompt')
    expect(layerSplitModeOf([RECT], '蓝色房子')).toBe('box-prompt')
  })

  it('clamps automatic subject counts to 2-8', () => {
    expect(clampAutoMax(undefined)).toBe(4)
    expect(clampAutoMax(1)).toBe(2)
    expect(clampAutoMax(9)).toBe(8)
    expect(clampAutoMax('5')).toBe(5)
    expect(clampAutoMax('nope')).toBe(4)
    expect(clampAutoMax(4.6)).toBe(5)
  })

  it('uses base + N outputs for auto and base + selected boxes otherwise', () => {
    expect(layerMaxImages('auto', 4)).toBe(5)
    expect(layerMaxImages('auto', 8)).toBe(9)
    expect(layerMaxImages('box', 8)).toBe(2)
    expect(layerMaxImages('box', 8, 3)).toBe(4)
    expect(layerMaxImages('prompt', 8)).toBe(2)
    expect(layerMaxImages('box-prompt', 8, 2)).toBe(3)
  })

  it('clamps the box to the source image', () => {
    expect(
      normalizeLayerRect(
        { x: -10, y: 20, width: 500, height: 500 },
        100,
        100
      )
    ).toEqual({ x: 0, y: 20, width: 100, height: 80 })
    expect(
      normalizeLayerRect(
        { x: 98, y: 98, width: 100, height: 100 },
        100,
        100
      )
    ).toEqual({ x: 98, y: 98, width: 2, height: 2 })
  })

  it('builds prompts for auto, box, prompt and box + prompt', () => {
    const base = { width: 1000, height: 800, rects: [], prompt: '', autoMax: 4 }

    expect(
      buildLayerSplitPrompt({ ...base, mode: 'auto', autoMax: 4 })
    ).toContain('最多 4 个主体')

    expect(
      buildLayerSplitPrompt({ ...base, mode: 'prompt', prompt: '蓝色房子' })
    ).toContain('只将 蓝色房子 拆分为独立图层')

    expect(
      buildLayerSplitPrompt({
        ...base,
        mode: 'box',
        rects: [{ x: 100, y: 200, width: 300, height: 400 }]
      })
    ).toContain('<bbox>100 200 400 600</bbox>')

    expect(
      buildLayerSplitPrompt({
        ...base,
        mode: 'box-prompt',
        prompt: '蓝色房子',
        rects: [{ x: 100, y: 200, width: 300, height: 400 }]
      })
    ).toContain('范围内、蓝色房子 的主体')
  })

  it('emits every selected box for multi-region prompts', () => {
    const prompt = buildLayerSplitPrompt({
      mode: 'box',
      prompt: '',
      rects: [
        { x: 0, y: 0, width: 100, height: 100 },
        { x: 200, y: 200, width: 50, height: 50 }
      ],
      width: 1000,
      height: 800,
      autoMax: 4
    })
    expect(prompt).toContain('<bbox>0 0 100 100</bbox>')
    expect(prompt).toContain('<bbox>200 200 250 250</bbox>')
    expect(prompt).toContain('分别拆分为独立图层')
  })

  it('validates source size, aspect and format', () => {
    expect(
      validateLayerSource({ width: 1024, height: 576, path: 'a.png' })
    ).toBeNull()
    expect(
      validateLayerSource({ width: 100, height: 100, path: 'a.png' })
    ).toContain('总像素')
    expect(
      validateLayerSource({ width: 9000, height: 576, path: 'a.png' })
    ).toContain('最长边')
    expect(
      validateLayerSource({ width: 5000, height: 300, path: 'a.png' })
    ).toContain('宽高比')
    expect(
      validateLayerSource({ width: 1024, height: 576, path: 'a.webp' })
    ).toContain('PNG / JPEG')
  })
})
