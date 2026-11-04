import { nativeImage } from 'electron'
import { createHash, randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { dirname, join } from 'node:path'
import type { GeneratedAsset, OutputKind } from '@shared/generation'

const EXT_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav'
}

function extFromMime(mime: string, fallback: string): string {
  return EXT_BY_MIME[mime.toLowerCase()] ?? fallback
}

function hashBuffer(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex').slice(0, 32)
}

async function fileExists(path: string): Promise<boolean> {
  return fs
    .access(path)
    .then(() => true)
    .catch(() => false)
}

export interface IngestInput {
  projectPath: string
  data: Buffer
  kind: OutputKind
  mime: string
  model: string
  text?: string
}

export async function ingestAsset(input: IngestInput): Promise<GeneratedAsset> {
  const hash = hashBuffer(input.data)
  const ext =
    input.kind === 'image'
      ? extFromMime(input.mime, 'png')
      : input.kind === 'video'
        ? extFromMime(input.mime, 'mp4')
        : input.kind === 'audio'
          ? extFromMime(input.mime, 'mp3')
          : 'txt'

  const folder = input.kind === 'image' ? 'img' : input.kind === 'video' ? 'vid' : input.kind === 'audio' ? 'aud' : 'txt'
  const relativePath = `assets/${folder}/${hash}.${ext}`
  const absolutePath = join(input.projectPath, relativePath)

  if (!(await fileExists(absolutePath))) {
    await fs.mkdir(dirname(absolutePath), { recursive: true })
    await fs.writeFile(absolutePath, input.data)
  }

  if (input.kind === 'image') {
    await writeThumbnail(input.projectPath, hash, input.data)
  }

  return {
    id: randomUUID(),
    path: relativePath,
    kind: input.kind,
    createdAt: new Date().toISOString(),
    model: input.model,
    text: input.text
  }
}

async function writeThumbnail(
  projectPath: string,
  hash: string,
  data: Buffer
): Promise<void> {
  try {
    const image = nativeImage.createFromBuffer(data)
    if (image.isEmpty()) return

    const size = image.getSize()
    const width = Math.min(512, size.width)
    const thumb = image.resize({ width, quality: 'good' })
    const thumbPath = join(projectPath, 'assets', 'thumb', `${hash}.png`)

    if (!(await fileExists(thumbPath))) {
      await fs.mkdir(dirname(thumbPath), { recursive: true })
      await fs.writeFile(thumbPath, thumb.toPNG())
    }
  } catch (error) {
    console.warn('[assets] thumbnail failed', error)
  }
}

export function thumbnailPathFor(relativePath: string): string {
  const match = /assets\/[^/]+\/(.+)\.(\w+)$/.exec(relativePath)
  if (!match) return relativePath
  return `assets/thumb/${match[1]}.png`
}
