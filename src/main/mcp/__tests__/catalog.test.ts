import { describe, expect, it } from 'vitest'
import { AGENT_TOOLS } from '../../agent/tools'
import { buildMcpTools, MCP_TOOL_CATALOG } from '../auto-tools'

const tools = buildMcpTools()

describe('mcp tool catalog', () => {
  it('has mcp metadata for every agent tool', () => {
    const missing = AGENT_TOOLS.filter((tool) => !tool.mcp).map(
      (tool) => tool.name
    )
    expect(missing).toEqual([])
  })

  it('has a title for every exposed tool', () => {
    const missing = AGENT_TOOLS.filter(
      (tool) => tool.mcp?.expose !== false && !tool.mcp?.title
    ).map((tool) => tool.name)
    expect(missing).toEqual([])
  })

  it('keeps tool names unique', () => {
    const names = tools.map((tool) => tool.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('matches the catalog', () => {
    expect(MCP_TOOL_CATALOG.map((tool) => tool.name).sort()).toEqual(
      tools.map((tool) => tool.name).sort()
    )
  })

  it('has a chinese title for every tool', () => {
    const invalid = tools
      .filter((tool) => !/[\u4e00-\u9fa5]/.test(tool.title))
      .map((tool) => tool.name)
    expect(invalid).toEqual([])
  })

  it('marks confirm for every write tool except adapter reload', () => {
    const missing = tools
      .filter(
        (tool) =>
          !tool.readOnly &&
          !tool.confirm &&
          tool.name !== 'local_adapter_reload'
      )
      .map((tool) => tool.name)
    expect(missing).toEqual([])
  })

  it('uses object json schema for every tool', () => {
    const invalid = tools
      .filter(
        (tool) =>
          !tool.inputSchema ||
          typeof tool.inputSchema !== 'object' ||
          tool.inputSchema.type !== 'object'
      )
      .map((tool) => tool.name)
    expect(invalid).toEqual([])
  })

  it('does not expose generation_propose', () => {
    expect(tools.some((tool) => tool.name === 'generation_propose')).toBe(false)
  })

  it('exposes the expected number of tools', () => {
    expect(tools).toHaveLength(83)
  })
})
