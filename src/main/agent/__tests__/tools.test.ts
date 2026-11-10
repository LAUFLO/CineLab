import { describe, expect, it } from 'vitest'
import type { AgentScope, AgentToolCall } from '@shared/agent'
import {
  AgentToolError,
  assertToolAllowed,
  isTimelineWriteTool,
  toolConfirmationReason,
  toolDefinitionsForModel
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

  it('validates reference nodes and library refs', () => {
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
    ).not.toThrow()

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

    expect(() =>
      assertToolAllowed(
        call('generation_propose', {
          ...base,
          libraryRefs: [{ path: '场景/街景.png', kind: 'image' }]
        }),
        scope,
        'current'
      )
    ).not.toThrow()

    expect(() =>
      assertToolAllowed(
        call('generation_propose', {
          ...base,
          libraryRefs: [{ path: 'C:/secret.png', kind: 'image' }]
        }),
        scope,
        'current'
      )
    ).toThrow(AgentToolError)

    expect(() =>
      assertToolAllowed(
        call('generation_propose', {
          ...base,
          libraryRefs: [{ path: '场景/街景.png', kind: 'audio' }]
        }),
        scope,
        'current'
      )
    ).toThrow(AgentToolError)
  })

  it('supports placing a new node near a reference node', () => {
    expect(() =>
      assertToolAllowed(
        call('canvas_add_node', { kind: 'video', nearNodeId: 'node-a' }),
        scope,
        'current'
      )
    ).not.toThrow()

    expect(() =>
      assertToolAllowed(
        call('canvas_add_node', { kind: 'video' }),
        scope,
        'current'
      )
    ).toThrow(AgentToolError)

    expect(() =>
      assertToolAllowed(
        call('canvas_add_node', { kind: 'video', x: 10, y: 20 }),
        scope,
        'current'
      )
    ).not.toThrow()
  })

  it('validates library search params', () => {
    expect(() =>
      assertToolAllowed(
        call('library_search', { query: '街景', kind: 'image', limit: 10 }),
        scope,
        'read-only'
      )
    ).not.toThrow()

    expect(() =>
      assertToolAllowed(
        call('library_search', { kind: 'template' }),
        scope,
        'read-only'
      )
    ).toThrow(AgentToolError)

    expect(() =>
      assertToolAllowed(
        call('library_search', { limit: 31 }),
        scope,
        'read-only'
      )
    ).toThrow(AgentToolError)
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

  it('validates advanced clip tools', () => {
    const clipScope = { ...scope, timelineId: 'timeline-1' }

    expect(() =>
      assertToolAllowed(
        call('timeline_auto_subtitles', { clipId: 'clip-1' }),
        clipScope,
        'current'
      )
    ).not.toThrow()
    expect(() =>
      assertToolAllowed(
        call('timeline_auto_subtitles', { clipId: '' }),
        clipScope,
        'current'
      )
    ).toThrow(AgentToolError)

    expect(() =>
      assertToolAllowed(
        call('timeline_remove_silence', {
          clipIds: ['clip-1'],
          paddingMs: 120,
          minDurationMs: 400,
          ripple: true
        }),
        clipScope,
        'current'
      )
    ).not.toThrow()
    expect(() =>
      assertToolAllowed(
        call('timeline_remove_silence', { paddingMs: -1 }),
        clipScope,
        'current'
      )
    ).toThrow(AgentToolError)
    expect(() =>
      assertToolAllowed(
        call('timeline_remove_silence', { clipIds: [] }),
        clipScope,
        'current'
      )
    ).toThrow(AgentToolError)

    expect(() =>
      assertToolAllowed(
        call('timeline_set_transition', {
          clipId: 'clip-1',
          type: 'wipe-left',
          durationMs: 600
        }),
        clipScope,
        'current'
      )
    ).not.toThrow()
    expect(() =>
      assertToolAllowed(
        call('timeline_set_transition', {
          clipId: 'clip-1',
          type: 'none'
        }),
        clipScope,
        'current'
      )
    ).not.toThrow()
    expect(() =>
      assertToolAllowed(
        call('timeline_set_transition', {
          clipId: 'clip-1',
          type: 'spin'
        }),
        clipScope,
        'current'
      )
    ).toThrow(AgentToolError)
    expect(() =>
      assertToolAllowed(
        call('timeline_set_transition', {
          clipId: 'clip-1',
          type: 'fade',
          durationMs: 50
        }),
        clipScope,
        'current'
      )
    ).toThrow(AgentToolError)

    expect(() =>
      assertToolAllowed(
        call('timeline_export', { codec: 'hevc' }),
        clipScope,
        'current'
      )
    ).not.toThrow()
    expect(() =>
      assertToolAllowed(
        call('timeline_export', { codec: 'gif' }),
        clipScope,
        'current'
      )
    ).toThrow(AgentToolError)
  })

  it('requires confirmation for advanced clip tools', () => {
    expect(
      toolConfirmationReason(call('timeline_remove_silence', {}))
    ).toContain('静音')
    expect(
      toolConfirmationReason(call('timeline_export', { codec: 'h264' }))
    ).toContain('导出成片')
    expect(
      toolConfirmationReason(
        call('timeline_auto_subtitles', { clipId: 'clip-1' })
      )
    ).toBeNull()
    expect(
      toolConfirmationReason(
        call('timeline_set_transition', {
          clipId: 'clip-1',
          type: 'fade'
        })
      )
    ).toBeNull()
  })

  it('exposes advanced clip tools in the clip profile', () => {
    const names = toolDefinitionsForModel('clip', 'current').map(
      (tool) => tool.function.name
    )
    expect(names).toEqual(
      expect.arrayContaining([
        'timeline_auto_subtitles',
        'timeline_remove_silence',
        'timeline_set_transition',
        'timeline_export'
      ])
    )

    const readOnlyNames = toolDefinitionsForModel('clip', 'read-only').map(
      (tool) => tool.function.name
    )
    expect(readOnlyNames).not.toContain('timeline_export')
    expect(readOnlyNames).not.toContain('timeline_remove_silence')
  })

  it('only marks timeline-mutating tools as undoable', () => {
    expect(isTimelineWriteTool('timeline_auto_subtitles')).toBe(true)
    expect(isTimelineWriteTool('timeline_remove_silence')).toBe(true)
    expect(isTimelineWriteTool('timeline_set_transition')).toBe(true)
    expect(isTimelineWriteTool('timeline_export')).toBe(false)
    expect(isTimelineWriteTool('timeline_get')).toBe(false)
    expect(isTimelineWriteTool('timeline_select_clips')).toBe(false)
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
