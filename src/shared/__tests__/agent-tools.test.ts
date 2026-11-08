import { describe, expect, it } from 'vitest'
import {
  filterAgentTools,
  toModelTools,
  type AgentToolDefinition
} from '../agent-tools'

const tools: AgentToolDefinition[] = [
  {
    id: 'canvas.get',
    name: 'canvas_get',
    description: 'read canvas',
    profiles: ['canvas'],
    readOnly: true,
    scope: 'canvas',
    modes: ['read-only', 'current', 'full-access'],
    parameters: { type: 'object', properties: {} },
    replay: 'safe'
  },
  {
    id: 'canvas.updateTitle',
    name: 'canvas_update_title',
    description: 'rename node',
    profiles: ['canvas'],
    readOnly: false,
    scope: 'canvas',
    modes: ['current', 'full-access'],
    parameters: { type: 'object', properties: {} },
    replay: 'safe'
  },
  {
    id: 'timeline.get',
    name: 'timeline_get',
    description: 'read timeline',
    profiles: ['clip'],
    readOnly: true,
    scope: 'timeline',
    modes: ['read-only', 'current', 'full-access'],
    parameters: { type: 'object', properties: {} },
    replay: 'safe'
  }
]

describe('agent tool registry', () => {
  it('filters by profile and permission mode', () => {
    const readOnly = filterAgentTools(tools, 'canvas', 'read-only')
    expect(readOnly.map((tool) => tool.name)).toEqual(['canvas_get'])

    const current = filterAgentTools(tools, 'canvas', 'current')
    expect(current.map((tool) => tool.name)).toEqual([
      'canvas_get',
      'canvas_update_title'
    ])
  })

  it('keeps clip tools out of the canvas profile', () => {
    const canvas = filterAgentTools(tools, 'canvas', 'current')
    expect(canvas.some((tool) => tool.name === 'timeline_get')).toBe(false)
  })

  it('converts definitions to model tools without internal metadata', () => {
    const result = toModelTools(tools.slice(0, 1))
    expect(result).toEqual([
      {
        type: 'function',
        function: {
          name: 'canvas_get',
          description: 'read canvas',
          parameters: { type: 'object', properties: {} }
        }
      }
    ])
  })
})
