import { describe, expect, it } from 'vitest'
import { canvasDataSchema } from '../project-schema'

const style = {
  id: 'film',
  name: '电影感',
  category: '电影感',
  cover: 'film.webp',
  prompt: '胶片颗粒，低饱和',
  version: 1,
  source: 'official' as const
}

function canvas(styleCard?: typeof style) {
  return {
    schemaVersion: 1 as const,
    id: 'canvas',
    name: '画布',
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [
      {
        id: 'node-1',
        type: 'cine' as const,
        position: { x: 0, y: 0 },
        data: {
          kind: 'image' as const,
          title: '图像',
          status: 'idle' as const,
          templates: [],
          ...(styleCard ? { style: styleCard } : {})
        }
      }
    ],
    edges: []
  }
}

describe('canvasDataSchema', () => {
  it('保留节点 data.style', () => {
    const parsed = canvasDataSchema.parse(canvas(style))
    expect(parsed.nodes[0]).toMatchObject({ data: { style } })
  })

  it('旧画布没有 data.style 也能加载', () => {
    const parsed = canvasDataSchema.parse(canvas())
    expect(parsed.nodes[0]).not.toHaveProperty('data.style')
  })
})
