import type { HistoireMeasureRelation, HistoireMeasureResult } from '@histoire/shared'
import type { CanvasPoint } from './pan/usePanZoom.js'
import { MEASURE_RESULT } from '@histoire/shared'
import { readonly, ref, shallowRef } from 'vue'

/** A measurement belongs to one exact physical preview and source publication. */
export interface MeasureOwner {
  /** Logical frame activation, distinct from retained physical document. */
  registration?: object
  /** Canvas registration key, including local matrix cell identity. */
  frameId: string
  /** Exact catalog story. */
  storyId: string
  /** Exact rendered variant, independent of canonical selection. */
  variantId: string
  /** Parent-minted physical document identity. */
  documentId: string
  /** Actual iframe WindowProxy, checked even when tuple matches. */
  source: Window
  /** Owning same-origin host. */
  origin: string
  /** Source epoch/revision and runtime readiness owner. */
  generation: string
}

/** Live measure tool state the overlay publishes for canvas chrome (hint bar). */
export interface CanvasMeasureState {
  /** Measurement is locked, so navigation applies. */
  locked: boolean
  /** Measured element has siblings to step through. */
  siblings: boolean
  /** Breadcrumb labels of the locked element, outermost first. */
  path: readonly string[]
  /** Move locked measurement to a related element; `depth` climbs several ancestors. */
  navigate: (relation: HistoireMeasureRelation, depth?: number) => void
  /** Release locked measurement. */
  unlock: () => void
}

/** Inspect a frame point, or navigate from a measured node token. */
export type MeasureQuery = CanvasPoint | { token: string, relation: HistoireMeasureRelation, depth?: number }

/** Ports retain registry authority; controller never addresses raw iframes. */
interface MeasureControllerOptions {
  /** Current ready owner or null when tool/preview is unavailable. */
  getOwner: () => MeasureOwner | null
  /** Post only through current frame registry, with bounded correlation. */
  post: (owner: MeasureOwner, requestId: string, query: MeasureQuery) => boolean
}

// Correlation only: retired component instances must never reuse request IDs.
let instanceCounter = 0

/** Compare lifetimes without confusing equal target IDs with equal documents. */
export function sameMeasureOwner(first: MeasureOwner | null, second: MeasureOwner | null): boolean {
  return first === second || Boolean(first && second && first.frameId === second.frameId && first.storyId === second.storyId
    && first.variantId === second.variantId && first.documentId === second.documentId && first.source === second.source
    && first.origin === second.origin && first.generation === second.generation && first.registration === second.registration)
}

/** Reject incomplete geometry before guide arithmetic can produce NaN. */
function isMeasureResult(value: unknown): value is HistoireMeasureResult {
  if (!value || typeof value !== 'object') return false
  const result = value as HistoireMeasureResult
  /** Verify every numeric wire field consumed by measurement geometry. */
  const finite = (record: object | undefined, keys: readonly string[]) => Boolean(record && keys.every(key => Number.isFinite((record as Record<string, unknown>)[key])))
  const rectKeys = ['x', 'y', 'width', 'height', 'top', 'right', 'bottom', 'left']
  const spacingKeys = ['top', 'right', 'bottom', 'left']
  // Siblings are optional (older runtimes, long lists) but must index this element when present.
  const siblings = result.siblings === undefined || (Array.isArray(result.siblings) && result.siblings.length <= 64
    && result.siblings.every(rect => finite(rect, rectKeys)) && Number.isInteger(result.index)
    && result.index! >= 0 && result.index! < result.siblings.length)
  const token = result.token === undefined || (typeof result.token === 'string' && result.token.length <= 64)
  const path = result.path === undefined || (Array.isArray(result.path) && result.path.length <= 8
    && result.path.every(label => typeof label === 'string' && label.length <= 64))
  return token && path && typeof result.selector === 'string' && result.selector.length <= 4096
    && finite(result.rect, rectKeys) && finite(result.parentRect, rectKeys)
    && finite(result.padding, spacingKeys) && finite(result.margin, spacingKeys) && siblings
}

/** Hover measurements can be locked locally without mutating preview state. */
export function createMeasureController(options: MeasureControllerOptions) {
  const result = shallowRef<HistoireMeasureResult | null>(null)
  /** Second element compared against the locked one. */
  const target = shallowRef<HistoireMeasureResult | null>(null)
  const locked = ref(false)
  const prefix = `measure-${++instanceCounter}`
  let sequence = 0
  let owner: MeasureOwner | null = null
  /** Main measurement request; navigation keeps lock on empty reply. */
  let pending: { id: string, owner: MeasureOwner, navigation: boolean } | undefined
  /** Compared target request, independent of main measurement. */
  let targetPending: { id: string, owner: MeasureOwner } | undefined
  let closed = false

  /** Clear lock and queued response authority together. */
  function clear(): void {
    pending = undefined
    result.value = null
    locked.value = false
    clearTarget()
  }

  /** Drop compared target and its queued reply. */
  function clearTarget(): void {
    targetPending = undefined
    target.value = null
  }

  /** Read current owner on every event, including before accepting async replies. */
  function synchronize(): MeasureOwner | null {
    const current = closed ? null : options.getOwner()
    if (!sameMeasureOwner(owner, current)) clear()
    owner = current
    return current
  }

  /** Issue one latest-wins inspection, keeping request IDs independent of frame length. */
  function request(query: MeasureQuery, current: MeasureOwner, navigation = false): void {
    pending = { id: `${prefix}-${++sequence}`, owner: current, navigation }
    if (!options.post(current, pending.id, query)) clear()
  }

  /** Compare locked measurement with element under point. */
  function inspectTarget(point: CanvasPoint): void {
    const current = synchronize()
    if (!current || !locked.value || !result.value) return
    targetPending = { id: `${prefix}-${++sequence}`, owner: current }
    if (!options.post(current, targetPending.id, point)) clearTarget()
  }

  /** Move locked measurement to a related element (parent, child, sibling). */
  function navigate(relation: HistoireMeasureRelation, depth?: number): void {
    const current = synchronize()
    // Navigation starts from the current result; ignore presses until the previous move lands.
    const token = result.value?.token
    if (!current || !locked.value || !token || pending?.navigation) return
    request(depth === undefined ? { token, relation } : { token, relation, depth }, current, true)
  }

  /** Movement updates only unlocked measurement; view performs animation-frame throttling. */
  function hover(point: CanvasPoint): void {
    const current = synchronize()
    if (current && !locked.value) request(point, current)
  }

  /** Click freezes displayed box; first click without a box inspects its exact point. */
  function toggle(point?: CanvasPoint): void {
    const current = synchronize()
    if (!current) return
    if (locked.value) {
      locked.value = false
      pending = undefined
      clearTarget()
      if (point) request(point, current)
    }
    else if (result.value) {
      locked.value = true
      pending = undefined
    }
    else if (point) {
      locked.value = true
      request(point, current)
    }
  }

  /** Leaving never erases a locked box, but retires unlocked hover responses. */
  function leave(): void {
    synchronize()
    if (!locked.value) clear()
  }

  /** Correlation, source, origin and complete tuple precede accepting any geometry. */
  function receive(event: MessageEvent): void {
    const current = synchronize()
    const data = event.data
    const request = data?.requestId === targetPending?.id ? targetPending : pending
    if (!current || !request || !sameMeasureOwner(current, request.owner) || event.source !== current.source
      || event.origin !== current.origin || data?.__histoire !== true || data.type !== MEASURE_RESULT
      || data.requestId !== request.id || data.documentId !== current.documentId
      || data.storyId !== current.storyId || data.variantId !== current.variantId) {
      return
    }
    if (data.result !== null && !isMeasureResult(data.result)) return
    if (request === targetPending) {
      targetPending = undefined
      target.value = data.result
      return
    }
    pending = undefined
    // Nothing related keeps the lock; a vanished node (re-render) clears the stale measurement below.
    if (!data.result && 'navigation' in request && request.navigation && data.reason !== 'unresolved') return
    result.value = data.result
    if (data.result) clearTarget()
    else locked.value = false
  }

  return { result: readonly(result), target: readonly(target), locked: readonly(locked), hover, toggle, inspectTarget, clearTarget, navigate, leave, receive, synchronize,
    /** Teardown revokes replies before owning component removes listeners. */
    close(): void {
      closed = true
      owner = null
      clear()
    } }
}
