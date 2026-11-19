/**
 * 区分静态 import 和动态 import，找出打包时真正会被 Node 立即加载的依赖。
 * 运行：node scripts/spike/static-imports.mjs
 */
import { readFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

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
  const staticExternals = new Set()
  const dynamicExternals = new Set()
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

    // static: import ... from 'x' / export ... from 'x' / import 'x'
    const staticRe = /^\s*(?:import|export)\b[^;]*?(?:from\s+)?['"]([^'"]+)['"]/gm
    let match
    while ((match = staticRe.exec(source))) {
      const line = match[0]
      if (line.includes('import(')) continue
      const spec = match[1]
      if (spec.startsWith('.')) {
        const next = resolveRelative(file, spec)
        if (next) queue.push(next)
      } else {
        staticExternals.add(spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0])
      }
    }

    // dynamic: import('x')
    const dynamicRe = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g
    while ((match = dynamicRe.exec(source))) {
      const spec = match[1]
      if (spec.startsWith('.')) {
        // 动态相对导入不作为静态图展开，只记录目标文件
        const next = resolveRelative(file, spec)
        if (next) dynamicExternals.add(next.replace(process.cwd(), '.'))
      } else {
        dynamicExternals.add(spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0])
      }
    }
  }
  return {
    files: seen.size,
    staticExternals: [...staticExternals].sort(),
    dynamicExternals: [...dynamicExternals].sort()
  }
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
    console.log(`\n## ${name}: missing`)
    continue
  }
  const result = analyze([entry])
  console.log(`\n## ${name} (${result.files} static files)`)
  console.log('static:', result.staticExternals.join(', '))
  console.log('dynamic:', result.dynamicExternals.join(', '))
}
