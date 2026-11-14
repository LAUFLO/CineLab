import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream, existsSync } from 'node:fs'
import { cp, mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

const PYTHON_VERSION = '3.11.18'
const PYTHON_RELEASE = '20261110'
const TORCH_VERSION = '2.8.0'
const NUMPY_VERSION = '2.1.3'
const OPENCV_VERSION = '4.10.0.84'
const VDA_REF = '4f5ae23172ba60fd7bc11ef671cca678842c7072'
const RUNTIME_VERSION = 1
const PLATFORM = 'darwin-arm64'
const PYTHON_TAG = '3.11'

const repo = resolve(import.meta.dirname, '..')
const outputDir = resolve(process.argv[2] ?? join(repo, 'build/components'))
const build = resolve(
  process.argv[3] ?? join(process.env.TMPDIR ?? '/tmp', 'cinelab-depth-macos')
)
const runtime = join(build, 'runtime')
const pythonDir = join(runtime, 'python')
const site = join(pythonDir, 'lib', `python${PYTHON_TAG}`, 'site-packages')

function run(command, args, options = {}) {
  console.log('>', command, args.join(' '))
  execFileSync(command, args, { stdio: 'inherit', ...options })
}

async function download(url, destination) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`)
  await pipeline(Readable.fromWeb(response.body), createWriteStream(destination))
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
  await rm(runtime, { recursive: true, force: true })
  await mkdir(runtime, { recursive: true })

  const archive = join(
    build,
    `cpython-${PYTHON_VERSION}+${PYTHON_RELEASE}-aarch64-apple-darwin-install_only.tar.gz`
  )
  if (!existsSync(archive)) {
    const name = `cpython-${PYTHON_VERSION}%2B${PYTHON_RELEASE}-aarch64-apple-darwin-install_only.tar.gz`
    await download(
      `https://github.com/astral-sh/python-build-standalone/releases/download/${PYTHON_RELEASE}/${name}`,
      archive
    )
  }
  run('tar', ['-xzf', archive, '-C', runtime])

  await mkdir(site, { recursive: true })
  run(
    join(pythonDir, 'bin', 'python3'),
    [
      '-m',
      'pip',
      'install',
      '--target',
      site,
      '--no-warn-script-location',
      '--no-cache-dir',
      '--upgrade',
      `torch==${TORCH_VERSION}`,
      `numpy==${NUMPY_VERSION}`,
      `opencv-python-headless==${OPENCV_VERSION}`,
      'tqdm',
      'easydict',
      'einops'
    ],
    { env: { ...process.env, PIP_DISABLE_PIP_VERSION_CHECK: '1' } }
  )

  const vda = join(build, 'vda')
  if (!existsSync(join(vda, '.git'))) {
    run('git', [
      'clone',
      'https://github.com/DepthAnything/Video-Depth-Anything.git',
      vda
    ])
  }
  run('git', ['-C', vda, 'checkout', '--force', VDA_REF])

  await cp(
    join(vda, 'video_depth_anything'),
    join(runtime, 'video_depth_anything'),
    { recursive: true }
  )
  await cp(join(vda, 'utils'), join(runtime, 'utils'), { recursive: true })
  await cp(join(repo, 'resources/depth-worker/worker.py'), join(runtime, 'worker.py'))

  for (const file of await walk(runtime)) {
    if (file.includes('__pycache__') || file.endsWith('.pyc')) {
      await rm(file, { force: true })
    }
  }

  run(
    join(pythonDir, 'bin', 'python3'),
    [
      '-c',
      `import sys
sys.path.insert(0, r'${runtime}')
import torch, cv2, numpy, einops, easydict, tqdm
from worker import ensure_torchvision_compose
ensure_torchvision_compose()
from video_depth_anything.video_depth import VideoDepthAnything
print('SMOKE_OK', torch.__version__, numpy.__version__, cv2.__version__)`
    ],
    { cwd: runtime }
  )

  const zipName = `depth-runtime-${PLATFORM}-v${RUNTIME_VERSION}.zip`
  const zipPath = join(outputDir, zipName)
  await rm(zipPath, { force: true })
  run('zip', ['-r', '-q', zipPath, '.'], { cwd: runtime })

  const files = await walk(runtime)
  let expandedSize = 0
  for (const file of files) expandedSize += (await stat(file)).size

  const size = (await stat(zipPath)).size
  const hash = await sha256(zipPath)
  const downloadBase = (
    process.env.DEPTH_DOWNLOAD_BASE ?? 'http://127.0.0.1:8899'
  ).replace(/\/$/, '')

  const manifest = {
    version: RUNTIME_VERSION,
    kind: 'depth-runtime',
    platform: PLATFORM,
    size,
    expandedSize,
    sha256: hash,
    urls: [`${downloadBase}/${zipName}`],
    files: files.length
  }
  const manifestPath = join(
    outputDir,
    `depth-runtime-manifest-${PLATFORM}.json`
  )
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8')

  console.log('DEPTH_RUNTIME_READY')
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
