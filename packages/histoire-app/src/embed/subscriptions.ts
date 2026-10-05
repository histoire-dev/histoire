import type { HistoireSourceDescriptor } from '@histoire/protocol'
import type { HistoireSessionNotification } from '@histoire/sdk/internal'
import type { EmbedSourceOptions } from './types.js'
import { validateEmbedDescriptor } from './descriptor.js'

/** Owns one dev channel subscription and ignores late documents after teardown. */
export function createEmbedSubscriptions(id: string, initial: HistoireSourceDescriptor, subscribe: EmbedSourceOptions['subscribe'], publish: (descriptor: HistoireSourceDescriptor) => void) {
  const listeners = new Set<(event: HistoireSessionNotification) => void>()
  let active = true
  let current = initial
  const off = subscribe?.((value) => {
    if (!active) return
    if (!value || value.sourceId !== current.sourceId || value.epoch !== current.epoch) {
      for (const listener of listeners) listener({ type: 'disconnect', connectionId: id, sourceId: current.sourceId, epoch: current.epoch, revision: current.revision })
      return
    }
    const descriptor = validateEmbedDescriptor(value)
    if (descriptor.revision === current.revision) return
    current = descriptor
    publish(descriptor)
    for (const listener of listeners) listener({ type: 'catalog', connectionId: id, sourceId: descriptor.sourceId, epoch: descriptor.epoch, revision: descriptor.revision, descriptor })
  })
  return {
    /** Observes future coherent source revisions without invoking listener implicitly. */
    subscribe(listener: (event: HistoireSessionNotification) => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    /** Marks lifetime inactive before removing listeners, suppressing late HMR callbacks. */
    close() {
      active = false
      off?.()
      listeners.clear()
    },
  }
}
