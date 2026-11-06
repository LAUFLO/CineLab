import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const port = Number(process.env.MOCK_UPDATE_PORT ?? 8788)
const fileName = 'CineLab-Setup-0.1.1.exe'
const dir = join(process.cwd(), '.tmp', 'mock-update')
const filePath = join(dir, fileName)

mkdirSync(dir, { recursive: true })
if (!existsSync(filePath)) {
  // 8MB 占位包，用于验证下载进度；不用于实际安装
  writeFileSync(filePath, Buffer.alloc(8 * 1024 * 1024, 0x41))
}

const data = readFileSync(filePath)
const size = statSync(filePath).size
const sha512 = createHash('sha512').update(data).digest('base64')
const latest = [
  'version: 0.1.1',
  'files:',
  `  - url: ${fileName}`,
  `    sha512: ${sha512}`,
  `    size: ${size}`,
  `path: ${fileName}`,
  `sha512: ${sha512}`,
  `releaseDate: '${new Date().toISOString()}'`,
  'releaseNotes: |',
  '  本地 mock 更新包，用于验证检查与下载流程。',
  ''
].join('\n')

const server = createServer((request, response) => {
  const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname

  if (pathname === '/latest.yml' || pathname === '/latest-mac.yml') {
    response.writeHead(200, { 'Content-Type': 'text/yaml; charset=utf-8' })
    if (request.method === 'HEAD') response.end()
    else response.end(latest)
    return
  }

  if (pathname === `/${fileName}`) {
    const range = request.headers.range
    if (request.method === 'HEAD') {
      response.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Length': size,
        'Accept-Ranges': 'bytes'
      })
      response.end()
      return
    }

    if (range) {
      const match = /bytes=(\d+)-(\d*)/.exec(range)
      const start = match ? Number(match[1]) : 0
      const end = match && match[2] ? Number(match[2]) : size - 1
      response.writeHead(206, {
        'Content-Type': 'application/octet-stream',
        'Content-Range': `bytes ${start}-${end}/${size}`,
        'Content-Length': end - start + 1,
        'Accept-Ranges': 'bytes'
      })
      response.end(data.subarray(start, end + 1))
      return
    }

    response.writeHead(200, {
      'Content-Type': 'application/octet-stream',
      'Content-Length': size,
      'Accept-Ranges': 'bytes'
    })
    response.end(data)
    return
  }

  response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
  response.end('not found')
})

server.listen(port, '127.0.0.1', () => {
  console.log(`[mock-update] listening on http://127.0.0.1:${port}`)
  console.log(`[mock-update] latest.yml -> version 0.1.1, package ${size} bytes`)
})
