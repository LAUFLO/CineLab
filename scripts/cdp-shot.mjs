import { writeFileSync } from 'node:fs'

const OUT = process.argv[2] ?? 'D:\\CineLab\\.cdp.png'
const ACTION = process.argv[3] ?? ''

const targets = await (await fetch(`http://127.0.0.1:${process.env.CDP_PORT ?? '9222'}/json/list`)).json()
const page = targets.find((target) => target.type === 'page')
if (!page) {
  console.error('no page target', JSON.stringify(targets))
  process.exit(1)
}

const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  ws.onopen = resolve
  ws.onerror = reject
})

let seq = 0
const pending = new Map()

ws.onmessage = (event) => {
  const message = JSON.parse(event.data)
  if (message.id && pending.has(message.id)) {
    pending.get(message.id)(message)
    pending.delete(message.id)
  }
}

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++seq
    const timer = setTimeout(() => {
      pending.delete(id)
      reject(new Error(`CDP timeout: ${method}`))
    }, 10000)

    pending.set(id, (message) => {
      clearTimeout(timer)
      resolve(message)
    })

    ws.send(JSON.stringify({ id, method, params }))
  })
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

if (ACTION) {
  const result = await send('Runtime.evaluate', {
    expression: ACTION,
    awaitPromise: true,
    returnByValue: true
  })
  console.log('eval:', JSON.stringify(result.result?.result ?? result.result))
  await sleep(900)
}

const shot = await send('Page.captureScreenshot', {
  format: 'png',
  fromSurface: false
})
writeFileSync(OUT, Buffer.from(shot.result.data, 'base64'))
console.log('saved', OUT)

ws.close()
process.exit(0)
