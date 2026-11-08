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
