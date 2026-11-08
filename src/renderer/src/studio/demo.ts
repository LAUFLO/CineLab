import {
  createClip,
  createTimeline,
  type TimelineClip,
  type TimelineDoc
} from '@shared/timeline-schema'

export interface DemoAsset {
  id: string
  name: string
  kind: 'video' | 'image' | 'audio'
  durationLabel: string
  durationMs: number
  path: string
}

export const DEMO_ASSETS: DemoAsset[] = [
  {
    id: 'm1',
    name: '镜头 01 · 雨夜',
    kind: 'video',
    durationLabel: '00:06',
    durationMs: 6000,
    path: 'assets/vid/demo-01.mp4'
  },
  {
    id: 'm2',
    name: '镜头 02 · 街道',
    kind: 'video',
    durationLabel: '00:10',
    durationMs: 10_000,
    path: 'assets/vid/demo-02.mp4'
  },
  {
    id: 'm3',
    name: '镜头 03 · 特写',
    kind: 'video',
    durationLabel: '00:10',
    durationMs: 10_000,
    path: 'assets/vid/demo-03.mp4'
  },
  {
    id: 'm4',
    name: '配乐 · 低频铺底',
    kind: 'audio',
    durationLabel: '00:26',
    durationMs: 26_000,
    path: 'assets/aud/demo-04.mp3'
  },
  {
    id: 'm5',
    name: '镜头 04 · 雨夜副本',
    kind: 'video',
    durationLabel: '00:06',
    durationMs: 6000,
    path: 'assets/vid/demo-01.mp4'
  },
  {
    id: 'm6',
    name: '镜头 05 · 街道副本',
    kind: 'video',
    durationLabel: '00:10',
    durationMs: 10_000,
    path: 'assets/vid/demo-02.mp4'
  }
]

export function assetToClip(
  asset: DemoAsset,
  trackId: string,
  startMs: number
): TimelineClip {
  return createClip({
    trackId,
    kind: asset.kind,
    name: asset.name,
    startMs,
    durationMs: asset.durationMs,
    media: {
      scope: 'project',
      path: asset.path,
      kind: asset.kind
    }
  })
}

/** P1/P2 交互与渲染验证用的演示时间线：26 秒，四条轨道 */
export function createDemoTimeline(): TimelineDoc {
  const doc = createTimeline({ id: 'demo', name: '未命名项目' })
  const [subtitle, v2, v1, a1] = doc.tracks.map((track) => track.id)

  const shots: { name: string; path: string; startMs: number; endMs: number }[] = [
    { name: '镜头 01 · 雨夜', path: 'assets/vid/demo-01.mp4', startMs: 0, endMs: 6000 },
    { name: '镜头 02 · 街道', path: 'assets/vid/demo-02.mp4', startMs: 6000, endMs: 16_000 },
    { name: '镜头 03 · 特写', path: 'assets/vid/demo-03.mp4', startMs: 16_000, endMs: 26_000 }
  ]
  for (const shot of shots) {
    doc.clips.push(
      createClip({
        trackId: v1,
        kind: 'video',
        name: shot.name,
        startMs: shot.startMs,
        durationMs: shot.endMs - shot.startMs,
        media: { scope: 'project', path: shot.path, kind: 'video' }
      })
    )
  }

  doc.clips.push(
    createClip({
      trackId: v2,
      kind: 'video',
      name: '画中画',
      startMs: 8000,
      durationMs: 5000,
      media: { scope: 'project', path: 'assets/vid/demo-01.mp4', kind: 'video' }
    })
  )

  doc.clips.push(
    createClip({
      trackId: subtitle,
      kind: 'text',
      name: '第一句',
      startMs: 1000,
      durationMs: 4000,
      text: {
        content: '第一句',
        fontFamily: 'Arial',
        fontSize: 64,
        color: '#ffffff',
        bold: false,
        italic: false,
        align: 'center'
      }
    })
  )
  doc.clips.push(
    createClip({
      trackId: subtitle,
      kind: 'text',
      name: '第二句',
      startMs: 6000,
      durationMs: 4000,
      text: {
        content: '第二句',
        fontFamily: 'Arial',
        fontSize: 64,
        color: '#ffffff',
        bold: false,
        italic: false,
        align: 'center'
      }
    })
  )

  doc.clips.push(
    createClip({
      trackId: a1,
      kind: 'audio',
      name: '配乐 · 低频铺底',
      startMs: 0,
      durationMs: 26_000,
      media: { scope: 'project', path: 'assets/aud/demo-04.mp3', kind: 'audio' }
    })
  )

  return doc
}
