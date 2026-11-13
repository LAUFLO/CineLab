import { protocol } from 'electron'
import { createReadStream, promises as fs } from 'node:fs'
import { extname, isAbsolute, relative, resolve } from 'node:path'
import { Readable } from 'node:stream'
import { getCurrentProjectRoot } from './project/manager'
import { getLibraryRoot } from './library/config'
import { parseByteRange } from './media/range'

export const ASSET_SCHEME = 'cinelab-asset'

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.mkv': 'video/x-matroska',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.flac': 'audio/flac',
  '.json': 'application/json',
  '.txt': 'text/plain'
}

export function registerAssetScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: ASSET_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true
      }
    }
  ])
}

export function registerAssetProtocol(): void {
  protocol.handle(ASSET_SCHEME, async (request) => {
    const url = new URL(request.url)
    const host = url.hostname || 'local'

    if (host !== 'local' && host !== 'global') {
      return new Response('Not found', { status: 404 })
    }

    const root =
      host === 'global' ? await getLibraryRoot() : getCurrentProjectRoot()

    if (!root) {
      return new Response('No project', { status: 404 })
    }

    let relativePath: string
    try {
      relativePath = decodeURIComponent(url.pathname).replace(/^\/+/, '')
    } catch {
      return new Response('Bad request', { status: 400 })
    }

    let target: string | null
    try {
      target = await resolveAssetPath(root, relativePath)
    } catch {
      return new Response('Not found', { status: 404 })
    }

    if (!target) {
      return new Response('Forbidden', { status: 403 })
    }

    try {
      const stat = await fs.stat(target)
      if (!stat.isFile()) {
        return new Response('Not found', { status: 404 })
      }

      const mime =
        MIME[extname(target).toLowerCase()] ?? 'application/octet-stream'
      const baseHeaders: Record<string, string> = {
        'Content-Type': mime,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-cache',
        'X-Content-Type-Options': 'nosniff'
      }

      if (request.method === 'HEAD') {
        return new Response(null, {
          headers: { ...baseHeaders, 'Content-Length': String(stat.size) }
        })
      }

      const rangeHeader = request.headers.get('Range')
      if (rangeHeader) {
        const range = parseByteRange(rangeHeader, stat.size)
        if (!range) {
          return new Response(null, {
            status: 416,
            headers: {
              ...baseHeaders,
              'Content-Range': `bytes */${stat.size}`
            }
          })
        }

        const { start, end } = range
        const stream = createReadStream(target, { start, end })
        return new Response(Readable.toWeb(stream) as unknown as ReadableStream, {
          status: 206,
          headers: {
            ...baseHeaders,
            'Content-Range': `bytes ${start}-${end}/${stat.size}`,
            'Content-Length': String(end - start + 1)
          }
        })
      }

      return new Response(
        Readable.toWeb(createReadStream(target)) as unknown as ReadableStream,
        {
          headers: { ...baseHeaders, 'Content-Length': String(stat.size) }
        }
      )
    } catch (error) {
      console.error('[asset] failed', target, error)
      return new Response('Not found', { status: 404 })
    }
  })
}

async function resolveAssetPath(
  root: string,
  relativePath: string
): Promise<string | null> {
  const rootResolved = resolve(root)
  const target = resolve(rootResolved, relativePath)

  if (!isInside(rootResolved, target)) return null

  const realRoot = await fs.realpath(rootResolved)
  const realTarget = await fs.realpath(target)
  if (!isInside(realRoot, realTarget)) return null

  return realTarget
}

function isInside(root: string, target: string): boolean {
  const rel = relative(root, target)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}
