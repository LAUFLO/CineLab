import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MCP_TOOL_CATALOG } from '../catalog'

const REGISTRATION_FILES = ['tools.ts', 'app-tools.ts', 'write-tools.ts']

function registeredToolNames(): string[] {
  const dir = join(process.cwd(), 'src/main/mcp')
  return REGISTRATION_FILES.flatMap((file) => {
    const source = readFileSync(join(dir, file), 'utf8')
    return [...source.matchAll(/registerTool\(\s*'([^']+)'/g)].map(
      (match) => match[1]
    )
  })
}

describe('mcp tool catalog', () => {
  it('matches the registered tools', () => {
    expect(MCP_TOOL_CATALOG.map((tool) => tool.name).sort()).toEqual(
      registeredToolNames().sort()
    )
  })

  it('has unique tool names', () => {
    const names = MCP_TOOL_CATALOG.map((tool) => tool.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('marks confirm for every project write tool', () => {
    const missing = MCP_TOOL_CATALOG.filter(
      (tool) =>
        !tool.readOnly && !tool.confirm && tool.name !== 'local_adapter_reload'
    )
    expect(missing).toEqual([])
  })
})
