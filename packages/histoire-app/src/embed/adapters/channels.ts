import type { HistoireHostChannelMessage, HistoireTarget } from '@histoire/protocol'
import type { EmbedSurfaceContext } from '../surfaces.js'
import { createHostChannelRateLimiter, HistoireSdkError, validateHostChannelPayload } from '@histoire/protocol'

/** Outer wrapper admits data using same owned primary document and selected envelope as events. */
export function createEmbedHostChannels(context: EmbedSurfaceContext, runtime: () => { id: string | null, selected: HistoireTarget | null, ready: (variantId: string) => boolean }) {
  const incoming = createHostChannelRateLimiter()
  const outgoing = createHostChannelRateLimiter()
  let documentId: string | null = null
  /** Rate tokens belong to one document across every channel and grid actor. */
  function current() {
    const owner = runtime()
    if (documentId !== owner.id) {
      documentId = owner.id
      incoming.reset()
      outgoing.reset()
    }
    return owner
  }
  /** Descriptor names cannot be replaced by story data or parent payload. */
  function enabled(name: string) {
    const capability = context.descriptor.capabilities.hostChannels
    if (!capability.available || !capability.channels?.includes(name)) throw new HistoireSdkError('CAPABILITY_UNAVAILABLE', 'Host channel is not enabled.')
  }
  return {
    /** Hostile/malformed/stale messages stop here, before parent callbacks. */
    receive(message: { storyId: string, variantId: string, channel: unknown }) {
      const owner = current()
      try {
        const payload = validateHostChannelPayload(message.channel)
        enabled(payload.name)
        if (!owner.id || message.storyId !== owner.selected?.storyId || !owner.ready(message.variantId)
          || context.session.getSnapshot().catalog.stories.filter(story => story.id === message.storyId).length !== 1
          || context.session.getSnapshot().catalog.stories.find(story => story.id === message.storyId)!.variants.filter(variant => variant.id === message.variantId).length !== 1) {
          return
        }
        if (!incoming.accept()) return
        const value: HistoireHostChannelMessage = { ...payload, runtimeId: owner.id, target: { storyId: message.storyId, variantId: message.variantId } }
        context.bridge.post('channel.message', value, { runtimeId: owner.id, target: owner.selected! })
      }
      catch { incoming.drop() }
    },
    /** Host posts reach selected ready primary only; runtime requests retain exact capture. */
    admit(payload: unknown) {
      current()
      const value = validateHostChannelPayload(payload)
      enabled(value.name)
      if (!outgoing.accept()) throw new HistoireSdkError('RATE_LIMITED', 'Host channel rate limit exceeded.')
    },
    /** Diagnostic loss count is bounded and retained only for active runtime. */
    getDroppedCount: () => Math.min(Number.MAX_SAFE_INTEGER, incoming.droppedCount + outgoing.droppedCount),
    /** Teardown retains no work, messages or callback closures. */
    close() {
      incoming.reset()
      outgoing.reset()
      documentId = null
    },
  }
}
