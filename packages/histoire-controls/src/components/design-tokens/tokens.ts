/** Format displayed/copyable token values without assuming string shape. */
export function formatTokenValue(value: unknown): string {
  if (typeof value === 'string') return value
  if (value === undefined) return ''
  return JSON.stringify(value) ?? String(value)
}

/** Literal case-insensitive search across name and original value. */
export function matchesToken(name: string, value: unknown, search = ''): boolean {
  const query = search.trim().toLocaleLowerCase()
  return !query || `${name}\n${formatTokenValue(value)}`.toLocaleLowerCase().includes(query)
}

/** Flatten nested color namespaces while retaining DEFAULT and ignoring null values. */
export function flattenTokenShades(shades: Record<string, unknown>, path = '', result: Record<string, string> = {}): Record<string, string> {
  for (const [key, color] of Object.entries(shades)) {
    const name = path ? key === 'DEFAULT' ? path : `${path}-${key}` : key
    if (color && typeof color === 'object' && !Array.isArray(color)) flattenTokenShades(color as Record<string, unknown>, name, result)
    else if (typeof color === 'string' || typeof color === 'number') result[name] = String(color)
  }
  return result
}

/** Normalize records once for grids/lists while preserving existing slot value contracts. */
export function processTokens(tokens: Record<string, any>, getName?: (key: string, value: any) => string, search?: string) {
  return Object.entries(tokens).map(([key, value]) => ({ key, name: getName ? getName(key, value) : key, value: typeof value === 'number' ? String(value) : value })).filter(token => matchesToken(token.name, token.value, search))
}
