import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const errors = []

function read(path) {
  return readFileSync(join(root, path), 'utf8').replace(/\r\n/g, '\n')
}

function findMatchingBrace(text, openIndex) {
  let depth = 0
  for (let index = openIndex; index < text.length; index += 1) {
    const char = text[index]
    if (char === '{') depth += 1
    else if (char === '}') {
      depth -= 1
      if (depth === 0) return index
    }
  }
  return -1
}

function extractTools() {
  const groups = [
    'canvas',
    'generation',
    'stage',
    'timeline',
    'film',
    'capability',
    'skills',
    'library',
    'media',
    'skill-admin',
    'project'
  ]
  const tools = []

  for (const group of groups) {
    const source = read(`src/main/agent/tools/${group}.ts`)
    for (const block of source.split('\n  {\n')) {
      const name = /^    name: '([a-z0-9_]+)'/m.exec(block)
      if (!name) continue
      const mcpStart = block.indexOf('mcp: {')
      const mcpEnd = mcpStart >= 0 ? block.indexOf('}', mcpStart) : -1
      const mcpText =
        mcpStart >= 0 && mcpEnd >= 0
          ? block.slice(mcpStart, mcpEnd + 1)
          : ''
      const title = /title: '([^']+)'/.exec(mcpText)
      tools.push({
        name: name[1],
        group,
        main: /^    executor: 'main'/m.test(block),
        hasMcp: mcpStart >= 0,
        title: title?.[1],
        expose: !/expose: false/.test(mcpText),
        destructive: /destructive: true/.test(mcpText)
      })
    }
  }

  return tools
}

function extractHandlers(file, objectName) {
  const source = read(file)
  const start = source.indexOf(`const ${objectName}`)
  if (start < 0) return []
  const objectStart = source.indexOf('= {', start)
  if (objectStart < 0) return []
  const brace = objectStart + 2
  const end = findMatchingBrace(source, brace)
  if (end < 0) return []
  const body = source.slice(brace + 1, end)
  return [...body.matchAll(/^\s+([a-z0-9_]+): async \((?:call)?\) =>/gm)].map(
    (match) => match[1]
  )
}

function extractMcpOnlyTools() {
  const source = read('src/renderer/src/mcp/commandBridge.ts')
  return [...source.matchAll(/command\.tool === '([a-z0-9_]+)'/g)].map(
    (match) => match[1]
  )
}

function readExemptions() {
  const path = 'agent-coverage-exempt.json'
  if (!existsSync(join(root, path))) return []
  try {
    const parsed = JSON.parse(read(path))
    return Array.isArray(parsed.exempt) ? parsed.exempt : []
  } catch {
    errors.push(`${path} 不是合法 JSON`)
    return []
  }
}

const tools = extractTools()
const toolNames = new Set()

for (const tool of tools) {
  if (toolNames.has(tool.name)) {
    errors.push(`工具名重复：${tool.name}`)
  }
  toolNames.add(tool.name)

  if (!tool.hasMcp) {
    errors.push(`缺少 mcp 元数据：${tool.name}`)
  }
  if (tool.hasMcp && tool.expose && !tool.title) {
    errors.push(`缺少中文标题：${tool.name}`)
  }
  if (/(?:delete|remove)/.test(tool.name) && !tool.destructive) {
    errors.push(`删除类工具缺少 destructive：${tool.name}`)
  }
}

const bridgeHandlers = new Set([
  ...extractHandlers(
    'src/renderer/src/agent/canvasBridge.ts',
    'canvasHandlers'
  ),
  ...extractHandlers(
    'src/renderer/src/agent/timelineBridge.ts',
    'handlers'
  ),
  ...extractHandlers('src/renderer/src/agent/stageBridge.ts', 'handlers'),
  ...extractHandlers('src/renderer/src/agent/filmBridge.ts', 'handlers'),
  ...extractHandlers('src/renderer/src/agent/projectBridge.ts', 'handlers')
])

const mcpOnly = new Set(extractMcpOnlyTools())
const handlers = new Set([...bridgeHandlers, ...mcpOnly])

function readAsyncHandlers() {
  const path = 'handler-allowlist.json'
  if (!existsSync(join(root, path))) {
    errors.push(`${path} 不存在`)
    return []
  }
  try {
    const parsed = JSON.parse(read(path))
    return Array.isArray(parsed.asyncHandlers) ? parsed.asyncHandlers : []
  } catch {
    errors.push(`${path} 不是合法 JSON`)
    return []
  }
}

const asyncHandlers = readAsyncHandlers()
const timeoutSource = read('src/main/agent/pi/timeouts.ts')
const timeoutKeys = new Set(
  [...timeoutSource.matchAll(/^  ([a-z0-9_]+): [\d_ *]+/gm)].map(
    (match) => match[1]
  )
)

for (const item of asyncHandlers) {
  if (!item.tool || !toolNames.has(item.tool)) {
    errors.push(
      `异步 handler 白名单引用了不存在的工具：${item.tool ?? '未知'}`
    )
  }
  if (!item.reason) {
    errors.push(`异步 handler 白名单缺少 reason：${item.tool ?? '未知'}`)
  }
  if (item.tool && !timeoutKeys.has(item.tool)) {
    errors.push(`异步 handler 缺少长任务超时：${item.tool}`)
  }
}

const exemptions = readExemptions()
const now = Date.now()
const exempted = new Set()

for (const item of exemptions) {
  if (!item.reason) {
    errors.push(`豁免项缺少 reason：${item.tool ?? item.name ?? '未知'}`)
    continue
  }
  if (item.expiresAt && Date.parse(item.expiresAt) < now) {
    errors.push(`豁免已过期：${item.tool ?? item.name}`)
    continue
  }
  if (item.tool) exempted.add(item.tool)
}

const rendererTools = tools.filter((tool) => !tool.main)
const missingHandlers = rendererTools
  .filter((tool) => !handlers.has(tool.name) && !exempted.has(tool.name))
  .map((tool) => tool.name)

const orphanHandlers = [...handlers].filter(
  (name) =>
    !toolNames.has(name) && !mcpOnly.has(name) && !exempted.has(name)
)

for (const name of missingHandlers) {
  errors.push(`工具没有 handler：${name}`)
}
for (const name of orphanHandlers) {
  errors.push(`handler 没有对应工具：${name}`)
}

if (errors.length > 0) {
  console.error('[check-agent-coverage] 失败：')
  for (const error of errors) console.error(`- ${error}`)
  process.exit(1)
}

console.log(
  `[check-agent-coverage] 通过：${tools.length} 个工具（${rendererTools.length} 个 renderer，${tools.length - rendererTools.length} 个 main），${handlers.size} 个 handler`
)
