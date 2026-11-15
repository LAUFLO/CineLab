/**
 * 模板变量替换，http-template 与模型请求扩展共用。
 *
 * - `{{token}}` 独占整个字符串时返回原始值（保留数组、数字、布尔等类型）
 * - 字符串内嵌时转成字符串，未解析的变量替换为空串
 */
export type TemplateTokenResolver = (token: string) => unknown

const EXACT_TOKEN = /^\{\{\s*([\w.]+)\s*\}\}$/
const INLINE_TOKEN = /\{\{\s*([\w.]+)\s*\}\}/g

export function replaceTemplateVariables(
  value: unknown,
  resolve: TemplateTokenResolver
): unknown {
  if (typeof value === 'string') {
    const exact = EXACT_TOKEN.exec(value)
    if (exact) return resolve(exact[1])

    return value.replace(INLINE_TOKEN, (_match, token: string) => {
      const next = resolve(token)
      return next === undefined || next === null ? '' : String(next)
    })
  }

  if (Array.isArray(value)) {
    return value.map((item) => replaceTemplateVariables(item, resolve))
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        replaceTemplateVariables(item, resolve)
      ])
    )
  }

  return value
}

/** 从扁平变量表创建解析器，支持 `params.size` 这类点号路径 */
export function createTemplateResolver(
  vars: Record<string, unknown>
): TemplateTokenResolver {
  return (token) => {
    if (Object.prototype.hasOwnProperty.call(vars, token)) return vars[token]

    const [head, ...parts] = token.split('.')
    let current = vars[head]

    for (const part of parts) {
      if (current === null || current === undefined) return undefined
      if (Array.isArray(current)) {
        current = current[Number(part)]
      } else if (typeof current === 'object') {
        current = (current as Record<string, unknown>)[part]
      } else {
        return undefined
      }
    }

    return current
  }
}
