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
  'docs/agent-capabilities.md'
]

const HISTORICAL_DOCS = [
  'docs/archive/clip-studio-plan.md',
  'docs/archive/director-stage-plan.md',
  'docs/archive/promptbar-input-modes-plan.md',
  'docs/archive/model-config-v2-plan.md',
  'docs/archive/video-operations-plan.md',
  'docs/archive/engineering-quality-plan.md',
  'docs/archive/reference-audio-plan.md',
  'docs/archive/capability-consistency-plan.md',
  'docs/archive/node-output-target-plan.md',
  'docs/archive/update-mirror-plan.md',
  'docs/archive/node-toolbar-plan.md',
  'docs/archive/placeholder-operations-plan.md',
  'docs/archive/p3-refactor-plan.md',
  'docs/archive/bottom-toolbar-plan.md',
  'docs/archive/depth-capture-plan.md',
  'docs/archive/group-nodes.md',
  'docs/archive/models-config-unify-plan.md',
  'docs/archive/model-onboarding-plan.md',
  'docs/archive/derived-nodes-group-plan.md',
  'docs/archive/error-feedback-plan.md',
  'docs/archive/runtime-components-plan.md'
]

const CODE_MAP_DOCS = [
  'docs/code-map/README.md',
  'docs/code-map/00-overview.md',
  'docs/code-map/01-canvas.md',
  'docs/code-map/02-generation.md',
  'docs/code-map/03-clip-studio.md',
  'docs/code-map/04-director-stage.md',
  'docs/code-map/05-film-study.md',
  'docs/code-map/06-agent.md',
  'docs/code-map/07-storage-ipc.md',
  'docs/code-map/08-capabilities.md',
  'docs/code-map/09-dev-workflow.md',
  'docs/code-map/10-ui.md',
  'docs/code-map/11-feature-index.md',
  'docs/code-map/_generated.md'
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
  const toolsDir = 'src/main/agent/tools'
  const files = readdirSync(join(root, toolsDir)).filter((file) =>
    file.endsWith('.ts')
  )
  const names = files.flatMap((file) =>
    [...read(`${toolsDir}/${file}`).matchAll(/^    name: '([^']+)'/gm)].map(
      (match) => match[1]
    )
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

function checkCodeMap() {
  for (const file of CODE_MAP_DOCS) {
    if (!existsSync(join(root, file))) {
      errors.push(`缺少代码地图：${file}`)
    }
  }

  const capabilities = 'docs/code-map/08-capabilities.md'
  if (existsSync(join(root, capabilities))) {
    const text = read(capabilities)
    for (const heading of ['## 已实现', '## 部分实现', '## 仅文档']) {
      if (!text.includes(heading)) {
        errors.push(`${capabilities} 缺少「${heading}」分档`)
      }
    }
  }

  for (const file of CODE_MAP_DOCS.filter((item) => /\/0[1-7]-|\/10-/.test(item))) {
    if (!existsSync(join(root, file))) continue
    const text = read(file)
    for (const key of ['files', 'exports']) {
      if (!text.includes(`<!-- AUTO:${key}:start -->`)) {
        errors.push(`${file} 缺少 AUTO:${key} 区`)
      }
    }
  }

  const generated = 'docs/code-map/_generated.md'
  if (existsSync(join(root, generated))) {
    const text = read(generated)
    for (const heading of ['## 模块规模', '## IPC 接口', '## Agent 工具', '## 测试清单']) {
      if (!text.includes(heading)) {
        errors.push(`${generated} 缺少「${heading}」`)
      }
    }
  }

  const readme = 'docs/code-map/README.md'
  if (existsSync(join(root, readme))) {
    const text = read(readme)
    for (const heading of ['## 30 秒速览', '## 需求 → 模块', '## 阅读顺序']) {
      if (!text.includes(heading)) {
        errors.push(`${readme} 缺少「${heading}」`)
      }
    }
  }

  const workflow = 'docs/code-map/09-dev-workflow.md'
  if (existsSync(join(root, workflow))) {
    const text = read(workflow)
    if (!text.includes('## 1. 方案阶段')) {
      errors.push(`${workflow} 缺少「## 1. 方案阶段」`)
    }
  }

  const featureIndex = 'docs/code-map/11-feature-index.md'
  if (existsSync(join(root, featureIndex))) {
    const text = read(featureIndex)
    for (const heading of ['## 使用方式', '## 画布与节点', '## 维护规则']) {
      if (!text.includes(heading)) {
        errors.push(`${featureIndex} 缺少「${heading}」`)
      }
    }
  }
}

checkMeta()
checkHistoricalDocs()
checkLinks()
checkIndex()
checkPathRefs()
checkAgentTools()
checkCodeMap()

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
  `[check-docs] 通过：${CURRENT_DOCS.length} 份现行文档、${HISTORICAL_DOCS.length} 份历史文档、${CODE_MAP_DOCS.length} 份代码地图，路径、数字、链接、索引和 Agent 工具清单一致`
)
