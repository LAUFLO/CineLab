const targets = await (await fetch('http://127.0.0.1:9222/json/list')).json()
const page = targets.find((target) => target.type === 'page')
if (!page) process.exit(1)

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

async function evaluate(expression) {
  const result = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true
  })
  return result.result?.result?.value
}

const pos = await evaluate(`(() => {
  const handle = document.querySelector('${process.argv[4] ?? '.cnode__handle--right'}')
  if (!handle) return null
  const rect = handle.getBoundingClientRect()
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
})()`)

if (!pos) {
  console.error('no handle')
  process.exit(1)
}

const targetX = Number(process.argv[2] ?? 300)
const targetY = Number(process.argv[3] ?? 880)

await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pos.x, y: pos.y })
await new Promise((r) => setTimeout(r, 200))
await send('Input.dispatchMouseEvent', {
  type: 'mousePressed',
  x: pos.x,
  y: pos.y,
  button: 'left',
  buttons: 1,
  clickCount: 1
})

for (let step = 1; step <= 8; step += 1) {
  const x = pos.x + ((targetX - pos.x) * step) / 8
  const y = pos.y + ((targetY - pos.y) * step) / 8
  await send('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x,
    y,
    button: 'left',
    buttons: 1
  })
  await new Promise((r) => setTimeout(r, 30))
}

await send('Input.dispatchMouseEvent', {
  type: 'mouseReleased',
  x: targetX,
  y: targetY,
  button: 'left',
  buttons: 0,
  clickCount: 1
})

await new Promise((r) => setTimeout(r, 400))
const state = await evaluate(
  `JSON.stringify({ menu: document.querySelectorAll('.add-menu').length, edges: document.querySelectorAll('.react-flow__edge').length })`
)
console.log('start', JSON.stringify(pos), '->', targetX, targetY)
console.log('state', state)
ws.close()
process.exit(0)
