import { BrowserWindow } from 'electron'
import { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import type { Writable } from 'node:stream'
import type {
  StageExportClip,
  StageExportDocument,
  StageExportFrame,
  StageExportInput,
  StageExportItems,
  StageExportProgress,
  StageExportResult,
  StageFrameDensity
} from '@shared/ipc-contract'
import type { GeneratedAsset } from '@shared/generation'
import {
  previewSizeForShot,
  stagePreviewFrameCount
} from '@shared/stage-preview'
import {
  buildProgramTimeline,
  formatTimecode,
  programAt
} from '@shared/stage-program'
import type { ProgramTimeline } from '@shared/stage-program'
import type { DirectorStageDoc, StageShot } from '@shared/stage-schema'
import {
  buildShotList,
  shotListToCsv,
  shotListToMarkdown,
  type StageShotRow
} from '@shared/stage-shot-list'
import { ingestAsset } from '../assets/ingest'
import {
  buildStageStructureJson,
  STAGE_PREVIS_REFERENCE_PROMPT
} from '@shared/stage-previs-reference'
import { ffmpegBinary } from '../media/ffmpeg'
import { loadStageFile } from './storage'

function writeFrame(stdin: Writable, buffer: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error): void => {
      stdin.off('drain', onDrain)
      reject(error)
    }
    const onDrain = (): void => {
      stdin.off('error', onError)
      resolve()
    }
    stdin.once('error', onError)
    if (stdin.write(buffer)) {
      stdin.off('error', onError)
      resolve()
    } else {
      stdin.once('drain', onDrain)
    }
  })
}

function startFfmpeg(args: string[]): {
  stdin: Writable
  done: Promise<void>
  kill: () => void
} {
  const child = spawn(ffmpegBinary(), args, {
    windowsHide: true,
    stdio: ['pipe', 'ignore', 'pipe']
  })

  let stderr = ''
  child.stderr?.setEncoding('utf8')
  child.stderr?.on('data', (chunk: string) => {
    stderr += chunk
    if (stderr.length > 20000) stderr = stderr.slice(-20000)
  })

  const done = new Promise<void>((resolve, reject) => {
    child.once('error', reject)
    child.once('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`ffmpeg 失败（退出码 ${code}）：${stderr.slice(-800)}`))
    })
  })

  if (!child.stdin) throw new Error('无法创建 ffmpeg 输入管道')
  return {
    stdin: child.stdin,
    done,
    kill: () => {
      child.kill()
    }
  }
}

export async function exportStagePreview(
  projectRoot: string,
  input: StageExportInput,
  onProgress: (progress: StageExportProgress) => void,
  signal?: AbortSignal
): Promise<StageExportResult> {
  const doc = await loadStageFile(projectRoot, input.stageId)
  if (!doc) throw new Error('场景文件不存在')

  const shot = doc.shots.find((item) => item.id === input.shotId)
  if (!shot) throw new Error('镜头不存在')
  if (!doc.cameras.some((camera) => camera.id === shot.cameraId)) {
    throw new Error('镜头引用的机位不存在')
  }

  const size = previewSizeForShot(shot, input.resolution)
  const fps = input.fps === 30 ? 30 : 24
  const total = stagePreviewFrameCount(shot.durationMs, fps)
  const durationSeconds = shot.durationMs / 1000

  const exportsDir = join(projectRoot, 'exports')
  const fileName = `白模预演-${Date.now()}.mp4`
  const output = join(exportsDir, fileName)

  const win = new BrowserWindow({
    show: false,
    width: size.width,
    height: size.height,
    webPreferences: {
      backgroundThrottling: false,
      offscreen: false,
      webgl: true,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  const url = devUrl
    ? `${devUrl}/stage-render.html`
    : `file://${join(__dirname, '../renderer/stage-render.html').replace(/\\/g, '/')}`

  try {
    await fs.mkdir(exportsDir, { recursive: true })
    await win.loadURL(url)
    await win.webContents.executeJavaScript(
      `window.__setStagePreview(${JSON.stringify({
        doc,
        shotId: shot.id,
        width: size.width,
        height: size.height
      })})`
    )
    await new Promise((resolve) => setTimeout(resolve, 80))

    const ffmpeg = startFfmpeg([
      '-y',
      '-f',
      'image2pipe',
      '-framerate',
      String(fps),
      '-i',
      '-',
      '-c:v',
      'libx264',
      '-preset',
      'medium',
      '-crf',
      '18',
      '-pix_fmt',
      'yuv420p',
      '-t',
      durationSeconds.toFixed(3),
      '-movflags',
      '+faststart',
      output
    ])

    try {
      for (let index = 0; index < total; index += 1) {
        signal?.throwIfAborted()
        const timeMs = (index * 1000) / fps
        const dataUrl = await win.webContents.executeJavaScript(
          `window.__renderStageFrame(${timeMs})`
        )
        const base64 = String(dataUrl).split(',')[1] ?? ''
        if (!base64) throw new Error('渲染帧为空')
        await writeFrame(ffmpeg.stdin, Buffer.from(base64, 'base64'))

        if (index % 10 === 0 || index === total - 1) {
          onProgress({
            stageId: input.stageId,
            shotId: input.shotId,
            frame: index + 1,
            total,
            stage: 'rendering'
          })
        }
      }

      ffmpeg.stdin.end()
      onProgress({
        stageId: input.stageId,
        shotId: input.shotId,
        frame: total,
        total,
        stage: 'encoding'
      })
      await ffmpeg.done
    } catch (error) {
      ffmpeg.kill()
      ffmpeg.stdin.destroy()
      await ffmpeg.done.catch(() => undefined)
      throw error
    }

    const data = await fs.readFile(output)
    if (data.length === 0) throw new Error('导出的视频为空')

    const asset = await ingestAsset({
      projectPath: projectRoot,
      data,
      kind: 'video',
      mime: 'video/mp4',
      model: '导演台白模',
      width: size.width,
      height: size.height
    })

    onProgress({
      stageId: input.stageId,
      shotId: input.shotId,
      frame: total,
      total,
      stage: 'done'
    })

    return { asset, path: `exports/${fileName}` }
  } catch (error) {
    await fs.rm(output, { force: true }).catch(() => undefined)
    throw error
  } finally {
    if (!win.isDestroyed()) win.destroy()
  }
}


// ---------- 整片导出 ----------

interface StageClipWriter {
  shotId: string
  index: number
  output: string
  relativePath: string
  ffmpeg: ReturnType<typeof startFfmpeg>
  frames: number
  expected: number
  lastFrame: Buffer | null
}

function stageRenderUrl(): string {
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  return devUrl
    ? `${devUrl}/stage-render.html`
    : `file://${join(__dirname, '../renderer/stage-render.html').replace(/\\/g, '/')}`
}

function createStageRenderWindow(width: number, height: number): BrowserWindow {
  return new BrowserWindow({
    show: false,
    width,
    height,
    webPreferences: {
      backgroundThrottling: false,
      offscreen: false,
      webgl: true,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })
}

/** 片段编号只覆盖成片里出现过的镜头；素材库里未加入成片的镜头不导片段。 */
function buildShotOrder(
  timeline: ProgramTimeline,
  doc: DirectorStageDoc
): Array<{ shotId: string; index: number; shot: StageShot }> {
  const seen = new Set<string>()
  const order: Array<{ shotId: string; index: number; shot: StageShot }> = []
  for (const segment of [...timeline.segments].sort(
    (a, b) => a.startMs - b.startMs
  )) {
    if (seen.has(segment.shotId)) continue
    const shot = doc.shots.find((item) => item.id === segment.shotId)
    if (!shot) continue
    seen.add(segment.shotId)
    order.push({ shotId: shot.id, index: order.length + 1, shot })
  }
  return order
}

function startStageClip(
  dir: string,
  relativeDir: string,
  shot: StageShot,
  index: number,
  fps: number
): StageClipWriter {
  const fileName = `第${String(index).padStart(2, '0')}镜.mp4`
  const output = join(dir, fileName)
  const ffmpeg = startFfmpeg([
    '-y',
    '-f',
    'image2pipe',
    '-framerate',
    String(fps),
    '-i',
    '-',
    '-c:v',
    'libx264',
    '-preset',
    'medium',
    '-crf',
    '18',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    output
  ])
  return {
    shotId: shot.id,
    index,
    output,
    relativePath: `${relativeDir}/${fileName}`,
    ffmpeg,
    frames: 0,
    expected: stagePreviewFrameCount(shot.durationMs, fps),
    lastFrame: null
  }
}

async function finishStageClip(
  projectRoot: string,
  clip: StageClipWriter,
  size: { width: number; height: number }
): Promise<StageExportClip> {
  while (clip.frames < clip.expected && clip.lastFrame) {
    await writeFrame(clip.ffmpeg.stdin, clip.lastFrame)
    clip.frames += 1
  }
  clip.ffmpeg.stdin.end()
  await clip.ffmpeg.done

  const data = await fs.readFile(clip.output)
  if (data.length === 0) throw new Error('导出的镜头片段为空')
  const asset = await ingestAsset({
    projectPath: projectRoot,
    data,
    kind: 'video',
    mime: 'video/mp4',
    model: '导演台白模',
    width: size.width,
    height: size.height
  })
  return {
    shotId: clip.shotId,
    index: clip.index,
    asset,
    path: asset.path
  }
}

export async function exportStageProgram(
  projectRoot: string,
  input: StageExportInput,
  onProgress: (progress: StageExportProgress) => void,
  signal?: AbortSignal
): Promise<StageExportResult> {
  const doc = await loadStageFile(projectRoot, input.stageId)
  if (!doc) throw new Error('场景文件不存在')

  const timeline = buildProgramTimeline(doc)
  if (timeline.segments.length === 0) throw new Error('成片还没有镜头')

  const fps = input.fps === 30 ? 30 : 24
  const items: StageExportItems = {
    previs: true,
    clips: true,
    frames: true,
    overview: false,
    shotList: true,
    script: false,
    ...input.items
  }
  const frameDensity: StageFrameDensity =
    input.frameDensity === 'first-only' ? 'first-only' : 'three'
  const firstShot = doc.shots.find(
    (item) => item.id === timeline.segments[0]!.shotId
  )
  if (!firstShot) throw new Error('成片镜头不存在')

  const size = previewSizeForShot(firstShot, input.resolution)
  const total = stagePreviewFrameCount(timeline.durationMs, fps)
  const durationSeconds = timeline.durationMs / 1000

  const stamp = Date.now()
  const relativeDir = `exports/previs/${stamp}`
  const dir = join(projectRoot, relativeDir)
  const output = join(dir, '整片.mp4')
  await fs.mkdir(dir, { recursive: true })

  const shotOrder = buildShotOrder(timeline, doc)
  const orderById = new Map(shotOrder.map((item) => [item.shotId, item]))
  const recorded = new Set<string>()
  const finished: StageExportClip[] = []
  let current: StageClipWriter | undefined

  const win = createStageRenderWindow(size.width, size.height)
  const previs = startFfmpeg([
    '-y',
    '-f',
    'image2pipe',
    '-framerate',
    String(fps),
    '-i',
    '-',
    '-c:v',
    'libx264',
    '-preset',
    'medium',
    '-crf',
    '18',
    '-pix_fmt',
    'yuv420p',
    '-t',
    durationSeconds.toFixed(3),
    '-movflags',
    '+faststart',
    output
  ])

  try {
    await win.loadURL(stageRenderUrl())
    await win.webContents.executeJavaScript(
      `window.__setStageProgram(${JSON.stringify({
        doc,
        width: size.width,
        height: size.height,
        fps
      })})`
    )
    await new Promise((resolve) => setTimeout(resolve, 80))

    for (let index = 0; index < total; index += 1) {
      signal?.throwIfAborted()
      const timeMs = (index * 1000) / fps
      const segment = programAt(timeline, timeMs)
      const shotId = segment?.shotId

      if (shotId !== current?.shotId) {
        if (current) {
          signal?.throwIfAborted()
          finished.push(await finishStageClip(projectRoot, current, size))
        }
        current = undefined
        if (items.clips && shotId && !recorded.has(shotId)) {
          const order = orderById.get(shotId)
          if (order) {
            current = startStageClip(
              dir,
              relativeDir,
              order.shot,
              order.index,
              fps
            )
            recorded.add(shotId)
          }
        }
      }

      const order = shotId ? orderById.get(shotId) : undefined
      const overlay = order
        ? {
            shotNumber: order.index,
            totalShots: shotOrder.length,
            timecode: formatTimecode(timeMs, fps),
            caption: order.shot.caption
          }
        : undefined
      const frame = (await win.webContents.executeJavaScript(
        `window.__renderProgramFrame(${JSON.stringify(timeMs)}, ${JSON.stringify(overlay)})`
      )) as { frame?: string; clean?: string }
      if (!frame?.frame || !frame.clean) throw new Error('渲染帧为空')

      const frameBuffer = Buffer.from(
        frame.frame.split(',')[1] ?? '',
        'base64'
      )
      await writeFrame(previs.stdin, frameBuffer)

      if (current) {
        const cleanBuffer = Buffer.from(
          frame.clean.split(',')[1] ?? '',
          'base64'
        )
        await writeFrame(current.ffmpeg.stdin, cleanBuffer)
        current.frames += 1
        current.lastFrame = cleanBuffer
      }

      if (index % 10 === 0 || index === total - 1) {
        onProgress({
          stageId: input.stageId,
          frame: index + 1,
          total,
          stage: 'rendering'
        })
      }
    }

    if (current) {
      finished.push(await finishStageClip(projectRoot, current, size))
      current = undefined
    }

    previs.stdin.end()
    onProgress({
      stageId: input.stageId,
      frame: total,
      total,
      stage: 'encoding'
    })
    await previs.done

    // 补录被覆盖、在整片里没有生效的镜头
    const missing = items.clips
      ? shotOrder.filter((item) => !recorded.has(item.shotId))
      : []
    for (const [missingIndex, order] of missing.entries()) {
      const clip = startStageClip(
        dir,
        relativeDir,
        order.shot,
        order.index,
        fps
      )
      const frames = stagePreviewFrameCount(order.shot.durationMs, fps)
      for (let index = 0; index < frames; index += 1) {
        signal?.throwIfAborted()
        const timeMs = (index * 1000) / fps
        const dataUrl = (await win.webContents.executeJavaScript(
          `window.__renderShotFrame(${JSON.stringify(order.shotId)}, ${JSON.stringify(timeMs)})`
        )) as string
        const buffer = Buffer.from(dataUrl.split(',')[1] ?? '', 'base64')
        if (buffer.length === 0) throw new Error('补录帧为空')
        await writeFrame(clip.ffmpeg.stdin, buffer)
        clip.frames += 1
        clip.lastFrame = buffer
      }
      finished.push(await finishStageClip(projectRoot, clip, size))
      onProgress({
        stageId: input.stageId,
        frame: missingIndex + 1,
        total: missing.length,
        stage: 'clips',
        clipIndex: missingIndex + 1,
        clipTotal: missing.length
      })
    }

    const frameAssets: StageExportFrame[] = []
    const frameBuffers = new Map<string, Buffer[]>()
    if (items.frames) {
      const labels =
        frameDensity === 'first-only' ? ['首'] : ['首', '中', '尾']
      const framesDir = join(dir, 'frames')
      await fs.mkdir(framesDir, { recursive: true })
      const totalFrames = shotOrder.length * labels.length
      let doneFrames = 0

      for (const order of shotOrder) {
        const times =
          frameDensity === 'first-only'
            ? [0]
            : [
                0,
                order.shot.durationMs / 2,
                Math.max(0, order.shot.durationMs - 1000 / fps)
              ]
        const buffers: Buffer[] = []
        for (const [labelIndex, label] of labels.entries()) {
          signal?.throwIfAborted()
          const dataUrl = (await win.webContents.executeJavaScript(
            `window.__renderShotFrame(${JSON.stringify(order.shotId)}, ${JSON.stringify(times[labelIndex])})`
          )) as string
          const buffer = Buffer.from(dataUrl.split(',')[1] ?? '', 'base64')
          if (buffer.length === 0) throw new Error('分镜图为空')
          buffers.push(buffer)

          const fileName = `第${String(order.index).padStart(2, '0')}镜-${label}.jpg`
          await fs.writeFile(join(framesDir, fileName), buffer)
          const asset = await ingestAsset({
            projectPath: projectRoot,
            data: buffer,
            kind: 'image',
            mime: 'image/jpeg',
            model: '导演台分镜图',
            width: size.width,
            height: size.height
          })
          frameAssets.push({
            shotId: order.shotId,
            label: `第${String(order.index).padStart(2, '0')}镜 · ${label}`,
            asset,
            path: asset.path
          })
          doneFrames += 1
          onProgress({
            stageId: input.stageId,
            frame: doneFrames,
            total: totalFrames,
            stage: 'frames'
          })
        }
        frameBuffers.set(order.shotId, buffers)
      }
    }

    let overview: { asset: GeneratedAsset; path: string } | undefined
    if (items.overview) {
      signal?.throwIfAborted()
      const dataUrl = (await win.webContents.executeJavaScript(
        `window.__renderOverview(${size.width}, ${size.height})`
      )) as string
      const buffer = Buffer.from(dataUrl.split(',')[1] ?? '', 'base64')
      if (buffer.length === 0) throw new Error('场景鸟瞰为空')
      await fs.writeFile(join(dir, '鸟瞰.jpg'), buffer)
      const asset = await ingestAsset({
        projectPath: projectRoot,
        data: buffer,
        kind: 'image',
        mime: 'image/jpeg',
        model: '导演台鸟瞰',
        width: size.width,
        height: size.height
      })
      overview = { asset, path: asset.path }
    }

    const documents: StageExportDocument[] = []
    const structureJson = buildStageStructureJson(doc)
    await fs.writeFile(join(dir, '白模结构约束.json'), structureJson, 'utf8')
    documents.push({ label: '白模结构约束.json', text: structureJson })
    await fs.writeFile(
      join(dir, '生成参考提示词.txt'),
      STAGE_PREVIS_REFERENCE_PROMPT,
      'utf8'
    )
    documents.push({
      label: '生成参考提示词',
      text: STAGE_PREVIS_REFERENCE_PROMPT
    })
    if (items.shotList || items.script) {
      const rows = buildShotList(doc, timeline)
      if (items.shotList) {
        const csv = shotListToCsv(rows)
        const markdown = shotListToMarkdown(rows)
        const html = buildShotListHtml(rows, frameBuffers)
        await fs.writeFile(join(dir, '镜头表.csv'), csv, 'utf8')
        await fs.writeFile(join(dir, '镜头表.md'), markdown, 'utf8')
        await fs.writeFile(join(dir, '镜头表.html'), html, 'utf8')
        documents.push({ label: '白模镜头表.csv', text: csv })
        documents.push({ label: '白模镜头表', text: markdown })
      }
      if (items.script) {
        const script = buildShotScript(rows)
        await fs.writeFile(join(dir, '分镜脚本.md'), script, 'utf8')
        documents.push({ label: '分镜脚本', text: script })
      }
      onProgress({
        stageId: input.stageId,
        frame: 1,
        total: 1,
        stage: 'shot-list'
      })
    }

    const data = await fs.readFile(output)
    if (data.length === 0) throw new Error('导出的视频为空')
    const asset = await ingestAsset({
      projectPath: projectRoot,
      data,
      kind: 'video',
      mime: 'video/mp4',
      model: '导演台白模',
      width: size.width,
      height: size.height
    })

    onProgress({
      stageId: input.stageId,
      frame: total,
      total,
      stage: 'done'
    })

    // 分镜图和片段已 ingest，删除重复文件；保留整片、镜头表、脚本和鸟瞰源文件
    await fs.rm(join(dir, 'frames'), {
      recursive: true,
      force: true
    }).catch(() => undefined)
    for (const order of shotOrder) {
      await fs
        .rm(join(dir, `第${String(order.index).padStart(2, '0')}镜.mp4`), {
          force: true
        })
        .catch(() => undefined)
    }

    return {
      asset,
      path: asset.path,
      ...(finished.length
        ? { clips: finished.sort((a, b) => a.index - b.index) }
        : {}),
      ...(frameAssets.length ? { frames: frameAssets } : {}),
      ...(overview ? { overview } : {}),
      ...(documents.length ? { documents } : {})
    }
  } catch (error) {
    const aborted = signal?.aborted === true
    previs.kill()
    previs.stdin.destroy()
    await previs.done.catch(() => undefined)
    if (current) {
      current.ffmpeg.kill()
      current.ffmpeg.stdin.destroy()
      await current.ffmpeg.done.catch(() => undefined)
    }
    if (aborted) {
      // 取消时清理本次导出的中间目录
      await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined)
      throw new Error('导出已取消')
    }
    // 失败时保留 exports/previs/<时间戳>/ 便于排查
    throw error
  } finally {
    if (!win.isDestroyed()) win.destroy()
  }
}


function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function buildShotListHtml(
  rows: StageShotRow[],
  frames: Map<string, Buffer[]>
): string {
  const body = rows
    .map((row) => {
      const buffers = frames.get(row.shotId) ?? []
      const images = buffers
        .map(
          (buffer) =>
            `<img src="data:image/jpeg;base64,${buffer.toString('base64')}" alt="${escapeHtml(row.shotId)}">`
        )
        .join('')
      return `<tr>
  <td>${row.programNumber || '—'}</td>
  <td>${row.number}</td>
  <td>${(row.durationMs / 1000).toFixed(1)}s</td>
  <td>${escapeHtml(row.cameraName)}</td>
  <td>${escapeHtml(row.framing)}</td>
  <td>${escapeHtml(row.shotSize)}</td>
  <td>${escapeHtml(row.angle)}</td>
  <td>${escapeHtml(row.movement)}</td>
  <td>${escapeHtml(row.subjects.join('、') || '—')}</td>
  <td>${escapeHtml(row.caption || '—')}</td>
  <td>${escapeHtml(row.note || '—')}</td>
  <td class="frames">${images || '—'}</td>
</tr>`
    })
    .join('\n')

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>白模镜头表</title>
<style>
body{font-family:system-ui,"Microsoft YaHei",sans-serif;margin:24px;color:#111}
h1{font-size:20px}
table{border-collapse:collapse;width:100%;font-size:12px}
th,td{border:1px solid #ccc;padding:6px;vertical-align:top;text-align:left}
th{background:#f4f4f4;position:sticky;top:0}
.frames img{width:160px;margin:0 4px 4px 0;border:1px solid #ddd}
</style>
</head>
<body>
<h1>白模镜头表</h1>
<table>
<thead><tr><th>成片镜号</th><th>素材镜号</th><th>时长</th><th>机位</th><th>构图</th><th>景别</th><th>角度</th><th>运镜</th><th>主体</th><th>台词</th><th>备注</th><th>分镜图</th></tr></thead>
<tbody>
${body}
</tbody>
</table>
</body>
</html>`
}

function buildShotScript(rows: StageShotRow[]): string {
  return [
    '# 白模分镜脚本',
    '',
    ...rows.flatMap((row) => [
      `## ${row.programNumber ? `第${row.programNumber}镜` : '未播'} · 素材第${row.number}镜`,
      '',
      `- 时间：${(row.startMs / 1000).toFixed(1)}s – ${(row.endMs / 1000).toFixed(1)}s`,
      `- 机位：${row.cameraName} · ${row.shotSize} · ${row.angle} · ${row.movement}`,
      `- 主体：${row.subjects.join('、') || '—'}`,
      ...(row.caption ? [`- 台词：${row.caption}`] : []),
      ...(row.note ? [`- 备注：${row.note}`] : []),
      ''
    ])
  ].join('\n')
}
