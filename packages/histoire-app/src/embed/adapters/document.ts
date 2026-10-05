import type { HistoireTarget } from '@histoire/protocol'

/** Plain HTTP can lack randomUUID; counter still separates same-tick allocations. */
let nextDocument = 0

/** Reused Explorer mount must never mint an identity retired by an earlier inner wrapper. */
export function createRuntimeDocumentId(mountId: string): string {
  const nonce = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${++nextDocument}-${Math.random().toString(36).slice(2)}`
  return `${mountId}:document:${nonce}`
}

/** Exact sandbox document owner; WindowProxy alone survives navigation. */
export function createRuntimeDocumentOwner() {
  let documentId: string | null = null
  let target: HistoireTarget | null = null
  let selectionVersion = 0
  return {
    /** Allocate before navigation; all previous replies become stale immediately. */
    replace(id: string, next: HistoireTarget) {
      documentId = id
      target = next
      selectionVersion = 0
    },
    /** Retained documents version new selection intent and replacement actors after reload. */
    select(next: HistoireTarget, restarted = false) {
      if (restarted || target?.storyId !== next.storyId || target.variantId !== next.variantId) selectionVersion++
      target = next
    },
    /** Story matches separately from variant; IDs may contain separators. */
    accepts(message: { documentId?: string, storyId?: string | null, variantId?: string | null }, anyVariant = false) {
      return documentId !== null && message.documentId === documentId && message.storyId === target?.storyId
        && (anyVariant || message.variantId === target?.variantId)
    },
    /** Delayed grid clicks cannot replace a newer host intent, even after target returns. */
    acceptsSelection(message: { documentId?: string, storyId?: string | null, variantId?: string | null, selectionVersion?: number }) {
      return this.accepts(message, true) && Number.isSafeInteger(message.selectionVersion) && message.selectionVersion === selectionVersion
    },
    /** Current host intent version, scoped to this exact document. */
    get selectionVersion() { return selectionVersion },
    /** Runtime identity used by requests and publications. */
    get id() { return documentId },
    /** Selected structured identity. */
    get target() { return target },
    /** Mark inactive before resource teardown. */
    close() {
      documentId = null
      target = null
    },
  }
}
