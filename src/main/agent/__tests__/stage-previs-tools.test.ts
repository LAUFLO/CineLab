import { describe, expect, it } from 'vitest'
import type { AgentScope, AgentToolCall } from '@shared/agent'
import { AgentToolError, assertToolAllowed } from '../tools'

const scope: AgentScope = {
  projectPath: 'C:/project',
  canvasId: 'canvas-1',
  selectedNodeIds: ['node-a']
}

function call(name: string, args: Record<string, unknown>): AgentToolCall {
  return { callId: 'call-1', name, args }
}

describe('stage previs tools', () => {
  it('整片导出不再强制 shotId', () => {
    expect(() =>
      assertToolAllowed(
        call('stage_export_preview', { nodeId: 'node-a', scope: 'program' }),
        scope,
        'current'
      )
    ).not.toThrow()
  })

  it('单镜导出仍要求 shotId', () => {
    expect(() =>
      assertToolAllowed(
        call('stage_export_preview', { nodeId: 'node-a' }),
        scope,
        'current'
      )
    ).toThrow(AgentToolError)
  })

  it('校验动作轨关键帧', () => {
    expect(() =>
      assertToolAllowed(
        call('stage_set_action_track', {
          nodeId: 'node-a',
          shotId: 'shot-1',
          objectId: 'o1',
          keys: [{ timeMs: 0, pose: 'stand' }]
        }),
        scope,
        'current'
      )
    ).not.toThrow()
    expect(() =>
      assertToolAllowed(
        call('stage_set_action_track', {
          nodeId: 'node-a',
          shotId: 'shot-1',
          objectId: 'o1',
          keys: [{ timeMs: -1 }]
        }),
        scope,
        'current'
      )
    ).toThrow(AgentToolError)
  })

  it('校验预演计划结构', () => {
    expect(() =>
      assertToolAllowed(
        call('stage_previs_plan', {
          nodeId: 'node-a',
          summary: '搭景并导出预演',
          steps: [{ name: 'stage_get', args: { nodeId: 'node-a' } }]
        }),
        scope,
        'current'
      )
    ).not.toThrow()
    expect(() =>
      assertToolAllowed(
        call('stage_previs_plan', {
          nodeId: 'node-a',
          summary: '',
          steps: []
        }),
        scope,
        'current'
      )
    ).toThrow(AgentToolError)
  })
})
