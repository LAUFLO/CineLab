import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  net: { fetch: vi.fn() }
}))

import { net } from 'electron'
import { COMPONENTS, fetchManifest } from '../manifest'
import { MODEL_FILES } from '../installer'

const fetchMock = vi.mocked(net.fetch)

function manifestResponse(overrides: Record<string, unknown> = {}): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      version: 2,
      kind: 'vision-models',
      platform: 'portable',
      size: 10,
      expandedSize: 10,
      sha256: 'a'.repeat(64),
      urls: ['https://example.com/vision-models-v2.zip'],
      files: 3,
      ...overrides
    })
  } as unknown as Response
}

beforeEach(() => {
  fetchMock.mockReset()
})

describe('fetchManifest platform matching', () => {
  it('accepts portable manifests on the current platform', async () => {
    fetchMock.mockResolvedValueOnce(manifestResponse())

    const result = await fetchManifest(COMPONENTS['vision-models'])

    expect(result.version).toBe(2)
    expect(result.platform).toBe('portable')
  })

  it('accepts a manifest for the current platform', async () => {
    fetchMock.mockResolvedValueOnce(
      manifestResponse({ platform: `${process.platform}-${process.arch}` })
    )

    const result = await fetchManifest(COMPONENTS['vision-models'])

    expect(result.version).toBe(2)
  })

  it('falls back when the manifest targets another platform', async () => {
    const otherPlatform =
      process.platform === 'win32' ? 'darwin-arm64' : 'win32-x64'
    fetchMock.mockResolvedValueOnce(
      manifestResponse({ platform: otherPlatform })
    )

    const result = await fetchManifest(COMPONENTS['vision-models'])

    expect(result).toBe(COMPONENTS['vision-models'].fallback)
  })
})

describe('stem model component', () => {
  it('is a single-file model component with a pinned hash', () => {
    const component = COMPONENTS['stem-model']
    expect(component.directory).toBe('stem-model')
    expect(component.manifestUrl).toContain('stem-model')
    expect(component.fallback.size).toBe(84_141_911)
    expect(component.fallback.sha256).toBe(
      '8726e21a993978c7ba086d3872e7608d7d5bfca646ca4aca459ffda844faa8b4'
    )
    expect(component.fallback.urls.length).toBeGreaterThanOrEqual(2)
    expect(MODEL_FILES['stem-model']).toBe('htdemucs.th')
  })
})
