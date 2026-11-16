import { readFileSync } from 'node:fs'

const dryRun = process.argv.includes('--dry-run')
const webhook =
  process.env.CINELAB_FEISHU_WEBHOOK ?? process.env.FEISHU_WEBHOOK ?? ''

if (!webhook && !dryRun) {
  console.warn('[feishu] 未配置 CINELAB_FEISHU_WEBHOOK，跳过通知')
  process.exit(0)
}

const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
const version = pkg.version
const changelog = readFileSync('CHANGELOG.md', 'utf8')

function sectionFor(target) {
  const escaped = target.replace(/\./g, '\\.')
  const re = new RegExp(
    `## \\[${escaped}\\][^\\n]*\\n([\\s\\S]*?)(?=\\n## \\[|$)`
  )
  return changelog.match(re)?.[1]?.trim() ?? ''
}

const section = sectionFor(version)
const groups = []
let current = null
for (const line of section.split('\n')) {
  const heading = line.match(/^###\s+(.+)/)
  if (heading) {
    current = { title: heading[1].trim(), items: [] }
    groups.push(current)
    continue
  }
  if (current && line.trim().startsWith('- ')) {
    current.items.push(line.trim())
  }
}

if (groups.length === 0) {
  const items = section
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('- '))
  if (items.length > 0) groups.push({ title: '变更', items })
}

const ICON = { 新增: '✨', 变更: '🔧', 修复: '🐛', '已知限制': '⚠️' }
const releaseUrl = `https://github.com/LAUFLO/CineLab/releases/tag/v${version}`

const elements = [
  {
    tag: 'markdown',
    content: `**版本**：v${version} ｜ [Release](${releaseUrl})`
  }
]

for (const group of groups) {
  if (group.items.length === 0) continue
  const icon = ICON[group.title] ?? '•'
  const title = `**${icon} ${group.title} · ${group.items.length} 项**`

  elements.push(
    { tag: 'hr' },
    {
      tag: 'collapsible_panel',
      expanded: true,
      header: {
        title: { tag: 'markdown', content: title },
        vertical_align: 'center'
      },
      elements: [{ tag: 'markdown', content: group.items.join('\n') }]
    }
  )
}

elements.push(
  { tag: 'hr' },
  {
    tag: 'markdown',
    content:
      '<font color="grey">校验和见 SHA256SUMS.txt ｜ 未签名：Windows 提示 SmartScreen，macOS 需手动放行</font>'
  },
  {
    tag: 'column_set',
    flex_mode: 'none',
    columns: [
      {
        tag: 'column',
        width: 'auto',
        elements: [
          {
            tag: 'button',
            text: { tag: 'plain_text', content: '完整更新日志' },
            type: 'default',
            behaviors: [{ type: 'open_url', default_url: releaseUrl }]
          }
        ]
      },
      {
        tag: 'column',
        width: 'auto',
        elements: [
          {
            tag: 'button',
            text: { tag: 'plain_text', content: '下载安装包' },
            type: 'primary',
            behaviors: [{ type: 'open_url', default_url: releaseUrl }]
          }
        ]
      }
    ]
  }
)

const payload = {
  msg_type: 'interactive',
  card: {
    schema: '2.0',
    config: { update_multi: true },
    header: {
      template: 'blue',
      title: { tag: 'plain_text', content: `🚀 CineLab v${version}` }
    },
    body: { elements }
  }
}

if (dryRun) {
  console.log(JSON.stringify(payload, null, 2))
  process.exit(0)
}

const response = await fetch(webhook, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload)
})
const body = await response.text()

if (!response.ok || !/"code"\s*:\s*0/.test(body)) {
  console.error(`[feishu] 发送失败：${response.status} ${body}`)
  process.exit(1)
}

console.log(`[feishu] v${version} 通知已发送`)
