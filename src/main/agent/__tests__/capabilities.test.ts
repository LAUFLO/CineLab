import { describe, expect, it } from 'vitest'
import type { AgentScope } from '@shared/agent'
import { AGENT_TOOLS } from '../tools'
import { executeMainTool } from '../main-tools'
import {
  AGENT_CAPABILITIES,
  capabilitySummary,
  capabilitiesForProfile,
  findCapability
} from '../capabilities/registry'

describe('agent capability registry', () => {
  it('projects every registered tool exactly once', () => {
    expect(AGENT_CAPABILITIES).toHaveLength(AGENT_TOOLS.length)
    expect(new Set(AGENT_CAPABILITIES.map((item) => item.id)).size).toBe(
      AGENT_TOOLS.length
    )
    expect(
      new Set(AGENT_CAPABILITIES.map((item) => item.toolName)).size
    ).toBe(AGENT_TOOLS.length)
  })

  it('keeps capability metadata in sync with tool definitions', () => {
    for (const tool of AGENT_TOOLS) {
      const capability = findCapability(tool.name)
      expect(capability).toBeTruthy()
      expect(capability?.id).toBe(tool.id)
      expect(capability?.readOnly).toBe(tool.readOnly)
      expect(capability?.scope).toBe(tool.scope)
      expect(capability?.profiles).toEqual(tool.profiles)
      expect(capability?.description.length).toBeGreaterThan(10)
    }
  })

  it('marks conditional confirmations for node operations', () => {
    expect(findCapability('canvas_node_operation')?.confirmation).toBe(
      'conditional'
    )
    expect(findCapability('canvas_delete_node')?.confirmation).toBe('always')
    expect(findCapability('canvas_get')?.confirmation).toBe('none')
  })

  it('filters by profile and permission mode', () => {
    const canvasCurrent = capabilitiesForProfile(
      AGENT_TOOLS,
      'canvas',
      'current'
    )
    expect(canvasCurrent).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ toolName: 'canvas_node_operation' }),
        expect.objectContaining({ toolName: 'film_study_auto' })
      ])
    )

    const canvasReadOnly = capabilitiesForProfile(
      AGENT_TOOLS,
      'canvas',
      'read-only'
    )
    expect(
      canvasReadOnly.some(
        (item) => item.toolName === 'canvas_node_operation'
      )
    ).toBe(false)
    expect(
      canvasReadOnly.some((item) => item.toolName === 'capability_catalog')
    ).toBe(true)
  })

  it('summarizes capabilities by scope', () => {
    const summary = capabilitySummary(AGENT_TOOLS)
    expect(summary.find((item) => item.scope === 'canvas')?.count).toBeGreaterThan(0)
    expect(summary.find((item) => item.scope === 'timeline')?.count).toBeGreaterThan(0)
    expect(summary.find((item) => item.scope === 'film')?.count).toBeGreaterThanOrEqual(5)
  })

  it('searches capabilities by keyword', async () => {
    const scope: AgentScope = {
      projectPath: 'C:/project',
      canvasId: 'canvas-1',
      selectedNodeIds: []
    }
    const result = await executeMainTool(
      { callId: 'call-1', name: 'capability_search', args: { query: '拉片' } },
      scope
    )
    expect(result.ok).toBe(true)
    const tools = (result.result as { tools: Array<{ name: string }> }).tools
    expect(tools.length).toBeGreaterThan(0)
    expect(tools.some((tool) => tool.name === 'film_study_get')).toBe(true)
  })
})
