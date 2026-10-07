import type { CanvasFrames } from '../../composables/canvas-settings.js'
import { PROPS_OVERRIDE, RUNTIME_RESULT } from '@histoire/shared'

/** Live inputs for one Matrix cell's complete prop override exchange. */
export interface CanvasPropsOverrideOptions {
  /** Canvas registry used to bind replies and requests to the exact document. */
  frames: CanvasFrames
  /** Read current frame identity after route or arrangement changes. */
  frameId: () => string
  /** Read current variant and complete Matrix prop projection. */
  projection: () => { variantId: string, props?: Record<string, unknown> }
  /** Mint unique request identifiers for this component lifetime. */
  nextRequestId: () => string
  /** Report failed feature support or acknowledgement timeout locally. */
  fail: (error: unknown) => void
}

/** Matrix prop exchange with source/document fencing and bounded readiness. */
export interface CanvasPropsOverrideController {
  /** Receive a feature reply only from the currently registered iframe. */
  receive: (event: MessageEvent) => void
  /** Send current complete override set, replacing any prior pending request. */
  update: () => void
  /** Wait for the current override acknowledgement before reading dynamic source. */
  wait: () => Promise<void>
  /** Clear its timeout and reject any pending wait during component teardown. */
  dispose: () => void
}

/** Own one Matrix cell's props request, acknowledgement, timeout, and teardown. */
export function createCanvasPropsOverrideController(options: CanvasPropsOverrideOptions): CanvasPropsOverrideController {
  let requestId = ''
  let timeout: ReturnType<typeof setTimeout> | undefined
  let readiness = Promise.resolve()
  let resolveReadiness = () => {}
  let rejectReadiness = (_error: unknown) => {}

  /** Accept only replies from the current document and request. */
  function receive(event: MessageEvent): void {
    const frameId = options.frameId()
    const frame = options.frames.getFrame(frameId)
    if (!requestId || event.source !== frame?.iframe?.contentWindow || event.origin !== window.location.origin || !event.data?.__histoire || event.data.documentId !== frame.documentId) return
    if (event.data.type !== RUNTIME_RESULT || event.data.requestId !== requestId) return
    clearTimeout(timeout)
    timeout = undefined
    requestId = ''
    if (event.data.error || !event.data.result?.supported) {
      const error = new Error('Props matrix unavailable for this variant.')
      rejectReadiness(error)
      options.fail(error)
    }
    else {
      resolveReadiness()
    }
  }

  /** Replace old acknowledgement with a complete current override request. */
  function update(): void {
    const projection = options.projection()
    if (!projection.props) return
    clearTimeout(timeout)
    rejectReadiness(new Error('Props override superseded'))
    readiness = new Promise<void>((resolve, reject) => {
      resolveReadiness = resolve
      rejectReadiness = reject
    })
    void readiness.catch(() => {})
    requestId = options.nextRequestId()
    const frameId = options.frameId()
    if (!options.frames.postToFrame(frameId, { type: PROPS_OVERRIDE, variantId: projection.variantId, props: projection.props, requestId })) {
      rejectReadiness(new Error('Variant unavailable.'))
      return
    }
    timeout = setTimeout(() => {
      requestId = ''
      const error = new Error('Props matrix unavailable for this variant.')
      rejectReadiness(error)
      options.fail(error)
    }, 3000)
  }

  /** Reject a pending source read when its owning component retires. */
  function dispose(): void {
    clearTimeout(timeout)
    rejectReadiness(new Error('Preview detached'))
  }

  return {
    receive,
    update,
    wait: () => readiness,
    dispose,
  }
}
