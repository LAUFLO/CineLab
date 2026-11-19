// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import type { FilmStudy } from '@shared/film-study'
import { useCanvasStore } from '../../stores/canvas'
import { executeFilmTool } from '../filmBridge'

const study = {
  schemaVersion: 1,
  id: 'study-test',
  sourceNodeId: 'video-test',
  sourcePath: 'assets/vid/test-clip.mp4',
  sourceScope: 'project',
  sourceName: 'test-clip',
  duration: 5,
  fps: 30,
  frameInterval: 1,
  frames: [],
  segments: [
    {
      id: 'segment-1',
      startTime: 0,
      endTime: 5,
      title: '测试分镜',
      type: '镜头',
      segmentFunction: '',
      keyBeats: '',
      creativeIntent: '',
      techniques: '',
      audienceExperience: '',
      structureRole: '',
      shotSize: '',
      cameraAngle: '',
      cameraMove: '',
      lighting: '',
      visualDescription: '',
      imagePrompt: '',
      voiceOver: '',
      musicCue: ''
    }
  ],
  createdAt: '2026-11-19T00:00:00.000Z',
  updatedAt: '2026-11-19T00:00:00.000Z'
} as unknown as FilmStudy

describe('film bridge', () => {
  it('resolves a study node and returns its summary', async () => {
    useCanvasStore.setState({
      nodes: [
        {
          id: 'study-node',
          type: 'cine',
          position: { x: 0, y: 0 },
          data: {
            kind: 'study',
            title: '测试拉片',
            studyId: 'study-test'
          },
          style: { width: 320, height: 240 }
        } as never
      ],
      edges: []
    })

    ;(window as unknown as {
      api: { filmStudy: { load: (id: string) => Promise<FilmStudy> } }
    }).api = {
      filmStudy: {
        load: async () => study
      }
    }

    const result = await executeFilmTool({
      callId: 'call-film',
      turnId: 'turn-film',
      name: 'film_study_get',
      args: { nodeId: 'study-node' },
      permissionMode: 'current',
      scope: {
        projectPath: '',
        canvasId: 'canvas-1',
        selectedNodeIds: ['study-node']
      }
    })

    expect(result.ok).toBe(true)
    expect(result.result).toMatchObject({
      studyId: 'study-test',
      segmentCount: 1,
      studyNodeId: 'study-node'
    })
  })
})
