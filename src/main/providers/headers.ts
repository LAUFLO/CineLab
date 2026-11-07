/**
 * 自定义请求头工具。
 *
 * provider.headers 中的值支持 ${ENV_NAME} 插值，避免额外 token 明文写入 models.json。
 * 合并顺序：基础头 → 自定义头，自定义头可以覆盖 Authorization 等默认值。
 */
export function resolveCustomHeaders(
  headers?: Record<string, string>
): Record<string, string> {
  const result: Record<string, string> = {}

  for (const [rawKey, rawValue] of Object.entries(headers ?? {})) {
    const key = rawKey.trim()
    if (!key) continue
    result[key] = rawValue.replace(
      /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g,
      (_match, name: string) => process.env[name] ?? ''
    )
  }

  return result
}

export function mergeHeaders(
  base: Record<string, string>,
  custom?: Record<string, string>
): Record<string, string> {
  return { ...base, ...resolveCustomHeaders(custom) }
}
