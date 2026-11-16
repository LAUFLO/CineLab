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

const bullets = sectionFor(version)
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => line.startsWith('- '))
  .slice(0, 12)

const releaseUrl = `https://github.com/LAUFLO/CineLab/releases/tag/v${version}`
const exe = `CineLab-${version}-x64.exe`
const dmg = `CineLab-${version}-arm64.dmg`

const elements = [
  {
    tag: 'markdown',
    content: `**版本**：v${version}\n**Tag**：[v${version}](${releaseUrl})`
  },
  { tag: 'hr' },
  {
    tag: 'markdown',
    content: `**下载**\n- Windows x64：\`${exe}\`\n- macOS arm64：\`${dmg}\``
  }
]

if (bullets.length > 0) {
  elements.push(
    { tag: 'hr' },
    {
      tag: 'collapsible_panel',
      expanded: false,
      header: {
        title: { tag: 'markdown', content: `**展开全部变更（${bullets.length} 项）**` },
        vertical_align: 'center'
      },
      elements: [{ tag: 'markdown', content: bullets.join('\n') }]
    }
  )
}

elements.push(
  { tag: 'hr' },
  {
    tag: 'markdown',
    content:
      '<font color="grey">校验和见 SHA256SUMS.txt ｜ 安装包未签名：Windows 会提示 SmartScreen，macOS 需手动放行 Gatekeeper</font>'
  },
  {
    tag: 'button',
    text: { tag: 'plain_text', content: '查看 Release' },
    type: 'primary',
    behaviors: [{ type: 'open_url', default_url: releaseUrl }]
  }
)

const payload = {
  msg_type: 'interactive',
  card: {
    schema: '2.0',
    config: { update_multi: true },
    header: {
      template: 'blue',
      title: { tag: 'plain_text', content: `CineLab v${version} 已发布` }
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
