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

function makeWav(seconds = 1.5, frequency = 440, sampleRate = 22050) {
  const samples = Math.floor(seconds * sampleRate)
  const dataSize = samples * 2
  const buffer = Buffer.alloc(44 + dataSize)

  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + dataSize, 4)
  buffer.write('WAVE', 8)
  buffer.write('fmt ', 12)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(1, 22)
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(sampleRate * 2, 28)
  buffer.writeUInt16LE(2, 32)
  buffer.writeUInt16LE(16, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(dataSize, 40)

  for (let i = 0; i < samples; i += 1) {
    const envelope = Math.min(1, i / 2000) * Math.min(1, (samples - i) / 2000)
    const value = Math.sin((2 * Math.PI * frequency * i) / sampleRate) * 0.28 * envelope
    buffer.writeInt16LE(Math.round(value * 32767), 44 + i * 2)
  }

  return buffer
}

const wav = makeWav()

let videoTask = null
let musicTask = null
let lastEdit = null

const server = createServer((request, response) => {
  const url = request.url ?? ''

  if (request.method === 'GET' && url === '/v1/models') {
    response.writeHead(200, { 'Content-Type': 'application/json' })
    response.end(JSON.stringify({ data: [{ id: 'mock-image-1', object: 'model' }] }))
    return
  }

  if (request.method === 'POST' && url === '/v1/audio/speech') {
    let body = ''
    request.on('data', (chunk) => {
      body += chunk
    })
    request.on('end', () => {
      setTimeout(() => {
        response.writeHead(200, { 'Content-Type': 'audio/wav' })
        response.end(wav)
      }, 700)
    })
    return
  }

  if (request.method === 'GET' && url === '/mock/audio.wav') {
    response.writeHead(200, { 'Content-Type': 'audio/wav' })
    response.end(wav)
    return
  }

  if (request.method === 'POST' && url === '/v1/audio/generations') {
    let body = ''
    request.on('data', (chunk) => {
      body += chunk
    })
    request.on('end', () => {
      musicTask = {
        id: `music_${Date.now()}`,
        polls: 0,
        body: (() => {
          try {
            return JSON.parse(body)
          } catch {
            return null
          }
        })()
      }
      setTimeout(() => {
        response.writeHead(200, { 'Content-Type': 'application/json' })
        response.end(
          JSON.stringify({
            code: 0,
            message: 'success',
            data: { id: musicTask.id, status: 'submitted' }
          })
        )
      }, 600)
    })
    return
  }

  if (request.method === 'GET' && url === '/debug/last-music') {
    response.writeHead(200, { 'Content-Type': 'application/json' })
    response.end(JSON.stringify(musicTask?.body ?? null))
    return
  }

  if (
    request.method === 'GET' &&
    url.startsWith('/v1/audio/generations/')
  ) {
    if (!musicTask) {
      response.writeHead(404, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({ error: { message: 'task not found' } }))
      return
    }

    musicTask.polls += 1
    response.writeHead(200, { 'Content-Type': 'application/json' })

    if (musicTask.polls < 2) {
      response.end(
        JSON.stringify({
          data: { id: musicTask.id, status: 'processing' }
        })
      )
      return
    }

    response.end(
      JSON.stringify({
        data: {
          id: musicTask.id,
          status: 'completed',
          result: { outputs: ['http://127.0.0.1:8787/mock/audio.wav'] }
        }
      })
    )
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

  if (request.method === 'POST' && url === '/v1/chat/completions') {
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

      const prompt = parsed.messages?.[0]?.content ?? ''

      setTimeout(() => {
        response.writeHead(200, { 'Content-Type': 'application/json' })
        response.end(
          JSON.stringify({
            id: 'chatcmpl-mock',
            object: 'chat.completion',
            created: Math.floor(Date.now() / 1000),
            model: parsed.model ?? 'mock-chat',
            choices: [
              {
                index: 0,
                message: {
                  role: 'assistant',
                  content: `收到提示词：${prompt}\n\n这是 mock 文本结果。`
                },
                finish_reason: 'stop'
              }
            ]
          })
        )
      }, 600)
    })
    return
  }

  if (request.method === 'POST' && url === '/v1/images/edits') {
    const chunks = []
    request.on('data', (chunk) => chunks.push(chunk))
    request.on('end', () => {
      const body = Buffer.concat(chunks).toString('latin1')
      const fields = [...body.matchAll(/\bname="([^"]+)"/g)].map((match) => match[1])
      const filenames = [...body.matchAll(/\bfilename="([^"]+)"/g)].map((match) => match[1])

      lastEdit = {
        fields,
        filenames,
        bytes: Buffer.byteLength(body, 'latin1'),
        contentType: request.headers['content-type'] ?? ''
      }

      setTimeout(() => {
        response.writeHead(200, { 'Content-Type': 'application/json' })
        response.end(
          JSON.stringify({
            created: Math.floor(Date.now() / 1000),
            data: [{ b64_json: base64 }]
          })
        )
      }, 900)
    })
    return
  }

  if (request.method === 'GET' && url === '/debug/last-edit') {
    response.writeHead(200, { 'Content-Type': 'application/json' })
    response.end(JSON.stringify(lastEdit))
    return
  }

  if (request.method === 'POST' && url === '/api/v3/contents/generations/tasks') {
    let body = ''
    request.on('data', (chunk) => {
      body += chunk
    })
    request.on('end', () => {
      videoTask = {
        id: `task_${Date.now()}`,
        model: 'mock-video',
        polls: 0,
        body: (() => {
          try {
            return JSON.parse(body)
          } catch {
            return null
          }
        })()
      }
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({ id: videoTask.id }))
    })
    return
  }

  if (request.method === 'GET' && url === '/debug/last-task') {
    const body = videoTask?.body ?? null
    const summary = body
      ? {
          model: body.model,
          content: (body.content ?? []).map((item) => ({
            type: item.type,
            role: item.role ?? null,
            urlPrefix: item.image_url?.url?.slice(0, 34) ?? null
          })),
          resolution: body.resolution,
          ratio: body.ratio,
          duration: body.duration
        }
      : null

    response.writeHead(200, { 'Content-Type': 'application/json' })
    response.end(JSON.stringify(summary))
    return
  }

  if (request.method === 'GET' && url.startsWith('/api/v3/contents/generations/tasks/')) {
    if (!videoTask) {
      response.writeHead(404, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({ error: { message: 'task not found' } }))
      return
    }

    videoTask.polls += 1
    response.writeHead(200, { 'Content-Type': 'application/json' })

    if (videoTask.polls < 2) {
      response.end(JSON.stringify({ id: videoTask.id, status: 'running' }))
      return
    }

    response.end(
      JSON.stringify({
        id: videoTask.id,
        status: 'succeeded',
        content: { video_url: 'https://www.w3schools.com/html/mov_bbb.mp4' }
      })
    )
    return
  }

  response.writeHead(404, { 'Content-Type': 'application/json' })
  response.end(JSON.stringify({ error: { message: 'not found' } }))
})

server.listen(8787, '127.0.0.1', () => {
  console.log('mock openai listening on http://127.0.0.1:8787/v1')
})
