// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import {
  createClip,
  createTimeline,
  mainTrackId
} from '@shared/timeline-schema'
import { useStudioStore } from '../../stores/studio'
import { useTimelineStore } from '../../stores/timeline'
import { executeTimelineTool } from '../timelineBridge'

function request(name: string, args: Record<string, unknown>) {
  return {
    callId: `call-${name}`,
    turnId: 'turn-timeline',
    name,
    args,
    permissionMode: 'current' as const,
    scope: {
      projectPath: '',
      canvasId: 'canvas-1',
      selectedNodeIds: [],
      timelineId: 'timeline-test'
    }
  }
}

describe('timeline bridge', () => {
  it('reads and updates a timeline document', async () => {
    const doc = createTimeline({
      id: 'timeline-test',
      name: '测试时间线'
    })
    const trackId = mainTrackId(doc)
    expect(trackId).toBeTruthy()
    doc.clips.push(
      createClip({
        trackId: trackId!,
        kind: 'video',
        startMs: 0,
        durationMs: 5000,
        media: {
          scope: 'project',
          path: 'assets/vid/test-clip.mp4',
          kind: 'video',
          width: 640,
          height: 360
        }
      })
    )

    useStudioStore.setState({ open: true, nodeId: 'studio-test' })
    useTimelineStore.getState().load(doc)

    const before = await executeTimelineTool(request('timeline_get', {}))
    expect(before.ok).toBe(true)
    expect(before.result).toMatchObject({ clipCount: 1 })

    const update = await executeTimelineTool(
      request('timeline_set_video', {
        width: 1280,
        height: 720,
        fps: 30
      })
    )
    expect(update.ok).toBe(true)
    expect(useTimelineStore.getState().doc?.video).toMatchObject({
      width: 1280,
      height: 720,
      fps: 30
    })
  })
})
