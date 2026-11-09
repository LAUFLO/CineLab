import { describe, expect, it } from 'vitest'
import type { AgentScope, AgentToolCall } from '@shared/agent'
import {
  AgentToolError,
  assertToolAllowed,
  toolConfirmationReason
} from '../tools'

const scope: AgentScope = {
  projectPath: 'C:/project',
  canvasId: 'canvas-1',
  selectedNodeIds: ['node-a']
}

function call(name: string, args: Record<string, unknown>): AgentToolCall {
  return { callId: 'call-1', name, args }
}

describe('agent tool permissions', () => {
  it('rejects write tools in read-only mode', () => {
    expect(() =>
      assertToolAllowed(
        call('canvas_add_node', { kind: 'text', x: 100, y: 100 }),
        scope,
        'read-only'
      )
    ).toThrow(AgentToolError)
  })

  it('allows creating a node without a selection', () => {
    expect(() =>
      assertToolAllowed(
        call('canvas_add_node', { kind: 'text', x: 100, y: 100 }),
        scope,
        'current'
      )
    ).not.toThrow()
  })

  it('requires both ends of a connection in scope', () => {
    expect(() =>
      assertToolAllowed(
        call('canvas_connect', {
          sourceNodeId: 'node-a',
          targetNodeId: 'node-b'
        }),
        scope,
        'current'
      )
    ).toThrow(AgentToolError)

    expect(() =>
      assertToolAllowed(
        call('canvas_connect', {
          sourceNodeId: 'node-a',
          targetNodeId: 'node-b'
        }),
        { ...scope, selectedNodeIds: ['node-a', 'node-b'] },
        'current'
      )
    ).not.toThrow()
  })

  it('requires the deleted node in scope', () => {
    expect(() =>
      assertToolAllowed(
        call('canvas_delete_node', { nodeId: 'node-b' }),
        scope,
        'current'
      )
    ).toThrow(AgentToolError)

    expect(() =>
      assertToolAllowed(
        call('canvas_delete_node', { nodeId: 'node-a' }),
        scope,
        'current'
      )
    ).not.toThrow()
  })

  it('requires at least two unique in-scope nodes for grouping', () => {
    expect(() =>
      assertToolAllowed(
        call('canvas_group', { nodeIds: ['node-a'] }),
        scope,
        'current'
      )
    ).toThrow(AgentToolError)

    expect(() =>
      assertToolAllowed(
        call('canvas_group', { nodeIds: ['node-a', 'node-a'] }),
        scope,
        'current'
      )
    ).toThrow(AgentToolError)

    expect(() =>
      assertToolAllowed(
        call('canvas_group', { nodeIds: ['node-a', 'node-b'] }),
        scope,
        'current'
      )
    ).toThrow(AgentToolError)

    expect(() =>
      assertToolAllowed(
        call('canvas_group', { nodeIds: ['node-a', 'node-b'] }),
        { ...scope, selectedNodeIds: ['node-a', 'node-b'] },
        'current'
      )
    ).not.toThrow()
  })

  it('requires the group in scope for ungroup', () => {
    expect(() =>
      assertToolAllowed(
        call('canvas_ungroup', { groupId: 'group-a' }),
        scope,
        'current'
      )
    ).toThrow(AgentToolError)

    expect(() =>
      assertToolAllowed(
        call('canvas_ungroup', { groupId: 'group-a' }),
        { ...scope, selectedNodeIds: ['group-a'] },
        'current'
      )
    ).not.toThrow()
  })

  it('requires the generation target node in scope', () => {
    expect(() =>
      assertToolAllowed(
        call('generation_propose', {
          nodeId: 'node-b',
          modelKey: 'provider/model',
          prompt: '一只猫'
        }),
        scope,
        'current'
      )
    ).toThrow(AgentToolError)

    expect(() =>
      assertToolAllowed(
        call('generation_propose', {
          nodeId: 'node-a',
          modelKey: 'provider/model',
          prompt: '一只猫'
        }),
        scope,
        'current'
      )
    ).not.toThrow()
  })

  it('rejects invalid generation params', () => {
    const base = {
      nodeId: 'node-a',
      modelKey: 'provider/model',
      prompt: '一只猫'
    }

    expect(() =>
      assertToolAllowed(
        call('generation_propose', { ...base, modelKey: 'model' }),
        scope,
        'current'
      )
    ).toThrow(AgentToolError)

    expect(() =>
      assertToolAllowed(
        call('generation_propose', { ...base, prompt: ' ' }),
        scope,
        'current'
      )
    ).toThrow(AgentToolError)

    expect(() =>
      assertToolAllowed(
        call('generation_propose', { ...base, count: 9 }),
        scope,
        'current'
      )
    ).toThrow(AgentToolError)

    expect(() =>
      assertToolAllowed(
        call('generation_propose', { ...base, count: 2 }),
        scope,
        'current'
      )
    ).not.toThrow()
  })

  it('requires reference nodes in scope and unique', () => {
    const base = {
      nodeId: 'node-a',
      modelKey: 'provider/model',
      prompt: '一只猫'
    }

    expect(() =>
      assertToolAllowed(
        call('generation_propose', { ...base, refNodeIds: ['node-b'] }),
        scope,
        'current'
      )
    ).toThrow(AgentToolError)

    expect(() =>
      assertToolAllowed(
        call('generation_propose', {
          ...base,
          refNodeIds: ['node-a', 'node-a']
        }),
        scope,
        'current'
      )
    ).toThrow(AgentToolError)

    expect(() =>
      assertToolAllowed(
        call('generation_propose', { ...base, refNodeIds: ['node-a'] }),
        scope,
        'current'
      )
    ).not.toThrow()
  })

  it('rejects generation in read-only mode', () => {
    expect(() =>
      assertToolAllowed(
        call('generation_propose', {
          nodeId: 'node-a',
          modelKey: 'provider/model',
          prompt: '一只猫'
        }),
        scope,
        'read-only'
      )
    ).toThrow(AgentToolError)
  })

  it('requires stage node in scope for stage tools', () => {
    expect(() =>
      assertToolAllowed(
        call('stage_get', { nodeId: 'node-b' }),
        scope,
        'read-only'
      )
    ).toThrow(AgentToolError)

    expect(() =>
      assertToolAllowed(
        call('stage_get', { nodeId: 'node-a' }),
        scope,
        'read-only'
      )
    ).not.toThrow()
  })

  it('validates stage object parameters', () => {
    const base = { nodeId: 'node-a', type: 'human' }

    expect(() =>
      assertToolAllowed(
        call('stage_add_object', { ...base, type: 'unknown' }),
        scope,
        'current'
      )
    ).toThrow(AgentToolError)

    expect(() =>
      assertToolAllowed(
        call('stage_add_object', { ...base, position: [1, 2] }),
        scope,
        'current'
      )
    ).toThrow(AgentToolError)

    expect(() =>
      assertToolAllowed(
        call('stage_add_object', { ...base, count: 101 }),
        scope,
        'current'
      )
    ).toThrow(AgentToolError)

    expect(() =>
      assertToolAllowed(
        call('stage_add_object', {
          ...base,
          type: 'crowd',
          count: 5,
          position: [0, 0, 0],
          pose: 'walk'
        }),
        scope,
        'current'
      )
    ).not.toThrow()
  })

  it('requires at least one transform field', () => {
    expect(() =>
      assertToolAllowed(
        call('stage_transform_object', {
          nodeId: 'node-a',
          objectId: 'object-1'
        }),
        scope,
        'current'
      )
    ).toThrow(AgentToolError)

    expect(() =>
      assertToolAllowed(
        call('stage_transform_object', {
          nodeId: 'node-a',
          objectId: 'object-1',
          position: [1, 0, 0]
        }),
        scope,
        'current'
      )
    ).not.toThrow()
  })

  it('validates stage camera parameters', () => {
    expect(() =>
      assertToolAllowed(
        call('stage_add_camera', { nodeId: 'node-a', fov: 200 }),
        scope,
        'current'
      )
    ).toThrow(AgentToolError)

    expect(() =>
      assertToolAllowed(
        call('stage_add_camera', { nodeId: 'node-a', aspect: '4:3' }),
        scope,
        'current'
      )
    ).toThrow(AgentToolError)

    expect(() =>
      assertToolAllowed(
        call('stage_add_camera', {
          nodeId: 'node-a',
          position: [5, 2, 6],
          target: [0, 1, 0],
          fov: 45,
          aspect: '16:9'
        }),
        scope,
        'current'
      )
    ).not.toThrow()
  })

  it('allows stage capabilities in read-only mode', () => {
    expect(() =>
      assertToolAllowed(
        call('stage_capabilities', {}),
        scope,
        'read-only'
      )
    ).not.toThrow()
  })

  it('rejects stage writes in read-only mode', () => {
    expect(() =>
      assertToolAllowed(
        call('stage_add_object', {
          nodeId: 'node-a',
          type: 'human'
        }),
        scope,
        'read-only'
      )
    ).toThrow(AgentToolError)
  })

  it('requires an open timeline for clip tools', () => {
    expect(() =>
      assertToolAllowed(
        call('timeline_get', {}),
        scope,
        'read-only'
      )
    ).toThrow(AgentToolError)

    expect(() =>
      assertToolAllowed(
        call('timeline_get', {}),
        { ...scope, timelineId: 'timeline-1' },
        'read-only'
      )
    ).not.toThrow()
  })

  it('rejects timeline writes in read-only mode', () => {
    expect(() =>
      assertToolAllowed(
        call('timeline_move_clips', {
          clipIds: ['clip-1'],
          deltaMs: 1000
        }),
        { ...scope, timelineId: 'timeline-1' },
        'read-only'
      )
    ).toThrow(AgentToolError)
  })

  it('validates clip move parameters', () => {
    const clipScope = { ...scope, timelineId: 'timeline-1' }

    expect(() =>
      assertToolAllowed(
        call('timeline_move_clips', { clipIds: ['clip-1'] }),
        clipScope,
        'current'
      )
    ).toThrow(AgentToolError)

    expect(() =>
      assertToolAllowed(
        call('timeline_move_clips', {
          clipIds: ['clip-1'],
          deltaMs: Number.NaN
        }),
        clipScope,
        'current'
      )
    ).toThrow(AgentToolError)

    expect(() =>
      assertToolAllowed(
        call('timeline_move_clips', {
          clipIds: ['clip-1', 'clip-1'],
          deltaMs: 1000
        }),
        clipScope,
        'current'
      )
    ).toThrow(AgentToolError)

    expect(() =>
      assertToolAllowed(
        call('timeline_move_clips', {
          clipIds: ['clip-1', 'clip-2'],
          startMs: 2000,
          mode: 'overwrite'
        }),
        clipScope,
        'current'
      )
    ).not.toThrow()
  })

  it('validates trim, split and marker parameters', () => {
    const clipScope = { ...scope, timelineId: 'timeline-1' }

    expect(() =>
      assertToolAllowed(
        call('timeline_trim_clip', {
          clipId: 'clip-1',
          edge: 'middle',
          deltaMs: 100
        }),
        clipScope,
        'current'
      )
    ).toThrow(AgentToolError)

    expect(() =>
      assertToolAllowed(
        call('timeline_split_clips', {
          clipIds: ['clip-1'],
          atMs: -1
        }),
        clipScope,
        'current'
      )
    ).toThrow(AgentToolError)

    expect(() =>
      assertToolAllowed(
        call('timeline_add_marker', { atMs: 1000, label: '开场' }),
        clipScope,
        'current'
      )
    ).not.toThrow()
  })

  it('validates clip property patches', () => {
    const clipScope = { ...scope, timelineId: 'timeline-1' }

    expect(() =>
      assertToolAllowed(
        call('timeline_update_clip', {
          clipId: 'clip-1',
          patch: { volume: 5 }
        }),
        clipScope,
        'current'
      )
    ).toThrow(AgentToolError)

    expect(() =>
      assertToolAllowed(
        call('timeline_update_clip', {
          clipId: 'clip-1',
          patch: { unknown: true }
        }),
        clipScope,
        'current'
      )
    ).toThrow(AgentToolError)

    expect(() =>
      assertToolAllowed(
        call('timeline_update_clip', {
          clipId: 'clip-1',
          patch: { volume: 0.8, speed: 1.5, name: '开场' }
        }),
        clipScope,
        'current'
      )
    ).not.toThrow()
  })

  it('validates track flags', () => {
    const clipScope = { ...scope, timelineId: 'timeline-1' }

    expect(() =>
      assertToolAllowed(
        call('timeline_set_track', {
          trackId: 'track-1',
          flag: 'color',
          value: true
        }),
        clipScope,
        'current'
      )
    ).toThrow(AgentToolError)

    expect(() =>
      assertToolAllowed(
        call('timeline_set_track', {
          trackId: 'track-1',
          flag: 'locked',
          value: true
        }),
        clipScope,
        'current'
      )
    ).not.toThrow()
  })

  it('requires confirmation for deletes and large batches', () => {
    expect(
      toolConfirmationReason(
        call('canvas_delete_node', { nodeId: 'node-a' })
      )
    ).toContain('删除画布节点')
    expect(
      toolConfirmationReason(
        call('stage_remove_object', {
          nodeId: 'node-a',
          objectId: 'object-1'
        })
      )
    ).toContain('删除导演台对象')
    expect(
      toolConfirmationReason(
        call('timeline_remove_clips', { clipIds: ['clip-1', 'clip-2'] })
      )
    ).toContain('2 个时间线片段')

    expect(
      toolConfirmationReason(
        call('timeline_move_clips', {
          clipIds: ['clip-1', 'clip-2'],
          deltaMs: 1000
        })
      )
    ).toBeNull()

    expect(
      toolConfirmationReason(
        call('timeline_move_clips', {
          clipIds: Array.from({ length: 11 }, (_, index) => `clip-${index}`),
          deltaMs: 1000
        })
      )
    ).toContain('11 个时间线片段')

    expect(toolConfirmationReason(call('timeline_get', {}))).toBeNull()
  })

  it('validates catalog capability', () => {
    expect(() =>
      assertToolAllowed(
        call('generation_catalog', { capability: 'image' }),
        scope,
        'current'
      )
    ).not.toThrow()

    expect(() =>
      assertToolAllowed(
        call('generation_catalog', { capability: 'unknown' }),
        scope,
        'current'
      )
    ).toThrow(AgentToolError)
  })
})
