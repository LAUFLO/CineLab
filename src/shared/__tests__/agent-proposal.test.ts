import { describe, expect, it } from 'vitest'
import type { AgentProposal } from '../agent'
import {
  isProposalExpired,
  normalizeGenerationParams,
  proposalCount,
  proposalExpiresAt,
  proposalStatusLabel
} from '../agent-proposal'
import type { ParamDef } from '../provider-schema'

const params: ParamDef[] = [
  {
    key: 'ratio',
    label: '比例',
    type: 'select',
    options: [
      { value: '16:9', label: '16:9' },
      { value: '1:1', label: '1:1' }
    ],
    defaultValue: '16:9'
  },
  {
    key: 'n',
    label: '数量',
    type: 'number',
    defaultValue: 1,
    min: 1,
    max: 4
  },
  {
    key: 'watermark',
    label: '水印',
    type: 'boolean',
    defaultValue: false
  },
  {
    key: 'duration',
    label: '时长',
    type: 'select',
    options: [
      { value: '5', label: '5s' },
      { value: '10', label: '10s' }
    ],
    defaultValue: '5'
  }
]

describe('normalizeGenerationParams', () => {
  it('fills defaults and converts boolean strings', () => {
    const result = normalizeGenerationParams(params, {
      ratio: '1:1',
      watermark: 'true'
    })

    expect(result.issues).toEqual([])
    expect(result.params).toEqual({
      ratio: '1:1',
      n: 1,
      watermark: true,
      duration: '5'
    })
  })

  it('rejects unknown params', () => {
    const result = normalizeGenerationParams(params, { size: '2K' })
    expect(result.issues).toContain('模型没有声明参数 size')
  })

  it('rejects enum values outside the definition', () => {
    const result = normalizeGenerationParams(params, { ratio: '3:2' })
    expect(result.issues[0]).toContain('ratio')
  })

  it('accepts custom values only when allowCustom is set', () => {
    const custom = params.map((param) =>
      param.key === 'ratio' ? { ...param, allowCustom: true } : param
    )
    const result = normalizeGenerationParams(custom, { ratio: '3:2' })
    expect(result.issues).toEqual([])
    expect(result.params.ratio).toBe('3:2')
  })

  it('rejects numbers outside min and max', () => {
    const result = normalizeGenerationParams(params, { n: 9 })
    expect(result.issues[0]).toContain('不能大于 4')
  })

  it('rejects non numeric values for number params', () => {
    const result = normalizeGenerationParams(params, { n: 'abc' })
    expect(result.issues[0]).toContain('必须是数字')
  })
})

describe('proposalCount', () => {
  it('uses the n param for image models', () => {
    expect(proposalCount('image.t2i', { n: 3 })).toBe(3)
    expect(proposalCount('image.i2i', { n: 12 })).toBe(8)
  })

  it('always returns one for video and audio', () => {
    expect(proposalCount('video.t2v', { n: 3 })).toBe(1)
    expect(proposalCount('audio.tts', {})).toBe(1)
  })
})

describe('proposal expiry', () => {
  it('marks proposals past expiresAt as expired', () => {
    const now = Date.parse('2026-01-01T00:00:00.000Z')
    const proposal = {
      expiresAt: new Date(now - 1).toISOString()
    } as AgentProposal
    expect(isProposalExpired(proposal, now)).toBe(true)
  })

  it('keeps proposals inside the ttl', () => {
    const now = Date.parse('2026-01-01T00:00:00.000Z')
    const proposal = {
      expiresAt: proposalExpiresAt(now)
    } as AgentProposal
    expect(isProposalExpired(proposal, now)).toBe(false)
  })

  it('provides status labels', () => {
    expect(proposalStatusLabel('pending')).toBe('待确认')
    expect(proposalStatusLabel('expired')).toBe('已失效')
  })
})
