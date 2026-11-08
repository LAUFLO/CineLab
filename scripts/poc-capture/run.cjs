const fs = require('node:fs')
const path = require('node:path')
const { execFileSync, spawnSync } = require('node:child_process')
const { createRequire } = require('node:module')

const root = __dirname
const outDir = path.join(root, 'out')
const mediaDir = path.join(outDir, 'media')
const mainRepo = process.env.CINELAB_MAIN || 'C:/Users/LAUFLO/Documents/CineLab'
const mainRequire = createRequire(path.join(mainRepo, 'package.json'))
const ffmpeg = process.env.FFMPEG_PATH || mainRequire('ffmpeg-static')
const electron = process.env.ELECTRON_PATH || mainRequire('electron')

function run(args) {
  execFileSync(ffmpeg, args, { stdio: 'ignore' })
}

fs.rmSync(path.join(outDir, 'frames'), { recursive: true, force: true })
fs.rmSync(path.join(outDir, 'poc.mp4'), { force: true })
fs.rmSync(path.join(outDir, 'result.json'), { force: true })
fs.mkdirSync(mediaDir, { recursive: true })

console.log('generating test media...')
if (!fs.existsSync(path.join(mediaDir, 'a.mp4'))) {
  run(['-y', '-f', 'lavfi', '-i', 'testsrc2=size=1920x1080:rate=30:duration=4', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', path.join(mediaDir, 'a.mp4')])
  run(['-y', '-f', 'lavfi', '-i', 'smptebars=size=1920x1080:rate=30:duration=4', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', path.join(mediaDir, 'b.mp4')])
  run(['-y', '-f', 'lavfi', '-i', 'testsrc=size=1920x1080:rate=30:duration=4', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', path.join(mediaDir, 'c.mp4')])
  run(['-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=10', '-c:a', 'aac', '-b:a', '128k', path.join(mediaDir, 'audio.m4a')])
}

console.log('launching electron...')
const scale = process.env.POC_SCALE || '1'
const result = spawnSync(electron, [`--force-device-scale-factor=${scale}`, path.join(root, 'main.cjs')], {
  cwd: root,
  env: { ...process.env, FFMPEG_PATH: ffmpeg, ELECTRON_ENABLE_LOGGING: '1', POC_FRAMES: process.env.POC_FRAMES || '300' },
  stdio: 'inherit',
  timeout: 240000
})

if (result.error) console.error(result.error)
console.log('electron exit:', result.status)

const resultFile = path.join(outDir, 'result.json')
if (fs.existsSync(resultFile)) console.log(fs.readFileSync(resultFile, 'utf8'))
else console.log('no result.json; see out/poc.log')
