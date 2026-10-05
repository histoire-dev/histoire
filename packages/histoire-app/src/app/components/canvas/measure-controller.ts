import type { HistoireMeasureResult } from '@histoire/shared'
import type { CanvasPoint } from './pan/usePanZoom.js'
import { MEASURE_RESULT } from '@histoire/shared'
import { readonly, ref, shallowRef } from 'vue'

/** A measurement belongs to one exact physical preview and source publication. */
export interface MeasureOwner {
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

/** Ports retain registry authority; controller never addresses raw iframes. */
interface MeasureControllerOptions {
  /** Current ready owner or null when tool/preview is unavailable. */
  getOwner: () => MeasureOwner | null
  /** Post only through current frame registry, with bounded correlation. */
  post: (owner: MeasureOwner, requestId: string, point: CanvasPoint) => boolean
}

// Correlation only: retired component instances must never reuse request IDs.
let instanceCounter = 0

/** Compare lifetimes without confusing equal target IDs with equal documents. */
export function sameMeasureOwner(first: MeasureOwner | null, second: MeasureOwner | null): boolean {
  return first === second || Boolean(first && second && first.frameId === second.frameId && first.storyId === second.storyId
    && first.variantId === second.variantId && first.documentId === second.documentId && first.source === second.source
    && first.origin === second.origin && first.generation === second.generation)
}

/** Reject incomplete geometry before guide arithmetic can produce NaN. */
function isMeasureResult(value: unknown): value is HistoireMeasureResult {
  if (!value || typeof value !== 'object') return false
  const result = value as HistoireMeasureResult
  /** Verify every numeric wire field consumed by measurement geometry. */
  const finite = (record: object | undefined, keys: readonly string[]) => Boolean(record && keys.every(key => Number.isFinite((record as Record<string, unknown>)[key])))
  const rectKeys = ['x', 'y', 'width', 'height', 'top', 'right', 'bottom', 'left']
  const spacingKeys = ['top', 'right', 'bottom', 'left']
  return typeof result.selector === 'string' && result.selector.length <= 4096
    && finite(result.rect, rectKeys) && finite(result.parentRect, rectKeys)
    && finite(result.padding, spacingKeys) && finite(result.margin, spacingKeys)
}

/** Hover measurements can be locked locally without mutating preview state. */
export function createMeasureController(options: MeasureControllerOptions) {
  const result = shallowRef<HistoireMeasureResult | null>(null)
  const locked = ref(false)
  const prefix = `measure-${++instanceCounter}`
  let sequence = 0
  let owner: MeasureOwner | null = null
  let pending: { id: string, owner: MeasureOwner } | undefined
  let closed = false

  /** Clear lock and queued response authority together. */
  function clear(): void {
    pending = undefined
    result.value = null
    locked.value = false
  }

  /** Read current owner on every event, including before accepting async replies. */
  function synchronize(): MeasureOwner | null {
    const current = closed ? null : options.getOwner()
    if (!sameMeasureOwner(owner, current)) clear()
    owner = current
    return current
  }

  /** Issue one latest-wins inspection, keeping request IDs independent of frame length. */
  function request(point: CanvasPoint, current: MeasureOwner): void {
    pending = { id: `${prefix}-${++sequence}`, owner: current }
    if (!options.post(current, pending.id, point)) clear()
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
    const request = pending
    const data = event.data
    if (!current || !request || !sameMeasureOwner(current, request.owner) || event.source !== current.source
      || event.origin !== current.origin || data?.__histoire !== true || data.type !== MEASURE_RESULT
      || data.requestId !== request.id || data.documentId !== current.documentId
      || data.storyId !== current.storyId || data.variantId !== current.variantId) {
      return
    }
    if (data.result !== null && !isMeasureResult(data.result)) return
    pending = undefined
    result.value = data.result
    if (!data.result) locked.value = false
  }

  return { result: readonly(result), locked: readonly(locked), hover, toggle, leave, receive, synchronize,
    /** Teardown revokes replies before owning component removes listeners. */
    close(): void {
      closed = true
      owner = null
      clear()
    } }
}
