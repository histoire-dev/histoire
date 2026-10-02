/** Parse raw request path before URL normalization can erase traversal segments. */
export function publicRequestPath(raw: string, base: string): string | undefined {
  const path = raw.split('?')[0]
  if (!path.startsWith('/') || path.startsWith('//') || /[\\\0#]/.test(path)) return
  let decoded: string
  let decodedBase: string
  try {
    decoded = decodeURIComponent(path)
    decodedBase = decodeURIComponent(base)
  }
  catch { return }
  // Residual encoding is rejected rather than decoded again by another layer.
  // This prevents double-encoded path traversal and parser disagreement.
  if (/[\\\0%]/.test(decoded) || !decoded.startsWith(decodedBase)) return
  const relative = decoded.slice(decodedBase.length)
  const segments = relative.split('/')
  if (segments.some(segment => segment.startsWith('.')) || segments.includes('private') || segments.includes('server.mjs') || segments.includes('package.json') || segments[0] === '__histoire') return
  return relative
}

/** History fallback applies only to extensionless browser document navigation. */
export function isBookNavigation(path: string, accept: string | undefined): boolean {
  return !!accept?.split(',').some(value => value.trim().split(';')[0] === 'text/html') && !path.split('/').at(-1)?.includes('.') && !/^(?:api|assets|__histoire)(?:\/|$)/.test(path)
}
