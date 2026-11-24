import { describe, expect, it } from 'vitest'
import { filterAgentTools } from '@shared/agent-tools'
import type {
  AgentPermissionMode,
  AgentProfileId,
  AgentScope
} from '@shared/agent'
import { AGENT_TOOLS } from '../../tools'
import { createPiTools } from '../tools'
import { toolTimeoutMs, TOOL_TIMEOUT_MS, LONG_TOOL_TIMEOUTS } from '../timeouts'

const scope: AgentScope = {
  projectPath: 'C:/tmp/cinelab-test',
  canvasId: 'canvas-1',
  selectedNodeIds: [],
  selectedClipIds: [],
  playheadMs: 0
}

const runtime = {
  turnId: 'turn-1',
  scope,
  sendToolCall: () => undefined,
  waitForToolResult: async () => ({
    turnId: 'turn-1',
    callId: 'call-1',
    ok: true
  })
}

const profiles: AgentProfileId[] = ['canvas', 'clip', 'film', 'stage']
const modes: AgentPermissionMode[] = ['read-only', 'current', 'full-access']

describe('pi tool adapter', () => {
  it('keeps exactly the same tool set as the CineLab registry', () => {
    for (const profileId of profiles) {
      for (const permissionMode of modes) {
        const expected = filterAgentTools(
          AGENT_TOOLS,
          profileId,
          permissionMode
        ).map((tool) => tool.name)
        const actual = createPiTools({
          ...runtime,
          profileId,
          permissionMode
        }).map((tool) => tool.name)
        expect(actual).toEqual(expected)
      }
    }
  })

  it('registers unique tool names and object parameter schemas', () => {
    const tools = createPiTools({
      ...runtime,
      profileId: 'canvas',
      permissionMode: 'current'
    })
    const names = tools.map((tool) => tool.name)
    expect(new Set(names).size).toBe(names.length)
    for (const tool of tools) {
      expect(tool.parameters).toBeTruthy()
      expect(tool.description.trim().length).toBeGreaterThan(0)
    }
  })

  it('marks every tool sequential while pendingConfirm is a single slot', () => {
    const tools = createPiTools({
      ...runtime,
      profileId: 'canvas',
      permissionMode: 'current'
    })
    expect(tools.every((tool) => tool.executionMode === 'sequential')).toBe(true)
  })

  it('keeps the main-process tool set explicit', () => {
    const mainTools = AGENT_TOOLS.filter(
      (tool) => tool.executor === 'main'
    ).map((tool) => tool.name)
    expect(new Set(mainTools)).toEqual(
      new Set([
        'generation_catalog',
        'library_search',
        'capability_search',
        'skill_list',
        'skill_read',
        'stage_capabilities',
        'preset_list',
        'preset_search',
        'preset_read',
        'style_list',
        'style_search',
        'style_read',
        'preset_create',
        'preset_update',
        'preset_delete',
        'style_create',
        'style_update',
        'style_delete'
      ])
    )
  })

  it('keeps confirmation tools in the known set', () => {
    const confirmTools = new Set(
      AGENT_TOOLS.filter((tool) => tool.requiresConfirm).map((tool) => tool.name)
    )
    for (const name of [
      'canvas_delete_node',
      'stage_remove_shot',
      'stage_export_preview',
      'timeline_export'
    ]) {
      expect(confirmTools.has(name)).toBe(true)
    }
  })

  it('maps a renderer tool failure to isError', async () => {
    const tool = createPiTools({
      ...runtime,
      profileId: 'canvas',
      permissionMode: 'current',
      waitForToolResult: async () => ({
        turnId: 'turn-1',
        callId: 'call-1',
        ok: false,
        error: 'bridge failed'
      })
    }).find((item) => item.name === 'canvas_get')
    expect(tool).toBeTruthy()
    const result = await tool!.execute(
      'call-1',
      {} as never,
      undefined,
      undefined,
      undefined as never
    )
    expect(result.isError).toBe(true)
    expect(result.content[0]).toEqual({ type: 'text', text: 'bridge failed' })
  })

  it('uses the long timeout table for known long tasks', () => {
    expect(toolTimeoutMs('timeline_export')).toBe(
      LONG_TOOL_TIMEOUTS.timeline_export
    )
    expect(toolTimeoutMs('stage_export_preview')).toBe(
      LONG_TOOL_TIMEOUTS.stage_export_preview
    )
    expect(toolTimeoutMs('canvas_get')).toBe(TOOL_TIMEOUT_MS)
    expect(toolTimeoutMs(undefined)).toBe(TOOL_TIMEOUT_MS)
  })
})
