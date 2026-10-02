import { normalizePreviewBase } from '@histoire/shared'

/** Node routes use one exact URL path spelling across assets, MCP and nonce hosts. */
export function normalizeNodeBase(value: string): string {
  let base: string
  try {
    base = normalizePreviewBase(value)
    const parsed = new URL(base, 'http://histoire.invalid')
    const decoded = decodeURIComponent(base)
    if (parsed.pathname !== base || /[\\\0%]/.test(decoded)) throw new Error('Noncanonical base')
  }
  catch { throw new Error('Node deployment base must be a canonical URL path; encode spaces and Unicode (for example /book%20space/)') }
  return base
}
