import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream, existsSync } from 'node:fs'
import { cp, mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const WHISPER_VERSION = 'v1.7.6'
const RUNTIME_VERSION = 1
const PLATFORM = 'darwin-arm64'

const repo = resolve(import.meta.dirname, '..')
const outputDir = resolve(process.argv[2] ?? join(repo, 'build/components'))
const build = resolve(
  process.argv[3] ?? join(process.env.TMPDIR ?? '/tmp', 'cinelab-whisper-macos')
)
const source = join(build, 'whisper.cpp')
const runtime = join(build, 'runtime')

function run(command, args, options = {}) {
  console.log('>', command, args.join(' '))
  return execFileSync(command, args, { stdio: 'inherit', ...options })
}

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) files.push(...(await walk(path)))
    else if (entry.isFile()) files.push(path)
  }
  return files
}

async function sha256(file) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(file)) hash.update(chunk)
  return hash.digest('hex')
}

async function main() {
  await mkdir(outputDir, { recursive: true })
  await mkdir(build, { recursive: true })

  if (!existsSync(join(source, '.git'))) {
    run('git', [
      'clone',
      '--depth',
      '1',
      '--branch',
      WHISPER_VERSION,
      'https://github.com/ggml-org/whisper.cpp.git',
      source
    ])
  }

  const cmakeBuild = join(source, 'build')
  run('cmake', [
    '-S',
    source,
    '-B',
    cmakeBuild,
    '-DCMAKE_BUILD_TYPE=Release',
    '-DBUILD_SHARED_LIBS=OFF',
    '-DWHISPER_BUILD_TESTS=OFF',
    '-DWHISPER_BUILD_EXAMPLES=ON'
  ])
  run('cmake', ['--build', cmakeBuild, '--config', 'Release', '--parallel', '4'])

  const binary = join(cmakeBuild, 'bin', 'whisper-cli')
  if (!existsSync(binary)) throw new Error(`whisper-cli not found: ${binary}`)

  const linked = execFileSync('otool', ['-L', binary], { encoding: 'utf8' })
  console.log('otool -L:', linked.trim())

  await rm(runtime, { recursive: true, force: true })
  await mkdir(join(runtime, 'Release'), { recursive: true })
  await cp(binary, join(runtime, 'Release', 'whisper-cli'))
  run('chmod', ['+x', join(runtime, 'Release', 'whisper-cli')])
  await cp(join(source, 'LICENSE'), join(runtime, 'LICENSE'))

  const zipName = `whisper-runtime-${PLATFORM}-v${RUNTIME_VERSION}.zip`
  const zipPath = join(outputDir, zipName)
  await rm(zipPath, { force: true })
  run('zip', ['-r', '-q', zipPath, '.'], { cwd: runtime })

  const files = await walk(runtime)
  let expandedSize = 0
  for (const file of files) expandedSize += (await stat(file)).size

  const size = (await stat(zipPath)).size
  const hash = await sha256(zipPath)
  const downloadBase = (
    process.env.WHISPER_DOWNLOAD_BASE ??
    process.env.DEPTH_DOWNLOAD_BASE ??
    'http://127.0.0.1:8899'
  ).replace(/\/$/, '')

  const manifest = {
    version: RUNTIME_VERSION,
    kind: 'whisper-runtime',
    platform: PLATFORM,
    size,
    expandedSize,
    sha256: hash,
    urls: [`${downloadBase}/${zipName}`],
    files: files.length
  }
  const manifestPath = join(
    outputDir,
    `whisper-runtime-manifest-${PLATFORM}.json`
  )
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8')

  console.log('WHISPER_RUNTIME_READY')
  console.log(`zip=${zipPath}`)
  console.log(`manifest=${manifestPath}`)
  console.log(`sha256=${hash}`)
  console.log(`size=${size}`)
  console.log(`expandedSize=${expandedSize}`)
  console.log(`files=${files.length}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
