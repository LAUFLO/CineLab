import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { basename, dirname, join, relative, resolve } from 'node:path'

const root = process.cwd()
const errors = []

const CURRENT_DOCS = [
  'docs/README.md',
  'docs/architecture.md',
  'docs/ui-spec.md',
  'docs/models.md',
  'docs/roadmap-plan.md',
  'docs/branch-policy.md',
  'docs/agent-architecture-plan.md',
  'docs/agent-capabilities.md',
  'docs/agent-capability-plan.md',
  'docs/agent-generation-proposal-plan.md',
  'docs/agent-generation-operations-plan.md',
  'docs/agent-phase3-plan.md',
  'docs/node-operation-bridge-plan.md',
  'docs/agent-plan.md',
  'docs/clip-studio-plan.md',
  'docs/director-stage-plan.md',
  'docs/film-study-plan.md'
]

function read(path) {
  return readFileSync(join(root, path), 'utf8')
}

function walk(directory) {
  const absolute = join(root, directory)
  const entries = readdirSync(absolute, { withFileTypes: true })
  return entries.flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? walk(path) : [path]
  })
}

function stripFencedCode(text) {
  return text.replace(/```[\s\S]*?```/g, '')
}

function checkMeta() {
  for (const file of CURRENT_DOCS) {
    if (!existsSync(join(root, file))) {
      errors.push(`缺少现行文档：${file}`)
      continue
    }
    const text = read(file)
    if (!/^[ \t]*>?[ \t]*日期[:：]/m.test(text)) {
      errors.push(`${file} 缺少「日期：」头`)
    }
    if (!/^[ \t]*>?[ \t]*状态[:：]/m.test(text)) {
      errors.push(`${file} 缺少「状态：」头`)
    }
    if (!/^[ \t]*>?[ \t]*(适用版本|分支)[:：]/m.test(text)) {
      errors.push(`${file} 缺少「适用版本：」或「分支：」头`)
    }
  }
}

function checkLinks() {
  const files = [
    'README.md',
    ...walk('docs').filter((file) => file.endsWith('.md'))
  ]

  for (const file of files) {
    const text = stripFencedCode(read(file))
    const pattern = /\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g
    let match
    while ((match = pattern.exec(text))) {
      let target = match[1].trim()
      if (!target) continue
      if (/^(https?:|mailto:|tel:|#)/i.test(target)) continue
      if (target.startsWith('<') && target.endsWith('>')) {
        target = target.slice(1, -1)
      }
      target = target.split('#')[0]
      if (!target) continue
      const absolute = resolve(dirname(join(root, file)), target)
      if (!existsSync(absolute)) {
        errors.push(`${file} 链接不存在：${match[1]}`)
      }
    }
  }
}

function checkIndex() {
  const index = read('docs/README.md')
  const docs = walk('docs')
    .filter((file) => file.endsWith('.md'))
    .filter((file) => relative(root, join(root, file)) !== 'docs/README.md')

  for (const file of docs) {
    const name = basename(file)
    if (!index.includes(name)) {
      errors.push(`docs/README.md 未收录：docs/${name}`)
    }
  }

  if (!read('README.md').includes('docs/README.md')) {
    errors.push('README.md 没有链接到 docs/README.md')
  }
}

function checkAgentTools() {
  const source = read('src/main/agent/tools.ts')
  const names = [
    ...source.matchAll(/^    name: '([^']+)'/gm)
  ].map((match) => match[1])
  const doc = read('docs/agent-capabilities.md')
  const count = doc.match(/当前注册\s+(\d+)\s+个工具/)

  if (!count) {
    errors.push('docs/agent-capabilities.md 缺少「当前注册 N 个工具」')
    return
  }
  if (Number(count[1]) !== names.length) {
    errors.push(
      `工具数量漂移：代码 ${names.length} 个，文档写 ${count[1]} 个`
    )
  }

  for (const name of names) {
    if (!doc.includes(name)) {
      errors.push(`docs/agent-capabilities.md 缺少工具：${name}`)
    }
  }
}

checkMeta()
checkLinks()
checkIndex()
checkAgentTools()

if (errors.length > 0) {
  console.error('[check-docs] 文档检查失败：')
  for (const error of errors) console.error(`- ${error}`)
  process.exit(1)
}

console.log(
  `[check-docs] 通过：${CURRENT_DOCS.length} 份现行文档，链接、索引和 Agent 工具清单一致`
)
