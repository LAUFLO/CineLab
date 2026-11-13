const ALLOWED_PROTOCOLS = new Set(['http:', 'https:'])

/**
 * Only http(s) URLs may be handed to the operating system.
 * Everything else (file:, javascript:, data:, custom schemes) is rejected.
 */
export function isAllowedExternalUrl(raw: string): boolean {
  try {
    return ALLOWED_PROTOCOLS.has(new URL(raw).protocol)
  } catch {
    return false
  }
}
