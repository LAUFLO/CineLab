import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  net: { fetch: vi.fn() }
}))

import { COMPONENTS } from '../manifest'
import { MODEL_FILES } from '../installer'

describe('stem model component', () => {
  it('is a single-file model component with a pinned hash', () => {
    const component = COMPONENTS['stem-model']
    expect(component.directory).toBe('stem-model')
    expect(component.manifestUrl).toBeUndefined()
    expect(component.fallback.size).toBe(84_141_911)
    expect(component.fallback.sha256).toBe(
      '8726e21a993978c7ba086d3872e7608d7d5bfca646ca4aca459ffda844faa8b4'
    )
    expect(component.fallback.urls.length).toBeGreaterThanOrEqual(2)
    expect(MODEL_FILES['stem-model']).toBe('htdemucs.th')
  })
})
