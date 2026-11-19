/**
 * 静态分析 pi 包的 import 图，找出实际会被加载的外部依赖。
 * 运行：node scripts/spike/import-graph.mjs
 */
import { readFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(process.cwd(), 'node_modules/@earendil-works')

function resolveRelative(fromFile, spec) {
  if (!spec.startsWith('.')) return null
  let target = resolve(dirname(fromFile), spec)
  if (!existsSync(target) && existsSync(`${target}.js`)) target = `${target}.js`
  if (!existsSync(target) && existsSync(`${target}/index.js`)) target = `${target}/index.js`
  return existsSync(target) ? target : null
}

function analyze(entries) {
  const seen = new Set()
  const externals = new Set()
  const queue = [...entries]
  while (queue.length) {
    const file = queue.pop()
    if (seen.has(file)) continue
    seen.add(file)
    let source
    try {
      source = readFileSync(file, 'utf8')
    } catch {
      continue
    }
    const re = /(?:import|export)[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)/g
    let match
    while ((match = re.exec(source))) {
      const spec = match[1] ?? match[2]
      if (!spec) continue
      if (spec.startsWith('.')) {
        const next = resolveRelative(file, spec)
        if (next) queue.push(next)
      } else {
        externals.add(spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0])
      }
    }
  }
  return { files: seen.size, externals: [...externals].sort() }
}

const targets = [
  ['root index', resolve(root, 'pi-coding-agent/dist/index.js')],
  ['core/sdk', resolve(root, 'pi-coding-agent/dist/core/sdk.js')],
  ['core/agent-session', resolve(root, 'pi-coding-agent/dist/core/agent-session.js')],
  ['pi-ai index', resolve(root, 'pi-ai/dist/index.js')],
  ['pi-ai compat', resolve(root, 'pi-ai/dist/compat.js')]
]

for (const [name, entry] of targets) {
  if (!existsSync(entry)) {
    console.log(`\n## ${name}: missing ${entry}`)
    continue
  }
  const { files, externals } = analyze([entry])
  console.log(`\n## ${name} (${files} files)`)
  console.log(externals.join(', '))
}
