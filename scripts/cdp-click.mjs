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

const selector = process.argv[2] ?? '.react-flow__node'
const index = Number(process.argv[3] ?? 0)

const pos = await evaluate(`(() => {
  const els = document.querySelectorAll('${selector}')
  const el = els[${index}]
  if (!el) return null
  const rect = el.getBoundingClientRect()
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
})()`)

if (!pos) {
  console.error('target not found:', selector)
  process.exit(1)
}

await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pos.x, y: pos.y })
await new Promise((r) => setTimeout(r, 150))
await send('Input.dispatchMouseEvent', {
  type: 'mousePressed',
  x: pos.x,
  y: pos.y,
  button: 'left',
  buttons: 1,
  clickCount: 1
})
await send('Input.dispatchMouseEvent', {
  type: 'mouseReleased',
  x: pos.x,
  y: pos.y,
  button: 'left',
  buttons: 0,
  clickCount: 1
})

await new Promise((r) => setTimeout(r, 400))

const state = await evaluate(
  `JSON.stringify({ promptbar: Boolean(document.querySelector('.promptbar')), selected: document.querySelectorAll('.react-flow__node.selected').length })`
)

console.log('clicked', JSON.stringify(pos), state)
ws.close()
process.exit(0)
