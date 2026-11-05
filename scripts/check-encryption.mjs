import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'

const strict = process.argv.includes('--strict')
const tscScript = 'node_modules/typescript/lib/tsc.js'
const projects = ['tsconfig.node.json', 'tsconfig.web.json']

function runTsc(project) {
  const result = spawnSync(process.execPath, [tscScript, '--noEmit', '-p', project], {
    cwd: process.cwd(),
    encoding: 'utf8',
    timeout: 180000
  })

  return `${result.stdout ?? ''}${result.stderr ?? ''}`
}

function encryptedFiles() {
  const files = new Set()

  for (const project of projects) {
    const output = runTsc(project)
    for (const line of output.split(/\r?\n/)) {
      const match = /^(.+?)\(\d+,\d+\): error TS1127: Invalid character/.exec(
        line.trim()
      )
      if (match) files.add(match[1])
    }
  }

  return [...files].sort()
}

function checkGitBlob(file) {
  const sources = [`HEAD:${file}`, `:${file}`]

  for (const source of sources) {
    const result = spawnSync('git', ['show', source], {
      cwd: process.cwd(),
      timeout: 10000
    })

    if (result.status !== 0) continue

    const data = result.stdout
    if (data.includes(0)) return 'binary'

    try {
      new TextDecoder('utf-8', { fatal: true }).decode(data)
      return 'plain'
    } catch {
      return 'binary'
    }
  }

  return 'missing'
}

if (!existsSync(tscScript)) {
  console.error(`[check-encryption] 找不到本地 TypeScript：${tscScript}`)
  process.exit(1)
}

const files = encryptedFiles()

if (files.length === 0) {
  console.log('[check-encryption] 未检测到加密导致的 TS7 读取错误')
  process.exit(0)
}

console.log(
  `[check-encryption] 检测到 ${files.length} 个本地文件被透明加密（TS7 原生编译器无法读取）：`
)
for (const file of files) {
  console.log(`- ${file}`)
}

const gitStatus = files.map((file) => ({ file, status: checkGitBlob(file) }))
const badGit = gitStatus.filter((item) => item.status === 'binary')
const missingGit = gitStatus.filter((item) => item.status === 'missing')

console.log('')
console.log(
  `[check-encryption] Git blob：${files.length - badGit.length - missingGit.length} 明文，${badGit.length} 密文，${missingGit.length} 未提交`
)

if (badGit.length > 0) {
  console.error('[check-encryption] 以下文件的 Git blob 是密文，禁止推送：')
  for (const item of badGit) console.error(`- ${item.file}`)
  process.exit(1)
}

if (missingGit.length > 0) {
  console.warn('[check-encryption] 以下文件尚未提交，请提交后重新检查 Git blob：')
  for (const item of missingGit) console.warn(`- ${item.file}`)
}

console.log('')
console.log('[check-encryption] 本地文件受加密软件影响，但 Git 内容为明文，可以正常推送。')
console.log('[check-encryption] 建议将项目目录或 node.exe / git.exe / tsgo.exe 加入加密软件白名单。')

if (strict) {
  process.exit(1)
}
