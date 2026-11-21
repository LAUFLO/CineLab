import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const check = process.argv.includes('--check')
const audit = process.argv.includes('--audit')
const errors = []
const SOURCE_RE = /\.(ts|tsx)$/

const MODULES = [
  {
    id: '01',
    name: '画布',
    file: 'docs/code-map/01-canvas.md',
    dirs: ['src/renderer/src/canvas', 'src/renderer/src/stores/canvas'],
    files: [
      'src/renderer/src/stores/canvas.ts',
      'src/renderer/src/stores/canvas-model.ts',
      'src/renderer/src/stores/edge-references.ts',
      'src/renderer/src/stores/toolbar.ts',
      'src/shared/canvas-commands.ts',
      'src/shared/canvas-schema.ts',
      'src/shared/node-operation-specs.ts',
      'src/shared/operation-schema.ts',
      'src/shared/components.ts'
    ]
  },
  {
    id: '02',
    name: '生成与模型',
    file: 'docs/code-map/02-generation.md',
    dirs: ['src/main/providers', 'src/main/engine', 'src/main/media', 'src/main/assets'],
    files: [
      'src/renderer/src/stores/generation.ts',
      'src/renderer/src/stores/generation-history.ts',
      'src/renderer/src/stores/vision-tasks.ts',
      'src/shared/provider-schema.ts',
      'src/shared/provider-presets.ts',
      'src/shared/generation.ts',
      'src/shared/model-modes.ts',
      'src/shared/param-presets.ts',
      'src/shared/param-constraints.ts',
      'src/shared/filters.ts',
      'src/shared/reference-inputs.ts',
      'src/shared/media.ts',
      'src/shared/protocol-templates.ts',
      'src/shared/http-template.ts',
      'src/shared/model-contracts.ts'
    ]
  },
  {
    id: '03',
    name: '剪辑室',
    file: 'docs/code-map/03-clip-studio.md',
    dirs: ['src/main/timeline', 'src/renderer/src/studio'],
    files: [
      'src/renderer/src/stores/timeline.ts',
      'src/renderer/src/stores/studio.ts',
      'src/shared/timeline-commands.ts',
      'src/shared/timeline-edit.ts',
      'src/shared/timeline-history.ts',
      'src/shared/timeline-keyframes.ts',
      'src/shared/timeline-layout.ts',
      'src/shared/timeline-schema.ts',
      'src/shared/timeline-snap.ts',
      'src/shared/timeline-tools.ts',
      'src/shared/timeline-transition.ts',
      'src/shared/subtitles.ts',
      'src/shared/subtitle-presets.ts',
      'src/shared/audio-fx.ts',
      'src/shared/sound-schema.ts'
    ]
  },
  {
    id: '04',
    name: '导演台与白模预演',
    file: 'docs/code-map/04-director-stage.md',
    dirs: ['src/main/stage', 'src/main/scene', 'src/renderer/src/stage', 'src/shared/previs'],
    files: [
      'src/shared/stage-schema.ts',
      'src/shared/stage-commands.ts',
      'src/shared/stage-preview.ts',
      'src/shared/stage-shot-intent.ts',
      'src/shared/stage-timeline.ts',
      'src/shared/stage-program.ts',
      'src/shared/stage-lighting.ts',
      'src/shared/stage-motions.ts',
      'src/shared/stage-auto-coverage.ts',
      'src/shared/stage-dialogue.ts',
      'src/shared/stage-shot-list.ts',
      'src/shared/scene-analyze.ts',
      'src/shared/scene-calibrate.ts',
      'src/shared/scene-draft.ts',
      'src/shared/scene-object-presets.ts'
    ]
  },
  {
    id: '05',
    name: '逐帧拉片',
    file: 'docs/code-map/05-film-study.md',
    dirs: ['src/main/film-study'],
    files: [
      'src/shared/film-study.ts',
      'src/shared/film-study-v2.ts',
      'src/renderer/src/stores/film-study.ts'
    ]
  },
  {
    id: '06',
    name: 'CineBot 与 Agent',
    file: 'docs/code-map/06-agent.md',
    dirs: ['src/main/agent', 'src/renderer/src/agent'],
    files: [
      'src/shared/agent.ts',
      'src/shared/agent-proposal.ts',
      'src/shared/agent-tools.ts',
      'src/shared/capabilities.ts',
      'src/shared/skills.ts'
    ]
  },
  {
    id: '07',
    name: '存储、IPC 与安全',
    file: 'docs/code-map/07-storage-ipc.md',
    dirs: [
      'src/main/ipc',
      'src/main/project',
      'src/main/settings',
      'src/main/library',
      'src/main/export',
      'src/main/security',
      'src/main/update',
      'src/main/components',
      'src/main/types',
      'src/preload'
    ],
    files: [
      'src/main/index.ts',
      'src/main/window.ts',
      'src/main/menu.ts',
      'src/main/logger.ts',
      'src/main/protocol.ts',
      'src/renderer/src/stores/project.ts',
      'src/renderer/src/stores/settings.ts',
      'src/renderer/src/stores/update.ts',
      'src/renderer/src/stores/preferences.ts',
      'src/renderer/src/stores/library.ts',
      'src/renderer/src/stores/depth-tasks.ts',
      'src/shared/ipc-contract.ts',
      'src/shared/project-schema.ts',
      'src/shared/project-templates.ts',
      'src/shared/preferences.ts',
      'src/shared/library-schema.ts',
      'src/shared/asset-schema.ts',
      'src/shared/models-file.ts',
      'src/shared/update.ts',
      'src/shared/template-vars.ts'
    ]
  },
  {
    id: '10',
    name: 'UI 组件与面板',
    file: 'docs/code-map/10-ui.md',
    dirs: [
      'src/renderer/src/components',
      'src/renderer/src/panels',
      'src/renderer/src/styles',
      'src/renderer/src/theme',
      'src/renderer/src/lib'
    ],
    files: [
      'src/renderer/src/App.tsx',
      'src/renderer/src/main.tsx',
      'src/renderer/src/env.d.ts',
      'src/renderer/src/stores/ui.ts'
    ]
  }
]

function normalize(path) {
  return path.replace(/\\/g, '/')
}

function walk(path) {
  const absolute = join(root, path)
  if (!existsSync(absolute)) return []
  const stat = statSync(absolute)
  if (stat.isFile()) return SOURCE_RE.test(path) ? [normalize(path)] : []
  return readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    const child = normalize(join(path, entry.name))
    if (entry.name === 'node_modules' || entry.name === 'dist') return []
    if (entry.name === '__tests__') return []
    return walk(child)
  })
}

function linesOf(path) {
  return readFileSync(join(root, path), 'utf8').split(/\r?\n/).length
}

function moduleFiles(module) {
  const set = new Set()
  for (const dir of module.dirs ?? []) {
    for (const file of walk(dir)) set.add(file)
  }
  for (const file of module.files ?? []) {
    if (existsSync(join(root, file))) set.add(file)
  }
  return [...set].sort()
}

function exportsOf(path) {
  const text = readFileSync(join(root, path), 'utf8')
  const names = []
  const pattern =
    /^export\s+(?:async\s+)?(?:function|const|class|type|interface|enum)\s+([A-Za-z0-9_]+)/gm
  let match
  while ((match = pattern.exec(text))) names.push(match[1])
  return [...new Set(names)]
}

function replaceBlock(text, key, content) {
  const start = `<!-- AUTO:${key}:start -->`
  const end = `<!-- AUTO:${key}:end -->`
  const startIndex = text.indexOf(start)
  const endIndex = text.indexOf(end)
  if (startIndex < 0 || endIndex < 0 || endIndex < startIndex) {
    errors.push(`缺少 AUTO 区：${key}`)
    return text
  }
  return `${text.slice(0, startIndex + start.length)}\n${content}\n${text.slice(endIndex)}`
}

function buildFileTable(files) {
  if (!files.length) return '（无）'
  const rows = files.map((file) => `| \`${file}\` | ${linesOf(file)} |`)
  return ['| 文件 | 行数 |', '|---|---|', ...rows].join('\n')
}

function buildExportTable(files) {
  if (!files.length) return '（无）'
  const rows = []
  for (const file of files) {
    const names = exportsOf(file)
    if (!names.length) continue
    const shown = names.slice(0, 24)
    const suffix = names.length > shown.length ? ` …（共 ${names.length} 个）` : ''
    rows.push(`| \`${file}\` | ${shown.map((name) => `\`${name}\``).join('、')}${suffix} |`)
  }
  if (!rows.length) return '（无导出）'
  return ['| 文件 | 导出 |', '|---|---|', ...rows].join('\n')
}

function buildGenerated() {
  const scaleRows = MODULES.map((module) => {
    const files = moduleFiles(module)
    const lines = files.reduce((sum, file) => sum + linesOf(file), 0)
    const label = existsSync(join(root, module.file))
      ? `[${module.name}](./${module.file.split('/').pop()})`
      : `${module.name}（待创建）`
    return `| ${module.id} | ${label} | ${files.length} | ${lines} |`
  })

  const ipcPath = 'src/shared/ipc-contract.ts'
  const ipcRows = []
  if (existsSync(join(root, ipcPath))) {
    const text = readFileSync(join(root, ipcPath), 'utf8')
    const apiPattern = /export interface (\w+Api)\s*\{([\s\S]*?)\n\}/g
    let api
    while ((api = apiPattern.exec(text))) {
      const methods = [...api[2].matchAll(/^\s{2}(\w+)\(/gm)].map((m) => m[1])
      if (methods.length) ipcRows.push(`| \`${api[1]}\` | ${methods.map((m) => `\`${m}\``).join('、')} |`)
    }
  }

  const toolsDir = 'src/main/agent/tools'
  const toolRows = []
  if (existsSync(join(root, toolsDir))) {
    for (const file of readdirSync(join(root, toolsDir))
      .filter((name) => name.endsWith('.ts'))
      .sort()) {
      const text = readFileSync(join(root, toolsDir, file), 'utf8')
      const pattern = /id: '([^']+)',\s*\n\s*name: '([^']+)'/g
      let match
      while ((match = pattern.exec(text))) {
        const block = text.slice(match.index, match.index + 900)
        toolRows.push(
          `| \`${match[2]}\` | \`${match[1]}\` | ${block.includes('requiresConfirm: true') ? '是' : ''} | ${block.includes('readOnly: true') ? '是' : ''} |`
        )
      }
    }
  }

  const nodeDir = 'src/renderer/src/canvas/nodes'
  const nodeRows = existsSync(join(root, nodeDir))
    ? readdirSync(join(root, nodeDir))
        .filter((name) => name.endsWith('.tsx'))
        .sort()
        .map((name) => `| \`${name}\` |`)
    : []

  const tests = []
  const collectTests = (dir) => {
    if (!existsSync(join(root, dir))) return
    for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue
      const child = normalize(join(dir, entry.name))
      if (entry.isDirectory()) collectTests(child)
      else if (/\.test\.(ts|tsx)$/.test(entry.name)) tests.push(child)
    }
  }
  collectTests('src')
  tests.sort()

  return `# 代码地图附录（自动生成）

> 由 \`scripts/gen-code-map.mjs\` 生成，不要手工修改。
> 更新：\`corepack pnpm map:code\`；校验：\`corepack pnpm check:code-map\`。

## 模块规模

| 编号 | 模块 | 文件 | 行数 |
|---|---|---|---|
${scaleRows.join('\n')}

> 只统计互斥归属的目录/文件；renderer 的节点组件统一归 01，其他模块在正文中引用。

## IPC 接口

| 接口 | 方法 |
|---|---|
${ipcRows.length ? ipcRows.join('\n') : '| （未解析到） | |'}

## Agent 工具

| 工具 | id | 需确认 | 只读 |
|---|---|---|---|
${toolRows.length ? toolRows.join('\n') : '| （未解析到） | | | |'}

## 节点组件

| 文件 |
|---|
${nodeRows.length ? nodeRows.join('\n') : '| （未解析到） |'}

## 测试清单

${tests.map((file) => `- \`${file}\``).join('\n')}
`
}

function updateModule(module, dryRun) {
  const path = join(root, module.file)
  if (!existsSync(path)) return false
  const files = moduleFiles(module)
  const original = readFileSync(path, 'utf8').replace(/\r\n/g, '\n')
  let text = replaceBlock(original, 'files', buildFileTable(files))
  text = replaceBlock(text, 'exports', buildExportTable(files))
  if (dryRun) {
    if (text !== original) {
      errors.push(`${module.file} 的 AUTO 区不是最新，请运行 map:code`)
    }
    return true
  }
  if (text !== original) writeFileSync(path, text, 'utf8')
  return true
}

function updateGenerated(dryRun) {
  const path = join(root, 'docs/code-map/_generated.md')
  const next = buildGenerated()
  if (dryRun) {
    if (!existsSync(path)) {
      errors.push('缺少 docs/code-map/_generated.md')
      return
    }
    const current = readFileSync(path, 'utf8').replace(/\r\n/g, '\n')
    if (current !== next) {
      errors.push('docs/code-map/_generated.md 不是最新，请运行 map:code')
    }
    return
  }
  writeFileSync(path, next, 'utf8')
}

function pathCovered(relativePath) {
  for (const module of MODULES) {
    for (const dir of module.dirs ?? []) {
      if (relativePath === dir || relativePath.startsWith(`${dir}/`)) return true
    }
    for (const file of module.files ?? []) {
      if (relativePath === file) return true
    }
  }
  return false
}

function auditCoverage() {
  const uncovered = []
  const scan = (directory) => {
    for (const entry of readdirSync(join(root, directory), {
      withFileTypes: true
    })) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue
      if (entry.name === '__tests__') continue
      const relativePath = normalize(join(directory, entry.name))
      if (entry.isDirectory()) scan(relativePath)
      else if (/\.(ts|tsx|css)$/.test(entry.name) && !pathCovered(relativePath)) {
        uncovered.push(relativePath)
      }
    }
  }
  scan('src')
  if (uncovered.length) {
    errors.push(
      `未归属文件（请登记到 scripts/gen-code-map.mjs 的 MODULES）：\n${uncovered
        .map((file) => `  - ${file}`)
        .join('\n')}`
    )
  }
}

let touched = 0
if (!audit || check) {
  for (const module of MODULES) if (updateModule(module, check)) touched += 1
  updateGenerated(check)
}
if (check || audit) auditCoverage()

if (errors.length) {
  console.error('[code-map] 检查失败：')
  for (const error of errors) console.error(`- ${error}`)
  process.exit(1)
}

console.log(
  check
    ? `[code-map] 通过：${touched} 个模块地图与代码一致，文件覆盖完整`
    : audit
      ? `[code-map] 覆盖通过：src 下所有文件都已归属`
      : `[code-map] 已更新：${touched} 个模块地图（其余待创建）`
)
