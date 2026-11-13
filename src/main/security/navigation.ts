/**
 * Allow the initial document and Vite HMR navigations, but block page-initiated
 * navigation to other documents. External http(s) links are handled by the
 * window-open policy instead of navigating the renderer.
 */
export function isAllowedNavigation(
  currentUrl: string,
  nextUrl: string,
  devServerUrl?: string
): boolean {
  if (!currentUrl || !nextUrl) return false

  const current = stripHash(currentUrl)
  const next = stripHash(nextUrl)
  if (current === next) return true

  if (devServerUrl) {
    try {
      if (new URL(nextUrl).origin === new URL(devServerUrl).origin) return true
    } catch {
      // fall through and block
    }
  }

  return false
}

function stripHash(url: string): string {
  const index = url.indexOf('#')
  return index >= 0 ? url.slice(0, index) : url
}
