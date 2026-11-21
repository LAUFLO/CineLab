import { describe, expect, it } from 'vitest'
import type { ModelDef } from '../provider-schema'
import {
  contractForAdapter,
  contractGapsForAdapter,
  isOfficialModel
} from '../model-contracts'
import { effectiveCapabilities } from '../capabilities'

const agnesModel: ModelDef = {
  id: 'agnes-video-2.5',
  name: 'Agnes Video 2.5',
  capability: 'video.t2v',
  remoteModel: 'agnes-video-2.5',
  adapter: 'agnes-video',
  modes: ['t2v', 'first-frame', 'first-last', 'reference'],
  params: []
}

const soraFirstLast: ModelDef = {
  id: 'sora-2',
  name: 'Sora 2',
  capability: 'video.t2v',
  remoteModel: 'sora-2',
  adapter: 'sora-video',
  modes: ['t2v', 'first-last'],
  params: []
}

describe('model contracts', () => {
  it('resolves official contracts by adapter', () => {
    expect(contractForAdapter('agnes-video')?.fields.firstFrame).toBe(
      'first_frame'
    )
    expect(contractForAdapter('minimax-video')?.roles.lastFrame).toBe(
      'last_frame'
    )
    expect(contractForAdapter('custom-adapter')).toBeNull()
  })

  it('reports a missing last-frame field for a contract without it', () => {
    const gaps = contractGapsForAdapter('sora-video', soraFirstLast)

    expect(gaps).toHaveLength(1)
    expect(gaps[0]).toMatchObject({
      kind: 'contract',
      value: 'lastFrame'
    })
  })

  it('accepts keyframe modes when the contract has both fields', () => {
    expect(contractGapsForAdapter('agnes-video', agnesModel)).toEqual([])
  })

  it('exposes the contract and merges contract gaps into capabilities', () => {
    const agnes = effectiveCapabilities(agnesModel)
    expect(agnes.contract?.adapter).toBe('agnes-video')

    const sora = effectiveCapabilities(soraFirstLast)
    expect(sora.gaps.some((gap) => gap.kind === 'contract')).toBe(true)
  })

  it('distinguishes official models from user models', () => {
    expect(isOfficialModel({ ...agnesModel, preset: 'agnes-video-2.5' })).toBe(
      true
    )
    expect(
      isOfficialModel({
        ...agnesModel,
        source: { kind: 'manual' }
      })
    ).toBe(false)
  })
})
