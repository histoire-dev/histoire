import { randomBytes } from 'node:crypto'
import { getSandboxRelativeUrl, normalizePreviewBase } from '@histoire/shared'
import { renderPreviewScript } from './preview-script.js'

/** Trusted target resolved from dev catalog or immutable Node manifest. */
export interface PreviewHostTarget {
  /** Actual listener origin used for browser navigation. */
  origin: string
  /** Exact story, never a URL or source path. */
  storyId: string
  /** Exact scoped variant. */
  variantId: string
  /** Current process-owned epoch. */
  epoch: string
  /** Validated iframe width. */
  width: number
  /** Validated iframe height. */
  height: number
  /** Existing Histoire color preference. */
  colorScheme?: 'light' | 'dark'
  /** Configured initial preview background. */
  backgroundColor: string
  /** Existing preview text direction. */
  textDirection: 'ltr' | 'rtl'
  /** Captured runtime ownership guard. */
  isActive: () => boolean
}

/** Expiring same-origin host registry, independent of Vite and MCP transports. */
export function createPreviewHostRegistry(options: { base: string }) {
  const base = normalizePreviewBase(options.base)
  const prefix = `${base}__histoire/preview/`
  const targets = new Map<string, PreviewHostTarget & { nonce: string }>()
  let closed = false
  return {
    /** Dedicated prefix lets HTTP adapters reject expired routes before fallback. */
    prefix,
    /** Acquire a random route only after an operation reaches the execution lane. */
    open(target: PreviewHostTarget) {
      if (closed || !target.isActive()) throw new Error('Preview host is inactive')
      const origin = new URL(target.origin)
      if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password) throw new Error('Preview host origin is invalid')
      const nonce = randomBytes(32).toString('hex')
      const path = `${prefix}${nonce}.html`
      targets.set(path, { ...target, origin: origin.origin, nonce })
      return { nonce, url: new URL(path, origin.origin).href, close: () => targets.delete(path) }
    },
    /** Match exact raw route; query, traversal and expired leases have no document. */
    render(path: string): string | undefined {
      const target = targets.get(path)
      if (!target?.isActive()) {
        targets.delete(path)
        return
      }
      const sandboxUrl = new URL(getSandboxRelativeUrl({ base, storyId: target.storyId, variantId: target.variantId }), target.origin)
      sandboxUrl.searchParams.set('mcpNonce', target.nonce)
      sandboxUrl.searchParams.set('mcpEpoch', target.epoch)
      const script = renderPreviewScript({ authority: { origin: new URL(target.origin).origin, storyId: target.storyId, variantId: target.variantId, nonce: target.nonce, epoch: target.epoch, active: true }, sandboxUrl: sandboxUrl.href, settings: { responsiveWidth: target.width, responsiveHeight: target.height, rotate: false, backgroundColor: target.backgroundColor, checkerboard: false, textDirection: target.textDirection }, colorScheme: target.colorScheme })
      return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;overflow:hidden"><script>${script}</script></body></html>`
    },
    /** All old capabilities cease serving immediately on generation release. */
    close() {
      closed = true
      targets.clear()
    },
  }
}

/** Shared registry shape accepted by standalone production routing. */
export type PreviewHostRegistry = ReturnType<typeof createPreviewHostRegistry>
