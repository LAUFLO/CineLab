import type { AgentProposal, AgentProposalStatus } from './agent'
import type { Capability, ParamDef } from './provider-schema'

export const PROPOSAL_TTL_MS = 10 * 60 * 1000

export function proposalExpiresAt(now = Date.now()): string {
  return new Date(now + PROPOSAL_TTL_MS).toISOString()
}

export function isProposalExpired(
  proposal: Pick<AgentProposal, 'expiresAt'>,
  now = Date.now()
): boolean {
  const expiresAt = Date.parse(proposal.expiresAt)
  return !Number.isFinite(expiresAt) || expiresAt <= now
}

export interface NormalizedParams {
  params: Record<string, unknown>
  issues: string[]
}

function normalizeParam(
  def: ParamDef,
  raw: unknown,
  issues: string[]
): unknown {
  if (raw === undefined) return undefined

  if (def.type === 'select') {
    const value = String(raw)
    const allowed = (def.options ?? []).some(
      (option) => String(option.value) === value
    )
    if (!allowed && !def.allowCustom) {
      issues.push(
        `参数 ${def.key} 的值 ${value} 不在允许范围内：${(def.options ?? [])
          .map((option) => String(option.value))
          .join(' / ')}`
      )
      return undefined
    }
    return value
  }

  if (def.type === 'number') {
    const value = Number(raw)
    if (!Number.isFinite(value)) {
      issues.push(`参数 ${def.key} 必须是数字`)
      return undefined
    }
    if (def.min !== undefined && value < def.min) {
      issues.push(`参数 ${def.key} 不能小于 ${def.min}`)
      return undefined
    }
    if (def.max !== undefined && value > def.max) {
      issues.push(`参数 ${def.key} 不能大于 ${def.max}`)
      return undefined
    }
    return value
  }

  if (def.type === 'boolean') {
    if (typeof raw === 'boolean') return raw
    if (raw === 'true') return true
    if (raw === 'false') return false
    issues.push(`参数 ${def.key} 必须是布尔值`)
    return undefined
  }

  const value = String(raw)
  if (value.length > 10000) {
    issues.push(`参数 ${def.key} 过长`)
    return undefined
  }
  return value
}

/**
 * 按模型参数定义规范化生成参数：
 * - 补齐默认值
 * - 校验类型、枚举和范围
 * - 拒绝模型未声明的参数
 */
export function normalizeGenerationParams(
  defs: ParamDef[],
  input: Record<string, unknown> | undefined
): NormalizedParams {
  const issues: string[] = []
  const params: Record<string, unknown> = {}
  const source = input ?? {}

  if (typeof source !== 'object' || Array.isArray(source)) {
    return { params, issues: ['params 必须是对象'] }
  }

  const known = new Set(defs.map((def) => def.key))
  for (const key of Object.keys(source)) {
    if (!known.has(key)) {
      issues.push(`模型没有声明参数 ${key}`)
    }
  }

  for (const def of defs) {
    const hasInput = Object.prototype.hasOwnProperty.call(source, def.key)
    const raw = hasInput ? source[def.key] : def.defaultValue
    if (raw === undefined) continue

    const value = normalizeParam(def, raw, issues)
    if (value !== undefined) params[def.key] = value
  }

  return { params, issues }
}

/** 本次生成会产出的媒体数量；只支持模型自身声明了数量参数的情况 */
export function proposalCount(
  capability: Capability,
  params: Record<string, unknown>
): number {
  if (capability !== 'image.t2i' && capability !== 'image.i2i') return 1
  const value = Number(params.n)
  if (!Number.isFinite(value)) return 1
  return Math.min(8, Math.max(1, Math.round(value)))
}

const STATUS_LABEL: Record<AgentProposalStatus, string> = {
  pending: '待确认',
  submitting: '提交中',
  submitted: '已提交',
  completed: '已完成',
  failed: '失败',
  cancelled: '已取消',
  expired: '已失效'
}

export function proposalStatusLabel(status: AgentProposalStatus): string {
  return STATUS_LABEL[status] ?? status
}
