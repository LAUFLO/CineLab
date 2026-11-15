import type { ModelModeId } from './model-modes'
import type {
  ParamCondition,
  ParamDef,
  ParamDeny,
  ParamForce
} from './provider-schema'

export interface ParamEvalContext {
  mode?: ModelModeId
  values: Record<string, unknown>
}

function matchesCondition(
  condition: ParamCondition | undefined,
  context: ParamEvalContext
): boolean {
  if (!condition) return false
  if (condition.mode && condition.mode !== context.mode) return false

  if (condition.params) {
    for (const [key, value] of Object.entries(condition.params)) {
      if (String(context.values[key] ?? '') !== String(value ?? '')) {
        return false
      }
    }
  }

  return true
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

export interface EvaluatedParam {
  visible: boolean
  forcedValue?: unknown
  deniedValues: unknown[]
  forbidden: boolean
}

export function evaluateParam(
  param: ParamDef,
  context: ParamEvalContext
): EvaluatedParam {
  let visible = true

  if (param.appliesTo && param.appliesTo.length > 0) {
    visible = Boolean(
      context.mode && param.appliesTo.includes(context.mode)
    )
  }

  if (visible && param.when) {
    visible = matchesCondition(param.when, context)
  }

  const forces = asArray<ParamForce>(param.force).filter((force) =>
    matchesCondition(force.when, context)
  )
  const denies = asArray<ParamDeny>(param.deny).filter((deny) =>
    matchesCondition(deny.when, context)
  )

  const forbidden = Boolean(
    param.forbid?.some((key) => {
      const value = context.values[key]
      return value !== undefined && value !== null && value !== ''
    })
  )

  return {
    visible,
    ...(forces.length > 0
      ? { forcedValue: forces[forces.length - 1].value }
      : {}),
    deniedValues: denies.flatMap((deny) => deny.values),
    forbidden
  }
}

/**
 * 过滤当前模式下不可见的参数，并应用 force 锁定值。
 * deny 由调用方用于过滤选项和校验输入。
 */
export function applyParamConstraints(
  params: ParamDef[],
  context: ParamEvalContext
): { params: ParamDef[]; values: Record<string, unknown> } {
  const values = { ...context.values }
  const visible: ParamDef[] = []

  for (const param of params) {
    const evaluated = evaluateParam(param, { ...context, values })
    if (!evaluated.visible || evaluated.forbidden) continue

    visible.push(param)
    if (evaluated.forcedValue !== undefined) {
      values[param.key] = evaluated.forcedValue
    }
  }

  return { params: visible, values }
}
