import { SANDBOX_READY, VARIANT_READY } from '@histoire/shared'

/** Exact document and target authority retained by one nonce host. */
export interface PreviewMessageAuthority {
  /** Actual loopback UI origin, never caller-supplied. */
  origin: string
  /** Exact registered story identity. */
  storyId: string
  /** Exact scoped variant identity. */
  variantId: string
  /** Random active host capability. */
  nonce: string
  /** Captured project generation. */
  epoch: string
  /** False after this document loses its lease. */
  active: boolean
}

/** Pure guard reused by generated host script and focused boundary tests. */
export function matchesPreviewMessage(event: { source: unknown, origin: string, data?: any }, frame: unknown, authority: PreviewMessageAuthority, identity: { nonce: string, epoch: string }, types: readonly string[] = [SANDBOX_READY, VARIANT_READY]): boolean {
  return authority.active
    && authority.nonce === identity.nonce && authority.epoch === identity.epoch
    && event.source === frame && event.origin === authority.origin
    && event.data?.__histoire === true && types.includes(event.data.type)
    && event.data.storyId === authority.storyId && event.data.variantId === authority.variantId
}
