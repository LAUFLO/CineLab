const targets = await (await fetch(`http://127.0.0.1:${process.env.CINELAB_DEBUG_PORT ?? '9222'}/json/list`)).json()
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

const handles = JSON.parse(
  await evaluate(`JSON.stringify({
    rights: [...document.querySelectorAll('.cnode__handle--right')].map((el) => {
      const r = el.getBoundingClientRect()
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
    }),
    lefts: [...document.querySelectorAll('.cnode__handle--left')].map((el) => {
      const r = el.getBoundingClientRect()
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
    })
  })`)
)

const fromIndex = Number(process.argv[2] ?? 0)
const toIndex = Number(process.argv[3] ?? 1)
const start = handles.rights[fromIndex]
const end = handles.lefts[toIndex]

if (!start || !end) {
  console.error('handle not found', JSON.stringify(handles))
  process.exit(1)
}

await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: start.x, y: start.y })
await new Promise((r) => setTimeout(r, 150))
await send('Input.dispatchMouseEvent', {
  type: 'mousePressed',
  x: start.x,
  y: start.y,
  button: 'left',
  buttons: 1,
  clickCount: 1
})

for (let step = 1; step <= 8; step += 1) {
  await send('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: start.x + ((end.x - start.x) * step) / 8,
    y: start.y + ((end.y - start.y) * step) / 8,
    button: 'left',
    buttons: 1
  })
  await new Promise((r) => setTimeout(r, 30))
}

await send('Input.dispatchMouseEvent', {
  type: 'mouseReleased',
  x: end.x,
  y: end.y,
  button: 'left',
  buttons: 0,
  clickCount: 1
})

await new Promise((r) => setTimeout(r, 500))

const state = await evaluate(
  `JSON.stringify({ edges: document.querySelectorAll('.react-flow__edge').length })`
)

console.log(JSON.stringify({ handles, edges: state }))
ws.close()
process.exit(0)
