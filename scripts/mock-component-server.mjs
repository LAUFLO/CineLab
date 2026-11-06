import http from 'node:http'
import { createReadStream, statSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'

const root = resolve(process.argv[2] ?? 'build/components')
const port = Number(process.argv[3] ?? 8899)

const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(
    new URL(req.url ?? '/', 'http://127.0.0.1').pathname
  )
  const file = join(root, pathname)

  if (file !== root && !file.startsWith(root + sep)) {
    res.writeHead(403)
    res.end('forbidden')
    return
  }

  let stat
  try {
    stat = statSync(file)
  } catch {
    res.writeHead(404)
    res.end('not found')
    return
  }

  if (!stat.isFile()) {
    res.writeHead(404)
    res.end('not found')
    return
  }

  const range = req.headers.range
  if (range) {
    const match = /bytes=(\d+)-(\d*)/.exec(range)
    const start = match ? Number(match[1]) : 0
    const end = match && match[2] ? Number(match[2]) : stat.size - 1

    if (start >= stat.size) {
      res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` })
      res.end()
      return
    }

    res.writeHead(206, {
      'Content-Type': 'application/octet-stream',
      'Content-Length': end - start + 1,
      'Content-Range': `bytes ${start}-${end}/${stat.size}`,
      'Accept-Ranges': 'bytes'
    })
    createReadStream(file, { start, end }).pipe(res)
    return
  }

  res.writeHead(200, {
    'Content-Type': 'application/octet-stream',
    'Content-Length': stat.size,
    'Accept-Ranges': 'bytes'
  })
  createReadStream(file).pipe(res)
})

server.listen(port, '127.0.0.1', () => {
  console.log(`[mock-components] http://127.0.0.1:${port} root=${root}`)
})
