import type { EmbedSurfaceContext, EmbedSurfaceInstance } from '../surfaces.js'
import { HistoireSdkError } from '@histoire/protocol'

/** UI imports stay outside metadata graph; late construction remains teardown-observed. */
export function createLazyEmbedSurface(context: EmbedSurfaceContext, load: () => Promise<EmbedSurfaceInstance>): EmbedSurfaceInstance {
  let view: EmbedSurfaceInstance | undefined
  let active = true
  let cleanup: Promise<void> | undefined
  let closing: Promise<void> | undefined
  const acquisition = load()
  /** All readiness/unmount paths share cleanup, including late factory completion. */
  const closeInstance = (instance: EmbedSurfaceInstance): Promise<void> => {
    cleanup ??= Promise.resolve().then(() => instance.close())
    void cleanup.catch(() => {})
    return cleanup
  }
  const ready = acquisition.then(async (instance) => {
    view = instance
    if (!active || context.signal.aborted) {
      await closeInstance(instance)
      return
    }
    return view.ready
  })
  void ready.catch(() => {})
  return {
    ready,
    /** Validated view-only publications remain scoped to owning document. */
    publication: (event) => { if (active) view?.publication?.(event) },
    /** Await same acquired view, retaining caller/source lifetime through finite dispatch. */
    async request(command, payload, capture) {
      capture.signal.throwIfAborted()
      const instance = await acquisition
      capture.signal.throwIfAborted()
      if (!active || context.signal.aborted) throw new HistoireSdkError('RUNTIME_CHANGED', 'Surface detached')
      if (!instance.request) throw new HistoireSdkError('CAPABILITY_UNAVAILABLE', 'Surface has no runtime dispatcher')
      const result = await instance.request(command, payload, capture)
      capture.signal.throwIfAborted()
      if (!active || context.signal.aborted) throw new HistoireSdkError('RUNTIME_CHANGED', 'Surface detached during dispatch')
      return result
    },
    /** Join acquisition and resource cleanup without waiting for story readiness. */
    close() {
      active = false
      closing ??= acquisition.then(closeInstance, () => {})
      void closing.catch(() => {})
      return closing
    },
  }
}
