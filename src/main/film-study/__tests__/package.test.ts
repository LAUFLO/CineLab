import { afterEach, describe, expect, it, vi } from 'vitest'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import type { FilmStudy } from '@shared/film-study'
import { extractZipSafely } from '../../components/zip-extract'

vi.mock('electron', () => ({
  app: {
    getPath: () => process.env.TEMP ?? '.',
    isPackaged: false
  },
  nativeImage: {
    createFromBuffer: () => ({ getSize: () => ({ width: 1, height: 1 }) })
  }
}))

import { exportFilmStudyAnalysisPackage, exportFilmStudyBundle } from '../service'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) =>
      fs.rm(root, { recursive: true, force: true }).catch(() => undefined)
    )
  )
})

describe('exportFilmStudyAnalysisPackage', () => {
  it('writes prompt, schema, project and frames into a zip', async () => {
    const root = await fs.mkdtemp(join(process.env.TEMP ?? '.', 'study-pack-'))
    roots.push(root)

    const frameDir = join(root, 'assets', 'study', 'pack-test', 'frames')
    await fs.mkdir(frameDir, { recursive: true })
    await fs.writeFile(join(frameDir, 'frame_000001.jpg'), Buffer.from([1, 2, 3]))
    await fs.writeFile(join(frameDir, 'frame_000002.jpg'), Buffer.from([4, 5, 6]))

    const study: FilmStudy = {
      schemaVersion: 1,
      id: 'pack-test',
      sourceNodeId: 'video-1',
      sourcePath: 'assets/vid/source.mp4',
      sourceName: '测试影片',
      duration: 2,
      fps: 24,
      frameInterval: 1,
      frames: [
        {
          index: 1,
          time: 0,
          file: 'assets/study/pack-test/frames/frame_000001.jpg'
        },
        {
          index: 2,
          time: 1,
          file: 'assets/study/pack-test/frames/frame_000002.jpg'
        }
      ],
      segments: [],
      subtitles: [
        { startTime: 0.5, endTime: 1.5, text: '测试字幕' }
      ],
      createdAt: '2026-11-08T00:00:00.000Z',
      updatedAt: '2026-11-08T00:00:00.000Z'
    }

    await fs.mkdir(join(root, 'study'), { recursive: true })
    await fs.writeFile(
      join(root, 'study', 'pack-test.json'),
      JSON.stringify(study, null, 2)
    )

    const target = join(root, 'analysis.zip')
    await exportFilmStudyAnalysisPackage(root, 'pack-test', target)

    const output = join(root, 'unzip')
    await fs.mkdir(output, { recursive: true })
    await extractZipSafely(target, output)

    const base = join(output, '测试影片-AI分析包')
    const prompt = await fs.readFile(join(base, 'prompt.md'), 'utf8')
    const project = JSON.parse(
      await fs.readFile(join(base, 'project.json'), 'utf8')
    ) as { frameCount: number; frames: Array<{ file: string }> }
    const schema = JSON.parse(
      await fs.readFile(join(base, 'schema.json'), 'utf8')
    ) as { required: string[] }
    const frame = await fs.readFile(
      join(base, 'frames', 'frame_000002_00-01-0.jpg')
    )
    const subtitles = await fs.readFile(
      join(base, 'subtitles.srt'),
      'utf8'
    )

    expect(prompt).toContain('测试影片')
    expect(project.frameCount).toBe(2)
    expect(project.frames[1].file).toBe(
      'frames/frame_000002_00-01-0.jpg'
    )
    expect(schema.required).toContain('segments')
    expect(subtitles).toContain('测试字幕')
    expect([...frame]).toEqual([4, 5, 6])

    const bundleTarget = join(root, 'bundle.zip')
    await exportFilmStudyBundle(root, 'pack-test', bundleTarget)
    const bundleOutput = join(root, 'bundle')
    await fs.mkdir(bundleOutput, { recursive: true })
    await extractZipSafely(bundleTarget, bundleOutput)
    const bundleBase = join(bundleOutput, '测试影片-拉片包')
    const bundleStudy = JSON.parse(
      await fs.readFile(join(bundleBase, 'study.json'), 'utf8')
    ) as { id: string; subtitles: unknown[] }
    const bundleNotes = await fs.readFile(
      join(bundleBase, '拉片笔记.md'),
      'utf8'
    )
    const bundleSubtitles = await fs.readFile(
      join(bundleBase, 'subtitles.srt'),
      'utf8'
    )

    expect(bundleStudy.id).toBe('pack-test')
    expect(bundleStudy.subtitles).toHaveLength(1)
    expect(bundleNotes).toContain('测试影片')
    expect(bundleSubtitles).toContain('测试字幕')
  })
})
