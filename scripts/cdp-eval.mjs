const targets = await (await fetch(`http://127.0.0.1:${process.env.CINELAB_DEBUG_PORT ?? process.env.CDP_PORT ?? '9222'}/json/list`)).json()
const page = targets.find((target) => target.type === 'page')
if (!page) {
  console.error('no page')
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
      reject(new Error(`timeout: ${method}`))
    }, 8000)

    pending.set(id, (message) => {
      clearTimeout(timer)
      resolve(message)
    })

    ws.send(JSON.stringify({ id, method, params }))
  })
}

const expression = process.argv[2] ?? '1'
const result = await send('Runtime.evaluate', {
  expression,
  returnByValue: true,
  awaitPromise: true
})

console.log(JSON.stringify(result.result?.result ?? result))
ws.close()
process.exit(0)
