import { describe, expect, it } from 'vitest'
import type { OutputRef } from '@shared/canvas-schema'
import { attachTransform, resolveLayerGroup, trimLayerOutputs } from '../layer-compose'

function output(
  id: string,
  zIndex: number,
  groupId: string,
  width = 2048,
  height = 2048
): OutputRef {
  return {
    id,
    path: `${id}.png`,
    kind: 'image',
    createdAt: '2026-11-27T00:00:00.000Z',
    model: 'test',
    width,
    height,
    layer: { zIndex, name: `layer-${zIndex}` },
    layerGroupId: groupId,
    layerTransform: { x: zIndex * 10, y: 0, width: 100, height: 100 }
  }
}

describe('layer-compose', () => {
  it('resolves the group from the selected output and sorts layers', () => {
    const outputs = [
      output('base', 0, 'g1'),
      output('top', 2, 'g1'),
      output('bottom', 1, 'g1'),
      output('other-base', 0, 'g2')
    ]
    const group = resolveLayerGroup(outputs, 'bottom')
    expect(group?.groupId).toBe('g1')
    expect(group?.base.id).toBe('base')
    expect(group?.layers.map((layer) => layer.id)).toEqual(['bottom', 'top'])
    expect(group?.width).toBe(2048)
    expect(group?.height).toBe(2048)
  })

  it('falls back to the newest group and rejects groups without a base', () => {
    const outputs = [
      output('base', 0, 'g1'),
      output('base2', 0, 'g2'),
      output('orphan', 1, 'g3')
    ]
    outputs[1].createdAt = '2026-11-27T00:00:01.000Z'
    expect(resolveLayerGroup(outputs, undefined)?.groupId).toBe('g2')
    expect(resolveLayerGroup(outputs, 'orphan')).toBeNull()
  })

  it('recalculates base-pixel transforms when attaching a detached node', () => {
    expect(
      attachTransform({
        sourceRect: { x: 100, y: 50, width: 400, height: 300 },
        detachedRect: { x: 500, y: 350, width: 200, height: 150 },
        groupWidth: 800,
        groupHeight: 600
      })
    ).toEqual({ x: 800, y: 600, width: 400, height: 300 })
  })

  it('protects the active layer group when trimming outputs', () => {
    const base = output('base', 0, 'g1')
    const layer = output('layer', 1, 'g1')
    const old1 = output('old1', 0, 'g0')
    const old2 = output('old2', 0, 'g0')
    expect(
      trimLayerOutputs([base, layer, old1, old2], [], 'g1', 3).map(
        (entry) => entry.id
      )
    ).toEqual(['base', 'layer', 'old1'])
  })
})
