import { describe, expect, it } from 'vitest'
import type { AgentProposal } from '../agent'
import {
  estimateProposalCost,
  formatProposalCost,
  isProposalExpired,
  normalizeGenerationParams,
  proposalCount,
  proposalExpiresAt,
  proposalStatusLabel
} from '../agent-proposal'
import type { ModelDef, ParamDef } from '../provider-schema'

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

function model(overrides: Partial<ModelDef> = {}): ModelDef {
  return {
    id: 'model-1',
    name: '测试模型',
    capability: 'image.t2i',
    remoteModel: 'model-1',
    params,
    ...overrides
  }
}

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

describe('estimateProposalCost', () => {
  const request = {
    nodeId: 'node-1',
    modelKey: 'p/m',
    prompt: 'cat',
    params: { duration: '10', n: 2 }
  }

  it('returns null when pricing is missing', () => {
    expect(estimateProposalCost(model(), request, 2)).toBeNull()
  })

  it('charges per request', () => {
    expect(
      estimateProposalCost(
        model({ pricing: { currency: 'CNY', unit: 'request', amount: 0.2 } }),
        request,
        2
      )
    ).toEqual({ amount: 0.2, currency: 'CNY', unit: 'request' })
  })

  it('charges per image using count', () => {
    expect(
      estimateProposalCost(
        model({ pricing: { currency: 'USD', unit: 'image', amount: 0.1 } }),
        request,
        3
      )
    ).toEqual({ amount: 0.3, currency: 'USD', unit: 'image' })
  })

  it('charges per second using duration', () => {
    expect(
      estimateProposalCost(
        model({
          capability: 'video.t2v',
          pricing: { currency: 'CNY', unit: 'second', amount: 0.05 }
        }),
        request,
        1
      )
    ).toEqual({ amount: 0.5, currency: 'CNY', unit: 'second' })
  })

  it('supports seconds as the duration param name', () => {
    expect(
      estimateProposalCost(
        model({
          capability: 'video.t2v',
          pricing: { currency: 'CNY', unit: 'second', amount: 0.05 }
        }),
        { ...request, params: { seconds: '6' } },
        1
      )
    ).toEqual({ amount: 0.3, currency: 'CNY', unit: 'second' })
  })

  it('cannot estimate token pricing', () => {
    expect(
      estimateProposalCost(
        model({
          capability: 'text.chat',
          pricing: { currency: 'CNY', unit: '1k-tokens', amount: 0.01 }
        }),
        request,
        1
      )
    ).toBeNull()
  })

  it('formats known and unknown costs', () => {
    expect(formatProposalCost(null)).toBe('未配置单价')
    expect(
      formatProposalCost({ amount: 0.2, currency: 'CNY', unit: 'request' })
    ).toBe('¥0.2 CNY')
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
