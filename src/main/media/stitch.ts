import { app } from 'electron'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { GROUP_RATIO_VALUE } from '@shared/canvas-schema'
import type { GeneratedAsset } from '@shared/generation'
import type { StitchRequest } from '@shared/media'
import { ingestAsset } from '../assets/ingest'
import { runFfmpeg } from './ffmpeg'
import { resolveMediaPath } from './paths'

const GAP = 8

export async function stitchGrid(
  projectRoot: string,
  input: StitchRequest
): Promise<GeneratedAsset> {
  const cols = Math.min(10, Math.max(1, Math.round(input.cols)))
  const rows = Math.min(10, Math.max(1, Math.round(input.rows)))
  const outputWidth = Math.max(512, Math.round(input.outputWidth ?? 2048))
  const ratio = GROUP_RATIO_VALUE[input.ratio] ?? 16 / 9
  const outputHeight = Math.round(outputWidth / ratio)

  const cellWidth = Math.floor((outputWidth - GAP * (cols - 1)) / cols)
  const cellHeight = Math.floor((outputHeight - GAP * (rows - 1)) / rows)
  if (cellWidth <= 0 || cellHeight <= 0) throw new Error('宫格尺寸无效')

  const limited = input.paths.slice(0, cols * rows)
  if (limited.length === 0) throw new Error('没有可拼接的图片')

  const files: string[] = []
  for (const path of limited) {
    files.push(await resolveMediaPath(projectRoot, path))
  }
  const temp = join(app.getPath('temp'), `cinelab-stitch-${Date.now()}.png`)

  const filters = files
    .map(
      (_file, index) =>
        `[${index}:v]scale=${cellWidth}:${cellHeight}:force_original_aspect_ratio=decrease,pad=${cellWidth}:${cellHeight}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1[v${index}]`
    )
    .join(';')

  const layout = limited
    .map((_path, index) => {
      const col = index % cols
      const row = Math.floor(index / cols)
      return `${col * (cellWidth + GAP)}_${row * (cellHeight + GAP)}`
    })
    .join('|')

  const inputs = limited.map((_path, index) => `[v${index}]`).join('')
  const graph =
    limited.length === 1
      ? `${filters};[v0]pad=${outputWidth}:${outputHeight}:0:0:color=black[out]`
      : `${filters};${inputs}xstack=inputs=${limited.length}:layout=${layout}[stacked];[stacked]pad=${outputWidth}:${outputHeight}:0:0:color=black[out]`

  const args = [
    '-y',
    ...files.flatMap((file) => ['-i', file]),
    '-filter_complex',
    graph,
    '-map',
    '[out]',
    '-frames:v',
    '1',
    temp
  ]

  try {
    await runFfmpeg(args)
    const data = await fs.readFile(temp)
    return await ingestAsset({
      projectPath: projectRoot,
      data,
      kind: 'image',
      mime: 'image/png',
      model: '分镜拼接',
      width: outputWidth,
      height: outputHeight
    })
  } finally {
    await fs.rm(temp, { force: true }).catch(() => undefined)
  }
}
