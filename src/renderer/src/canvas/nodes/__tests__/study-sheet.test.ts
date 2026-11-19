import { describe, expect, it } from 'vitest'
import type { FilmStudyScene, FilmStudyShot } from '@shared/film-study-v2'
import { buildRemakePrompt, buildShotMarkdown, groupShotsByScene } from '../study-sheet'

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

function scene(id: string, start: number, end: number): FilmStudyScene {
  return { id, name: `场 ${id}`, shots: [start, end] }
}

describe('buildShotMarkdown', () => {
  it('renders shot metadata, production and prompts', () => {
    const markdown = buildShotMarkdown(
      {
        ...shot(7),
        shotSize: '中景',
        cameraAngle: '平视',
        cameraMove: '手持跟拍',
        lighting: '室内暖光',
        visualDescription: '女子站在门口',
        actionSummary: '从门口走向沙发',
        dialogue: [{ speaker: '林小雨', text: '你瞒了我多久' }],
        production: {
          label: 'live_action',
          confidence: 0.86,
          evidence: ['传感器噪声 0.42', '24fps 无重复帧'],
          material: 'real'
        },
        castIds: ['lin'],
        imagePrompt: 'cinematic medium shot'
      },
      scene('S1', 1, 8),
      [
        {
          id: 'lin',
          name: '林小雨',
          importance: 'lead',
          shotIndexes: [7]
        }
      ]
    )

    expect(markdown).toContain('镜 07')
    expect(markdown).toContain('景别 中景')
    expect(markdown).toContain('林小雨：你瞒了我多久')
    expect(markdown).toContain('制作方式：实拍 86%')
    expect(markdown).toContain('传感器噪声 0.42')
    expect(markdown).toContain('角色：林小雨')
    expect(markdown).toContain('场景：S1 · 场 S1')
    expect(markdown).toContain('### 提示词')
    expect(markdown).toContain('cinematic medium shot')
  })

  it('omits empty sections', () => {
    const markdown = buildShotMarkdown(shot(1))
    expect(markdown).toContain('镜 01')
    expect(markdown).not.toContain('### 提示词')
    expect(markdown).not.toContain('制作方式')
  })
})

describe('buildRemakePrompt', () => {
  it('prefers the video prompt', () => {
    expect(
      buildRemakePrompt({
        ...shot(1),
        videoPrompt: 'she walks in',
        imagePrompt: 'cinematic'
      })
    ).toBe('she walks in')
  })

  it('falls back to the image prompt and description', () => {
    expect(buildRemakePrompt({ ...shot(1), imagePrompt: 'cinematic' })).toBe(
      'cinematic'
    )
    expect(
      buildRemakePrompt({ ...shot(1), visualDescription: '女子站在门口' })
    ).toBe('女子站在门口')
  })

  it('returns an empty string when nothing is available', () => {
    expect(buildRemakePrompt(shot(1))).toBe('')
  })
})

describe('groupShotsByScene', () => {
  it('groups shots by scene range', () => {
    const groups = groupShotsByScene(
      [shot(1), shot(2), shot(3), shot(4)],
      [scene('S1', 1, 2), scene('S2', 3, 4)]
    )
    expect(groups.map((group) => group.title)).toEqual([
      'S1 · 场 S1',
      'S2 · 场 S2'
    ])
    expect(groups[0].shots.map((item) => item.index)).toEqual([1, 2])
  })

  it('falls back to ten-shot groups without scenes', () => {
    const shots = Array.from({ length: 12 }, (_, index) => shot(index + 1))
    const groups = groupShotsByScene(shots, [])
    expect(groups.map((group) => group.shots.length)).toEqual([10, 2])
  })

  it('returns no groups for no shots', () => {
    expect(groupShotsByScene([], [])).toEqual([])
  })
})
