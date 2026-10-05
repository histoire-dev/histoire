import type { UiAgentContextOptions } from '@histoire/shared'
import type { AcpPromptContext } from './types.js'
import { Buffer } from 'node:buffer'

/** Only credential-free HTTP endpoints may be advertised to ACP sessions. */
export function safeMcpEndpoint(endpoint?: string): string | undefined {
  if (!endpoint) return
  try {
    const url = new URL(endpoint)
    if (['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash) return url.href
  }
  catch { /* Unavailable endpoint contributes no prompt context. */ }
}

/** Builds bounded comment context, respecting each local sharing preference. */
export function buildPromptContext(context: AcpPromptContext = {}, options: UiAgentContextOptions, endpoint?: string): string {
  const result: Record<string, unknown> = {}
  if (context.storyId) result.storyId = context.storyId
  if (context.variantId) result.variantId = context.variantId
  if (context.selector) result.selector = context.selector
  if (options.includeSource) {
    if (context.props) result.props = context.props
    if (context.source) result.source = context.source
  }
  if (options.attachScreenshot && context.screenshot) result.screenshot = context.screenshot
  const mcp = options.exposeMcp ? safeMcpEndpoint(endpoint) : undefined
  if (mcp) result.histoireMcpEndpoint = mcp
  const code = JSON.stringify(result)
  if (Buffer.byteLength(code) > 48 * 1024) throw new Error('Agent prompt context exceeds 48 KB')
  return `Histoire context: ${code}`
}
