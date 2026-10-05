/** One event serializer used by standalone and SDK; no DOM values cross preview boundary. */
export function cleanEventPayload(value: unknown): unknown {
  const seen = new WeakSet<object>()
  /** Flatten WebIDL accessors; only active ancestors count as cycles, preserving shared values. */
  function visit(value: unknown, depth = 0): unknown {
    if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) return typeof value === 'number' && !Number.isFinite(value) ? null : value
    if (typeof value === 'bigint') return String(value)
    if (typeof value !== 'object') return undefined
    if (typeof Node !== 'undefined' && value instanceof Node) return 'Node'
    if (typeof Window !== 'undefined' && value instanceof Window) return 'Window'
    if (seen.has(value)) return '[Circular]'
    if (depth > 50) return '[Depth limit]'
    seen.add(value)
    try {
      if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString() : null
      if (Array.isArray(value)) return value.map(item => visit(item, depth + 1) ?? null)
      const result: Record<string, unknown> = Object.create(null)
      for (const key in value) {
        try {
          const item = visit((value as Record<string, unknown>)[key], depth + 1)
          if (item !== undefined) Object.defineProperty(result, key, { value: item, enumerable: true, configurable: true, writable: true })
        }
        catch { result[key] = '[Unavailable]' }
      }
      return result
    }
    finally { seen.delete(value) }
  }
  return visit(value) ?? null
}
