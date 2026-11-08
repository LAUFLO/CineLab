import { describe, expect, it } from 'vitest'
import { parseAgentPlan } from '../agent'

describe('parseAgentPlan', () => {
  it('parses a plain JSON plan', () => {
    const plan = parseAgentPlan(
      JSON.stringify({
        reply: '准备删除静音',
        intent: 'remove_silence',
        args: { paddingMs: 120 },
        needsConfirm: true
      })
    )

    expect(plan.intent).toBe('remove_silence')
    expect(plan.reply).toBe('准备删除静音')
    expect(plan.args).toEqual({ paddingMs: 120 })
    expect(plan.needsConfirm).toBe(true)
  })

  it('parses a fenced JSON plan with surrounding text', () => {
    const plan = parseAgentPlan(
      '好的，方案如下：\n```json\n{"reply":"切镜头","intent":"split_by_shots"}\n```'
    )
    expect(plan.intent).toBe('split_by_shots')
    expect(plan.reply).toBe('切镜头')
  })

  it('falls back to plain text for invalid JSON', () => {
    const plan = parseAgentPlan('我需要更多信息')
    expect(plan.intent).toBe('unsupported')
    expect(plan.reply).toBe('我需要更多信息')
    expect(plan.needsConfirm).toBe(false)
  })

  it('maps unknown intents to unsupported', () => {
    const plan = parseAgentPlan(
      JSON.stringify({ reply: '做点别的', intent: 'make_coffee' })
    )
    expect(plan.intent).toBe('unsupported')
  })

  it('defaults args and needsConfirm', () => {
    const plan = parseAgentPlan(
      JSON.stringify({ reply: '节拍', intent: 'beat_markers' })
    )
    expect(plan.args).toEqual({})
    expect(plan.needsConfirm).toBe(true)
  })
})
