import { createServer } from 'node:http'

const video = Buffer.from('mock-video-bytes')
const tasks = new Map()
const requests = []

function json(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json' })
  response.end(JSON.stringify(body))
}

function readBody(request) {
  return new Promise((resolve) => {
    let body = ''
    request.on('data', (chunk) => {
      body += chunk
    })
    request.on('end', () => {
      try {
        resolve(JSON.parse(body))
      } catch {
        resolve(body)
      }
    })
  })
}

function createTask(kind) {
  const id = `${kind}_${Date.now()}`
  tasks.set(id, { kind, polls: 0 })
  return id
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`)
  const path = url.pathname
  const body = request.method === 'POST' ? await readBody(request) : null

  requests.push({
    method: request.method,
    path,
    authorization: request.headers.authorization ?? null,
    body
  })
  if (requests.length > 20) requests.shift()

  if (path === '/mock/video.mp4') {
    response.writeHead(200, { 'Content-Type': 'video/mp4' })
    response.end(video)
    return
  }

  if (path === '/debug/last') {
    json(response, 200, requests)
    return
  }

  if (request.method === 'POST' && path === '/videos/generations') {
    const id = createTask('zhipu')
    json(response, 200, { id, task_status: 'PROCESSING' })
    return
  }

  if (request.method === 'GET' && path.startsWith('/async-result/')) {
    const id = path.split('/').pop()
    const task = tasks.get(id)
    if (!task) return json(response, 404, { message: 'task not found' })
    task.polls += 1
    if (task.polls < 2) {
      return json(response, 200, { id, task_status: 'PROCESSING' })
    }
    return json(response, 200, {
      id,
      task_status: 'SUCCESS',
      video_result: [{ url: `${url.origin}/mock/video.mp4` }]
    })
  }

  if (
    request.method === 'POST' &&
    (path === '/ent/v2/text2video' ||
      path === '/ent/v2/img2video' ||
      path === '/ent/v2/character2video')
  ) {
    const id = createTask('vidu')
    json(response, 200, { task_id: id, state: 'created' })
    return
  }

  if (request.method === 'GET' && path.startsWith('/ent/v2/tasks/')) {
    const id = path.split('/')[4]
    const task = tasks.get(id)
    if (!task) return json(response, 404, { message: 'task not found' })
    task.polls += 1
    if (task.polls < 2) {
      return json(response, 200, { id, state: 'processing' })
    }
    return json(response, 200, {
      id,
      state: 'success',
      creations: [{ id: 'creation_1', url: `${url.origin}/mock/video.mp4` }]
    })
  }

  if (request.method === 'POST' && path === '/v2/video_generation') {
    const id = createTask('minimax-h3')
    json(response, 200, { task_id: id })
    return
  }

  if (request.method === 'GET' && path.startsWith('/v2/query/video_generation/')) {
    const id = path.split('/').pop()
    const task = tasks.get(id)
    if (!task) return json(response, 404, { message: 'task not found' })
    task.polls += 1
    if (task.polls < 2) {
      return json(response, 200, { task: { id, status: 'processing' } })
    }
    return json(response, 200, {
      task: {
        id,
        status: 'succeeded',
        content: { url: `${url.origin}/mock/video.mp4` }
      }
    })
  }

  if (request.method === 'POST' && path === '/v1/video_generation') {
    const id = createTask('minimax-legacy')
    json(response, 200, {
      task_id: id,
      base_resp: { status_code: 0, status_msg: 'success' }
    })
    return
  }

  if (request.method === 'GET' && path === '/v1/query/video_generation') {
    const id = url.searchParams.get('task_id')
    const task = tasks.get(id)
    if (!task) return json(response, 404, { message: 'task not found' })
    task.polls += 1
    if (task.polls < 2) {
      return json(response, 200, {
        task_id: id,
        status: 'Processing',
        base_resp: { status_code: 0, status_msg: 'success' }
      })
    }
    return json(response, 200, {
      task_id: id,
      status: 'Success',
      file_id: 'file_1',
      base_resp: { status_code: 0, status_msg: 'success' }
    })
  }

  if (request.method === 'GET' && path === '/v1/files/retrieve') {
    json(response, 200, {
      file: { download_url: `${url.origin}/mock/video.mp4` },
      base_resp: { status_code: 0, status_msg: 'success' }
    })
    return
  }

  if (
    request.method === 'POST' &&
    (path === '/v1/videos/text2video' || path === '/v1/videos/image2video')
  ) {
    const id = createTask('kling')
    json(response, 200, {
      code: 0,
      message: 'SUCCEED',
      data: { task_id: id, task_status: 'submitted' }
    })
    return
  }

  if (
    request.method === 'GET' &&
    (path.startsWith('/v1/videos/text2video/') ||
      path.startsWith('/v1/videos/image2video/'))
  ) {
    const id = path.split('/').pop()
    const task = tasks.get(id)
    if (!task) return json(response, 404, { message: 'task not found' })
    task.polls += 1
    if (task.polls < 2) {
      return json(response, 200, {
        code: 0,
        data: { task_id: id, task_status: 'processing' }
      })
    }
    return json(response, 200, {
      code: 0,
      data: {
        task_id: id,
        task_status: 'succeed',
        task_result: { videos: [{ url: `${url.origin}/mock/video.mp4` }] }
      }
    })
  }

  json(response, 404, { message: 'not found' })
})

server.listen(8788, '127.0.0.1', () => {
  console.log('mock video listening on http://127.0.0.1:8788')
})
