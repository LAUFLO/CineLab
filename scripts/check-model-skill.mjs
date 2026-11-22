import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = process.cwd()
const skillPath = join(root, 'resources/model-config-skill/SKILL.md')
const AUTO_START = '<!-- AUTO:model-skill:start -->'
const AUTO_END = '<!-- AUTO:model-skill:end -->'

/**
 * 模型配置的契约面：这些文件一变，外部 Agent 使用的配置规则就可能过时。
 * 只收生产代码和现行文档，测试目录不参与指纹。
 */
const MODEL_PATHS = [
  'src/shared/model-modes.ts',
  'src/shared/model-contracts.ts',
  'src/shared/models-file.ts',
  'src/shared/capabilities.ts',
  'src/shared/provider-schema.ts',
  'src/shared/http-template.ts',
  'src/shared/protocol-templates.ts',
  'src/shared/operation-schema.ts',
  'src/main/settings/models-config.ts',
  'src/main/providers/http-template.ts',
  'src/main/local-adapters',
  'docs/models.md',
  'docs/local-adapters.md'
]

const FINGERPRINT_LINE = /^model-config-fingerprint:\s*(\S+)\s*$/m

function read(path) {
  return readFileSync(resolve(root, path), 'utf8').replace(/\r\n/g, '\n')
}

function collect(path) {
  const absolute = join(root, path)
  if (!existsSync(absolute)) return []
  if (statSync(absolute).isFile()) return [path]

  return readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === '__tests__') return []
    const child = `${path}/${entry.name}`
    return entry.isDirectory() ? collect(child) : [child]
  })
}

function fingerprint() {
  const files = [...new Set(MODEL_PATHS.flatMap(collect))].sort()
  const hash = createHash('sha256')
  for (const path of files) {
    hash.update(`${path}\n${read(path)}\n`)
  }
  return `sha256:${hash.digest('hex')}`
}

function parseUnion(source, name) {
  const match = source.match(new RegExp(`export type ${name} =([\\s\\S]*?)\\n\\n`))
  if (!match) return []
  return [...match[1].matchAll(/'([^']+)'/g)].map((item) => item[1])
}

function parseModeDefinitions() {
  const source = read('src/shared/model-modes.ts')
  const pattern =
    /id: '([^']+)',\s*\n\s*label: '([^']+)',\s*\n\s*description: '([^']+)',\s*\n\s*output: '([^']+)'/g

  return [...source.matchAll(pattern)].map((match) => ({
    id: match[1],
    label: match[2],
    description: match[3],
    output: match[4]
  }))
}

function parseProtocolTemplates() {
  const source = read('src/shared/protocol-templates.ts')
  return [...source.matchAll(/^    id: '([a-z0-9-]+)'/gm)].map((match) => match[1])
}

function parseContracts() {
  const source = read('src/shared/model-contracts.ts')
  const map = source.match(
    /export const OFFICIAL_CONTRACTS: Record<string, ModelContract> = \{([\s\S]*?)\n\}/
  )
  const adapters = map
    ? [...map[1].matchAll(/'([^']+)':/g)].map((match) => match[1])
    : []

  const modesByAdapter = new Map()
  for (const match of source.matchAll(
    /export const \w+_CONTRACT: ModelContract = \{([\s\S]*?)\n\}/g
  )) {
    const body = match[1]
    const adapter = body.match(/adapter: '([^']+)'/)?.[1]
    if (!adapter) continue
    const modes = body.match(/modes: \[([\s\S]*?)\]/)
    modesByAdapter.set(
      adapter,
      modes ? [...modes[1].matchAll(/'([^']+)'/g)].map((item) => item[1]) : []
    )
  }

  return adapters.map((adapter) => ({
    adapter,
    modes: modesByAdapter.get(adapter) ?? []
  }))
}

function generateAutoBlock() {
  const providerSource = read('src/shared/provider-schema.ts')
  const modes = parseModeDefinitions()
  const features = parseUnion(providerSource, 'ModelFeature')
  const capabilities = parseUnion(providerSource, 'Capability')
  const templates = parseProtocolTemplates()
  const contracts = parseContracts()

  if (modes.length < 5) throw new Error('无法从 model-modes.ts 解析模式定义')
  if (features.length < 5) throw new Error('无法从 provider-schema.ts 解析 features')
  if (capabilities.length < 5) throw new Error('无法从 provider-schema.ts 解析 capability')
  if (templates.length < 5) throw new Error('无法从 protocol-templates.ts 解析模板 ID')
  if (contracts.length < 5) throw new Error('无法从 model-contracts.ts 解析官方契约')

  const lines = [
    AUTO_START,
    '> 本节由 `corepack pnpm map:skill` 从代码生成，请勿手改。',
    '',
    '### 模式',
    '',
    '| ID | 名称 | 输出 |',
    '|---|---|---|',
    ...modes.map((mode) => `| \`${mode.id}\` | ${mode.label} | \`${mode.output}\` |`),
    '',
    `**features（${features.length}）**：${features.map((value) => `\`${value}\``).join('、')}`,
    '',
    `**capability（${capabilities.length}）**：${capabilities
      .map((value) => `\`${value}\``)
      .join('、')}`,
    '',
    `**协议模板（${templates.length}）**：${templates
      .map((value) => `\`${value}\``)
      .join('、')}`,
    '',
    '### 官方契约',
    '',
    '| adapter | 模式 |',
    '|---|---|',
    ...contracts.map(
      (contract) =>
        `| \`${contract.adapter}\` | ${contract.modes
          .map((mode) => `\`${mode}\``)
          .join('、')} |`
    ),
    AUTO_END
  ]

  return {
    block: lines.join('\n'),
    stats: {
      modes: modes.length,
      features: features.length,
      capabilities: capabilities.length,
      templates: templates.length,
      contracts: contracts.length
    }
  }
}

function extractAutoBlock(skill) {
  const start = skill.indexOf(AUTO_START)
  const end = skill.indexOf(AUTO_END)
  if (start < 0 || end < 0 || end < start) return null
  return skill.slice(start, end + AUTO_END.length)
}

function replaceAutoBlock(skill, block) {
  const start = skill.indexOf(AUTO_START)
  const end = skill.indexOf(AUTO_END)
  if (start < 0 || end < 0 || end < start) return null
  return skill.slice(0, start) + block + skill.slice(end + AUTO_END.length)
}

function insertFingerprint(skill, value) {
  if (FINGERPRINT_LINE.test(skill)) {
    return skill.replace(FINGERPRINT_LINE, `model-config-fingerprint: ${value}`)
  }

  const withVersion = skill.replace(
    /^version:\s*.*$/m,
    (line) => `${line}\nmodel-config-fingerprint: ${value}`
  )
  if (withVersion !== skill) return withVersion

  return skill.replace(/^---\s*$/m, (line) => `${line}\nmodel-config-fingerprint: ${value}`)
}

const current = fingerprint()
const stored = read(skillPath).match(FINGERPRINT_LINE)?.[1] ?? null
const update = process.argv.includes('--update')

let generated
try {
  generated = generateAutoBlock()
} catch (error) {
  console.error(`[check-model-skill] 生成自动枚举失败：${error.message}`)
  process.exit(1)
}

const skill = read(skillPath)
const existingAuto = extractAutoBlock(skill)
if (!existingAuto) {
  console.error(
    `[check-model-skill] 失败：SKILL.md 缺少自动枚举标记 ${AUTO_START} / ${AUTO_END}`
  )
  process.exit(1)
}

if (update) {
  const withAuto = replaceAutoBlock(skill, generated.block)
  if (!withAuto) {
    console.error('[check-model-skill] 失败：无法替换自动枚举区块')
    process.exit(1)
  }
  writeFileSync(skillPath, insertFingerprint(withAuto, current), 'utf8')
  console.log(
    `[check-model-skill] 已刷新自动枚举：${generated.stats.modes} 模式 / ${generated.stats.features} features / ${generated.stats.capabilities} capability / ${generated.stats.templates} 模板 / ${generated.stats.contracts} 契约`
  )
  console.log(`[check-model-skill] 已刷新指纹：${current}`)
  process.exit(0)
}

if (existingAuto !== generated.block) {
  console.error('[check-model-skill] 失败：自动枚举与代码不一致。')
  console.error('  请运行 corepack pnpm map:skill，并检查人工维护的流程/示例是否需要同步。')
  process.exit(1)
}

if (stored !== current) {
  console.error('[check-model-skill] 失败：模型配置相关文件已变化，但 SKILL.md 指纹未同步。')
  console.error(`  当前代码指纹：${current}`)
  console.error(`  SKILL.md 指纹：${stored ?? '缺失'}`)
  console.error('  请更新人工维护区（http-template 变量、示例、流程），再运行 corepack pnpm map:skill。')
  process.exit(1)
}

console.log(
  `[check-model-skill] 通过：自动枚举与指纹同步（${generated.stats.modes} 模式 / ${generated.stats.features} features / ${generated.stats.templates} 模板 / ${generated.stats.contracts} 契约）`
)
