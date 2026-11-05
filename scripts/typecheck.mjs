import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'

const isWindows = process.platform === 'win32'
const localTsc = isWindows ? 'node_modules\\.bin\\tsc.cmd' : 'node_modules/.bin/tsc'
const fallbackVersion = 'typescript@5.9.3'
const projects = ['tsconfig.node.json', 'tsconfig.web.json']

function run(command, args) {
  return spawnSync(command, args, { encoding: 'utf8', shell: true })
}

function print(result) {
  if (result.stdout) process.stdout.write(result.stdout)
  if (result.stderr) process.stderr.write(result.stderr)
}

function runLocal(project) {
  return run(localTsc, ['--noEmit', '-p', project])
}

function runFallback(project) {
  return run('npx', ['-y', '-p', fallbackVersion, 'tsc', '--noEmit', '-p', project])
}

function runAll(runner) {
  let failed = false
  for (const project of projects) {
    const result = runner(project)
    print(result)
    if (result.status !== 0) failed = true
  }
  return failed
}

if (!existsSync(isWindows ? 'node_modules\\.bin\\tsc.cmd' : 'node_modules/.bin/tsc')) {
  console.log('[typecheck] local tsc not found, using TypeScript 5.9')
  process.exit(runAll(runFallback) ? 1 : 0)
}

// 先跑第一个项目：若输出出现 Invalid character，说明源文件被加密，本地 TS 7 读不了
const probe = runLocal(projects[0])
const probeOutput = `${probe.stdout ?? ''}${probe.stderr ?? ''}`

if (probeOutput.includes('Invalid character')) {
  console.log('[typecheck] encrypted sources detected, using TypeScript 5.9 via npx')
  process.exit(runAll(runFallback) ? 1 : 0)
}

console.log('[typecheck] using local TypeScript 7')
process.stdout.write(probeOutput)

let failed = probe.status !== 0
const second = runLocal(projects[1])
print(second)
if (second.status !== 0) failed = true

process.exit(failed ? 1 : 0)
