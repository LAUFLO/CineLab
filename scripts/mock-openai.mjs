import { createServer } from 'node:http'
import { deflateSync } from 'node:zlib'

let crcTable = null

function crc32(buffer) {
  if (!crcTable) {
    crcTable = new Int32Array(256)
    for (let n = 0; n < 256; n += 1) {
      let c = n
      for (let k = 0; k < 8; k += 1) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      }
      crcTable[n] = c
    }
  }

  let c = 0xffffffff
  for (let i = 0; i < buffer.length; i += 1) {
    c = crcTable[(c ^ buffer[i]) & 0xff] ^ (c >>> 8)
  }
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)

  const typeBuffer = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])))

  return Buffer.concat([length, typeBuffer, data, crc])
}

function makePng(width, height) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  const rowSize = width * 3 + 1
  const raw = Buffer.alloc(rowSize * height)

  for (let y = 0; y < height; y += 1) {
    raw[y * rowSize] = 0
    for (let x = 0; x < width; x += 1) {
      const offset = y * rowSize + 1 + x * 3
      const wave = Math.sin((x / width) * Math.PI * 2) * 0.5 + 0.5
      raw[offset] = Math.round(38 + wave * 110)
      raw[offset + 1] = Math.round(52 + (y / height) * 90)
      raw[offset + 2] = Math.round(150 + wave * 70)
    }
  }

  const idat = deflateSync(raw)
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0))
  ])
}

const png = makePng(640, 640)
const base64 = png.toString('base64')

const server = createServer((request, response) => {
  const url = request.url ?? ''

  if (request.method === 'GET' && url === '/v1/models') {
    response.writeHead(200, { 'Content-Type': 'application/json' })
    response.end(JSON.stringify({ data: [{ id: 'mock-image-1', object: 'model' }] }))
    return
  }

  if (request.method === 'POST' && url === '/v1/images/generations') {
    let body = ''
    request.on('data', (chunk) => {
      body += chunk
    })
    request.on('end', () => {
      let parsed = {}
      try {
        parsed = JSON.parse(body)
      } catch {
        parsed = {}
      }

      const count = Math.min(Number(parsed.n ?? 1) || 1, 4)

      setTimeout(() => {
        response.writeHead(200, { 'Content-Type': 'application/json' })
        response.end(
          JSON.stringify({
            created: Math.floor(Date.now() / 1000),
            data: Array.from({ length: count }, () => ({ b64_json: base64 }))
          })
        )
      }, 1400)
    })
    return
  }

  response.writeHead(404, { 'Content-Type': 'application/json' })
  response.end(JSON.stringify({ error: { message: 'not found' } }))
})

server.listen(8787, '127.0.0.1', () => {
  console.log('mock openai listening on http://127.0.0.1:8787/v1')
})
