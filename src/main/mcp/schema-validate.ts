/**
 * 轻量 JSON Schema 校验器。
 *
 * MCP 的 tools/call 在低层 Server 下不会自动校验参数，
 * 这里覆盖 CineLab 工具 schema 用到的关键字，避免用户先确认一个注定失败的请求。
 * 不追求完整 JSON Schema 规范；遇到未支持的关键字直接忽略。
 */

export interface JsonSchema {
  type?: string | string[]
  properties?: Record<string, JsonSchema>
  required?: string[]
  additionalProperties?: boolean | JsonSchema
  items?: JsonSchema
  enum?: unknown[]
  const?: unknown
  minimum?: number
  maximum?: number
  minLength?: number
  maxLength?: number
  minItems?: number
  maxItems?: number
  anyOf?: JsonSchema[]
  oneOf?: JsonSchema[]
  description?: string
  default?: unknown
  [key: string]: unknown
}

export type ValidationResult =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; error: string }

function typeOf(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  return typeof value
}

function matchesType(value: unknown, type: string): boolean {
  if (type === 'integer') {
    return typeof value === 'number' && Number.isInteger(value)
  }
  if (type === 'number') {
    return typeof value === 'number' && Number.isFinite(value)
  }
  return typeOf(value) === type
}

function validateValue(
  schema: JsonSchema,
  value: unknown,
  path: string
): string | null {
  if (schema.enum && !schema.enum.some((item) => item === value)) {
    return `${path} 必须是 ${schema.enum.map(String).join(' / ')} 之一`
  }
  if ('const' in schema && schema.const !== value) {
    return `${path} 必须是 ${String(schema.const)}`
  }

  if (schema.anyOf || schema.oneOf) {
    const branches = schema.anyOf ?? schema.oneOf ?? []
    const errors = branches.map((branch) =>
      validateValue(branch, value, path)
    )
    if (!errors.some((error) => error === null)) {
      return `${path} 不满足任一允许的结构：${errors[0]}`
    }
    return null
  }

  const types = schema.type
    ? Array.isArray(schema.type)
      ? schema.type
      : [schema.type]
    : []

  if (types.length > 0 && !types.some((type) => matchesType(value, type))) {
    return `${path} 必须是 ${types.join(' 或 ')}`
  }

  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      return `${path} 长度不能少于 ${schema.minLength}`
    }
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      return `${path} 长度不能超过 ${schema.maxLength}`
    }
  }

  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) {
      return `${path} 不能小于 ${schema.minimum}`
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      return `${path} 不能大于 ${schema.maximum}`
    }
  }

  if (Array.isArray(value) && schema.items) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      return `${path} 至少需要 ${schema.minItems} 项`
    }
    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      return `${path} 最多允许 ${schema.maxItems} 项`
    }
    for (let index = 0; index < value.length; index += 1) {
      const error = validateValue(
        schema.items,
        value[index],
        `${path}[${index}]`
      )
      if (error) return error
    }
  }

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>
    for (const key of schema.required ?? []) {
      if (!(key in record)) {
        return `${path}.${key} 是必填项`
      }
    }
    for (const [key, item] of Object.entries(record)) {
      const property = schema.properties?.[key]
      if (property) {
        const error = validateValue(property, item, `${path}.${key}`)
        if (error) return error
        continue
      }
      if (schema.additionalProperties === false) {
        return `${path}.${key} 不是允许的参数`
      }
      if (
        schema.additionalProperties &&
        typeof schema.additionalProperties === 'object'
      ) {
        const error = validateValue(
          schema.additionalProperties,
          item,
          `${path}.${key}`
        )
        if (error) return error
      }
    }
  }

  return null
}

export function validateJsonSchema(
  schema: JsonSchema,
  input: unknown
): ValidationResult {
  const value =
    input === undefined || input === null
      ? {}
      : input

  if (typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, error: '参数必须是对象' }
  }

  const error = validateValue(schema, value, '参数')
  if (error) return { ok: false, error }
  return { ok: true, value: value as Record<string, unknown> }
}
