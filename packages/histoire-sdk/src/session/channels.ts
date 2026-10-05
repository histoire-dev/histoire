import type { HistoireHostChannelMessage, HistoireJsonValue } from '@histoire/protocol'
import type { HistoireHostChannel } from '../types.js'
import type { SessionContext } from './context.js'
import { createHostChannelRateLimiter, HistoireSdkError, validateHostChannelNames, validateHostChannelPayload } from '@histoire/protocol'
import { observeOperation } from './ownership.js'
import { request } from './request.js'
import { primaryRuntime } from './state.js'

/** Session-local application namespaces, sharing one rate window per direction/document. */
export function createSessionChannels(context: SessionContext) {
  const listeners = new Map<string, Set<(message: HistoireHostChannelMessage) => void>>()
  const incoming = createHostChannelRateLimiter()
  const outgoing = createHostChannelRateLimiter()
  let runtimeId: string | null = null
  let generation = 0
  let status = context.snapshot.status
  let sourceIdentity: string | undefined
  /** Public readiness can be transiently empty while same grid document stays owned. */
  function currentDocument() {
    const primary = context.primaryId ? context.mounts.get(context.primaryId) : undefined
    return primary?.active ? primary.runtimeId : null
  }
  /** Source policy is checked independently of current preview readiness. */
  function allowed(name: string) {
    validateHostChannelNames([name])
    context.assertCapability('hostChannels')
    if (!context.engine?.hostChannels.channels?.includes(name)) throw new HistoireSdkError('CAPABILITY_UNAVAILABLE', 'Host channel is not enabled.', { name })
  }
  context.listeners.add((snapshot) => {
    // Selection briefly clears public runtimeId even when grid keeps actual
    // document. Only physical owned-document retirement releases subscribers.
    const ownedDocument = currentDocument()
    const nextSource = snapshot.source ? JSON.stringify([snapshot.source.sourceId, snapshot.source.epoch]) : undefined
    const retiredSource = (status === 'ready' && snapshot.status !== 'ready') || (sourceIdentity !== undefined && nextSource !== sourceIdentity)
    if (retiredSource || (runtimeId && ownedDocument !== runtimeId)) {
      generation++
      // Callers may retain unsubscribe closures referencing these sets.
      // Retirement releases callbacks independently of later unsubscribe calls.
      for (const subscriptions of listeners.values()) subscriptions.clear()
      listeners.clear()
      incoming.reset()
      outgoing.reset()
    }
    runtimeId = ownedDocument
    status = snapshot.status
    sourceIdentity = nextSource
  })
  context.deliverChannel = (message) => {
    try {
      allowed(message.name)
      validateHostChannelPayload(message, true)
      if (message.runtimeId !== context.snapshot.runtime.runtimeId || message.target.storyId !== context.snapshot.selection?.storyId
        || context.story(message.target.storyId).variants.filter(variant => variant.id === message.target.variantId).length !== 1) {
        return
      }
    }
    catch {
      incoming.drop()
      return
    }
    if (!incoming.accept()) return
    const copy = context.copy(message)
    const deliveryGeneration = generation
    /** Async consumer failures remain observed, but never charge a replacement document. */
    function failed() {
      if (deliveryGeneration === generation && message.runtimeId === currentDocument()) incoming.drop()
    }
    for (const listener of listeners.get(message.name) ?? []) {
      try {
        void Promise.resolve(listener(copy)).catch(failed)
      }
      catch { failed() }
    }
  }
  return {
    /** Open configured namespace without automatically starting a story. */
    open(name: string): HistoireHostChannel {
      allowed(name)
      let capturedRuntime = currentDocument()
      const capturedGeneration = generation
      /** Handle may open before explicit mount; first use binds it to actual document. */
      function captureOwner() {
        const current = currentDocument()
        if (capturedGeneration !== generation || (capturedRuntime && current !== capturedRuntime)) throw new HistoireSdkError('RUNTIME_CHANGED', 'Host channel handle belongs to retired runtime.')
        if (current) capturedRuntime = current
      }
      return {
        post: (type: string, data: HistoireJsonValue) => observeOperation((async () => {
          allowed(name)
          if (!context.snapshot.selection?.variantId) throw new HistoireSdkError('PREVIEW_NOT_READY', 'Host channel needs a ready selected primary.')
          const primary = primaryRuntime(context)
          captureOwner()
          const payload = validateHostChannelPayload({ name, type, data })
          if (!outgoing.accept()) throw new HistoireSdkError('RATE_LIMITED', 'Host channel rate limit exceeded.')
          await request(context, primary.transport, 'channel.post', context.copy(payload), { kind: 'runtime', mountId: primary.handle.id })
        })()),
        subscribe(listener) {
          allowed(name)
          captureOwner()
          if (typeof listener !== 'function') throw new HistoireSdkError('INVALID_ARGUMENT', 'Expected host channel listener.')
          const subscriptions = listeners.get(name) ?? new Set()
          listeners.set(name, subscriptions)
          subscriptions.add(listener)
          return () => subscriptions.delete(listener)
        },
        getDroppedCount: () => Math.min(Number.MAX_SAFE_INTEGER, incoming.droppedCount + outgoing.droppedCount),
      }
    },
  }
}
