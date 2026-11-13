import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { basename, dirname, join, relative, resolve } from 'node:path'

const root = process.cwd()
const errors = []
const warnings = []

const CURRENT_DOCS = [
  'docs/README.md',
  'docs/architecture.md',
  'docs/ui-spec.md',
  'docs/models.md',
  'docs/roadmap-plan.md',
  'docs/branch-policy.md',
  'docs/agent-architecture-plan.md',
  'docs/agent-capabilities.md'
]

const HISTORICAL_DOCS = [
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

const PATH_PATTERN = /`((?:src|docs|scripts|resources|\.github)\/[^`\s]+)`/g

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
    if (!/^[ \t]*>?[ \t]*日期[:：]\s*\d{4}-\d{2}-\d{2}\s*$/m.test(text)) {
      errors.push(`${file} 缺少有效的「日期：YYYY-MM-DD」头`)
    }
    if (!/^[ \t]*>?[ \t]*状态[:：]\s*现行\s*$/m.test(text)) {
      errors.push(`${file} 状态必须为「现行」`)
    }
    if (!/^[ \t]*>?[ \t]*适用版本[:：]\s*v\d+\.\d+\.\d+\s*$/m.test(text)) {
      errors.push(`${file} 适用版本必须为「vX.Y.Z」`)
    }

    const verified = text.match(
      /^[ \t]*>?[ \t]*最后核对[:：]\s*(\d{4}-\d{2}-\d{2})\s*$/m
    )
    if (!verified) {
      errors.push(`${file} 缺少「最后核对：YYYY-MM-DD」头`)
    } else {
      const age = (Date.now() - Date.parse(`${verified[1]}T00:00:00Z`)) / 86400000
      if (age > 30) warnings.push(`${file} 最后核对已超过 30 天`)
    }
  }
}

function checkHistoricalDocs() {
  for (const file of HISTORICAL_DOCS) {
    if (!existsSync(join(root, file))) {
      errors.push(`缺少历史文档：${file}`)
      continue
    }
    if (!/^[ \t]*>?[ \t]*状态[:：]\s*历史/m.test(read(file))) {
      errors.push(`${file} 必须标记为「状态：历史」`)
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

  const currentSection =
    index.split('## 1. 现行系统文档')[1]?.split('## 2.')[0] ?? ''

  if (!currentSection) {
    errors.push('docs/README.md 缺少「## 1. 现行系统文档」')
  }

  for (const file of CURRENT_DOCS) {
    const name = basename(file)
    if (!index.includes(name)) {
      errors.push(`docs/README.md 未收录：${file}`)
    }
    if (currentSection && !currentSection.includes(name)) {
      errors.push(`${file} 未列入「现行系统文档」表`)
    }
  }

  if (!read('README.md').includes('docs/README.md')) {
    errors.push('README.md 没有链接到 docs/README.md')
  }
}

function checkPathRefs() {
  for (const file of [...CURRENT_DOCS, 'README.md']) {
    if (!existsSync(join(root, file))) continue

    const text = stripFencedCode(read(file))
    let match
    while ((match = PATH_PATTERN.exec(text))) {
      const target = match[1].replace(/[.,;:)\]}]+$/g, '')
      if (/[*<>{}|]|\.\.\./.test(target)) continue
      if (!existsSync(join(root, target))) {
        errors.push(`${file} 引用的路径不存在：${target}`)
      }
    }
  }
}

function checkAgentTools() {
  const source = read('src/main/agent/tools.ts')
  const names = [...source.matchAll(/^    name: '([^']+)'/gm)].map(
    (match) => match[1]
  )
  const doc = read('docs/agent-capabilities.md')
  const count = doc.match(/当前注册\s+(\d+)\s+个工具/)

  if (!count) {
    errors.push('docs/agent-capabilities.md 缺少「当前注册 N 个工具」')
    return
  }
  if (Number(count[1]) !== names.length) {
    errors.push(`工具数量漂移：代码 ${names.length} 个，文档写 ${count[1]} 个`)
  }

  for (const name of names) {
    if (!doc.includes(name)) {
      errors.push(`docs/agent-capabilities.md 缺少工具：${name}`)
    }
  }
}

checkMeta()
checkHistoricalDocs()
checkLinks()
checkIndex()
checkPathRefs()
checkAgentTools()

if (warnings.length > 0) {
  console.warn('[check-docs] 警告：')
  for (const warning of warnings) console.warn(`- ${warning}`)
}

if (errors.length > 0) {
  console.error('[check-docs] 文档检查失败：')
  for (const error of errors) console.error(`- ${error}`)
  process.exit(1)
}

console.log(
  `[check-docs] 通过：${CURRENT_DOCS.length} 份现行文档、${HISTORICAL_DOCS.length} 份历史文档，路径、数字、链接、索引和 Agent 工具清单一致`
)
