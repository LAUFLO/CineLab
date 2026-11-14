import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  root: '',
  project: '',
  handlers: new Map<string, (request: Request) => Promise<Response>>()
}))

vi.mock('electron', () => ({
  protocol: {
    registerSchemesAsPrivileged: vi.fn(),
    handle: (
      scheme: string,
      handler: (request: Request) => Promise<Response>
    ) => {
      state.handlers.set(scheme, handler)
    }
  }
}))

vi.mock('../project/manager', () => ({
  getCurrentProjectRoot: () => state.project
}))

vi.mock('../library/config', () => ({
  getLibraryRoot: async () => state.root
}))

import { ASSET_SCHEME, registerAssetProtocol } from '../protocol'

describe('asset protocol', () => {
  let root: string

  beforeEach(async () => {
    root = await fs.mkdtemp(join(tmpdir(), 'cinelab-protocol-'))
    state.root = root
    state.project = root
    state.handlers.clear()

    await fs.mkdir(join(root, 'assets'), { recursive: true })
    await fs.writeFile(join(root, 'assets', 'hello.txt'), 'hello world')
    await fs.writeFile(join(root, 'secret.txt'), 'secret')

    registerAssetProtocol()
  })

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true })
  })

  const handler = (): ((request: Request) => Promise<Response>) => {
    const fn = state.handlers.get(ASSET_SCHEME)
    if (!fn) throw new Error('protocol handler not registered')
    return fn
  }

  it('serves files with the correct content type', async () => {
    const response = await handler()(
      new Request('cinelab-asset://local/assets/hello.txt')
    )
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('text/plain')
    expect(await response.text()).toBe('hello world')
  })

  it('handles HEAD and byte ranges', async () => {
    const head = await handler()(
      new Request('cinelab-asset://local/assets/hello.txt', {
        method: 'HEAD'
      })
    )
    expect(head.status).toBe(200)
    expect(head.headers.get('Content-Length')).toBe('11')

    const range = await handler()(
      new Request('cinelab-asset://local/assets/hello.txt', {
        headers: { Range: 'bytes=0-4' }
      })
    )
    expect(range.status).toBe(206)
    expect(range.headers.get('Content-Range')).toBe('bytes 0-4/11')
    expect(await range.text()).toBe('hello')
  })

  it('rejects unknown hosts, missing files and traversal paths', async () => {
    const badHost = await handler()(
      new Request('cinelab-asset://other/hello.txt')
    )
    expect(badHost.status).toBe(404)

    const missing = await handler()(
      new Request('cinelab-asset://local/assets/missing.txt')
    )
    expect(missing.status).toBe(404)

    const traversal = await handler()(
      new Request('cinelab-asset://local/%2e%2e%2fsecret.txt')
    )
    expect([403, 404]).toContain(traversal.status)
  })
})
