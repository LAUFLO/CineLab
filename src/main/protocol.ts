import { protocol } from 'electron'
import { promises as fs } from 'node:fs'
import { extname, resolve, sep } from 'node:path'
import { getCurrentProjectRoot } from './project/manager'
import { getLibraryRoot } from './library/config'

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
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': '*'
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors })
    }

    const url = new URL(request.url)
    const host = url.hostname || 'local'
    const root =
      host === 'global' ? await getLibraryRoot() : getCurrentProjectRoot()


    if (!root) {
      return new Response('No project', { status: 404 })
    }

    const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '')
    const target = resolve(root, relative)
    const rootResolved = resolve(root)

    const inside =
      target === rootResolved ||
      target.startsWith(`${rootResolved}${sep}`) ||
      target.startsWith(`${rootResolved}/`)

    if (!inside) {
      return new Response('Forbidden', { status: 403 })
    }

    try {
      const stat = await fs.stat(target)
      const mime = MIME[extname(target).toLowerCase()] ?? 'application/octet-stream'
      const range = request.headers.get('Range')

      if (range) {
        const match = /bytes=(\d+)-(\d*)/.exec(range)
        if (match) {
          const start = Number(match[1])
          const end = match[2] ? Number(match[2]) : stat.size - 1
          const data = await fs.readFile(target)
          const chunk = data.subarray(start, end + 1)

          return new Response(new Uint8Array(chunk), {
            status: 206,
            headers: {
              ...cors,
              'Content-Type': mime,
              'Content-Range': `bytes ${start}-${end}/${stat.size}`,
              'Accept-Ranges': 'bytes',
              'Content-Length': String(chunk.length),
              'Cache-Control': 'no-cache'
            }
          })
        }
      }

      const data = await fs.readFile(target)

      return new Response(new Uint8Array(data), {
        headers: {
          ...cors,
          'Content-Type': mime,
          'Content-Length': String(stat.size),
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'no-cache'
        }
      })
    } catch (error) {
      console.error('[asset] failed', target, error)
      return new Response('Not found', { status: 404 })
    }
  })
}
