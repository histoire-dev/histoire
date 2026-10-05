import type { HistoireHostChannelMessage, HistoireHostChannelPayload, HistoireJsonValue, HistoireStoryHostChannel, HistoireTarget } from '@histoire/protocol'
import { createHostChannelRateLimiter, getHistoireTargetKey, HistoireSdkError, validateHostChannelNames, validateHostChannelPayload } from '@histoire/protocol'
import { getStoryExecutionTarget } from '@histoire/shared'

export type { HistoireStoryHostChannel } from '@histoire/protocol'

/** Removed framework mount cannot regain channel authority after DOM reinsertion. */
interface HostChannelActor {
  /** Retirement is permanent for every handle sharing this mount lease. */
  active: boolean
}

/** Runtime installs exactly one scope shared by story/client and support module copies. */
interface HostChannelScope {
  /** Collection, disabled sources and controls replicas remain inert. */
  enabled: boolean
  /** Names require explicit source opt-in. */
  names: readonly string[]
  /** Document identity captured before story modules execute. */
  documentId: string
  /** Current story reader only used while capturing actor, never for later posts. */
  storyId: () => string | undefined
  /** Actual target readiness, including non-selected grid cells. */
  ready: (target: HistoireTarget) => boolean
  /** Existing same-origin parent messaging path. */
  post: (payload: HistoireHostChannelPayload, target: HistoireTarget) => void
  /** Per-direction windows cover every namespace and actor in this runtime. */
  incoming: ReturnType<typeof createHostChannelRateLimiter>
  outgoing: ReturnType<typeof createHostChannelRateLimiter>
  /** Leases release node references once browser reports mount removal. */
  actors: Map<Node, HostChannelActor>
  /** Closures retained only while exact framework mount remains connected. */
  listeners: Set<{ actor: HostChannelActor, target: HistoireTarget, name: string, type: string, listener: (data: HistoireJsonValue, message: HistoireHostChannelMessage) => void }>
  /** Retirement is terminal even if same DOM node gets reused. */
  active: boolean
}
const key = '__HST_HOST_CHANNEL_SCOPE__'
/** Lazy registry access keeps histoire/client import SSR-safe. */
function registry() {
  return globalThis as typeof globalThis & { [key]?: HostChannelScope }
}

/** Install document-local relay before any story module is loaded; no second message listener. */
export function installRuntimeHostChannels(options: Pick<HostChannelScope, 'names' | 'documentId' | 'storyId' | 'ready' | 'post'> & { enabled?: boolean }) {
  const scope: HostChannelScope = { ...options, enabled: options.enabled ?? true, names: validateHostChannelNames(options.names), incoming: createHostChannelRateLimiter(), outgoing: createHostChannelRateLimiter(), actors: new Map(), listeners: new Set(), active: true }
  registry()[key] = scope
  /** Removed cells release callback closures, including lazy grid retirement. */
  function prune(records: readonly MutationRecord[] = []) {
    for (const [node, actor] of scope.actors) {
      // Removal and reinsertion can share one observer turn. Looking only at
      // isConnected would revive handles whose original mount already ended.
      const removed = records.some(record => Array.from(record.removedNodes).some(ancestor => ancestor === node || ancestor.contains?.(node)))
      if (!node.isConnected || removed) {
        actor.active = false
        scope.actors.delete(node)
      }
    }
    for (const entry of scope.listeners) {
      if (!entry.actor.active) scope.listeners.delete(entry)
    }
  }
  const observer = scope.enabled ? new MutationObserver(prune) : undefined
  observer?.observe(document, { childList: true, subtree: true })
  return {
    /** Host delivery enters only after source/frame/document/selected-target guard. */
    receive(payload: unknown, target: HistoireTarget) {
      let value: HistoireHostChannelPayload
      try {
        value = validateHostChannelPayload(payload)
      }
      catch (error) {
        scope.incoming.drop()
        throw error
      }
      if (!scope.active || !scope.enabled || !scope.names.includes(value.name)) throw new HistoireSdkError('CAPABILITY_UNAVAILABLE', 'Host channel is not enabled.')
      if (!scope.ready(target)) throw new HistoireSdkError('PREVIEW_NOT_READY', 'Host channel actor is unavailable.')
      if (!scope.incoming.accept()) throw new HistoireSdkError('RATE_LIMITED', 'Host channel rate limit exceeded.')
      prune()
      const message: HistoireHostChannelMessage = { ...structuredClone(value), runtimeId: scope.documentId, target: { ...target } }
      for (const entry of scope.listeners) {
        if (entry.name !== value.name || entry.type !== value.type || getHistoireTargetKey(entry.target) !== getHistoireTargetKey(target)) continue
        /** Rejected consumer promises are observed without publishing after actor retirement. */
        const failed = () => {
          if (scope.active && registry()[key] === scope && entry.actor.active) scope.incoming.drop()
        }
        try {
          void Promise.resolve(entry.listener(structuredClone(message.data), structuredClone(message))).catch(failed)
        }
        catch { failed() }
      }
    },
    /** Retire closures before framework app or frame teardown. */
    close() {
      if (!scope.active) return
      scope.active = false
      scope.listeners.clear()
      scope.actors.clear()
      observer?.disconnect()
      if (registry()[key] === scope) delete registry()[key]
    },
  }
}

/** Capture during framework initialization; collection/metadata mounts remain dormant. */
export function useHostChannel(name: string): HistoireStoryHostChannel {
  validateHostChannelNames([name])
  const scope = registry()[key]
  const node = getStoryExecutionTarget()
  const element = typeof Element !== 'undefined' && node instanceof Element ? node : node?.parentElement
  const cell = element?.closest('[data-histoire-runtime-content]')
  const variantId = cell?.getAttribute('data-histoire-variant-id')
  const storyId = scope?.storyId()
  const target = scope?.enabled && storyId && variantId ? { storyId, variantId } : undefined
  const actor = target && node && scope?.names.includes(name) ? scope.actors.get(node) ?? { active: true } : undefined
  if (actor) scope!.actors.set(node!, actor)
  /** Dormant handles cannot create listeners or turn collection into story execution. */
  function assertOwner() {
    if (!scope || !node || !target) throw new HistoireSdkError('CAPABILITY_UNAVAILABLE', 'Host channel requires story initialization inside a preview.')
    if (!scope.active || registry()[key] !== scope || !node.isConnected) throw new HistoireSdkError('RUNTIME_CHANGED', 'Host channel runtime was retired.')
    if (!scope.names.includes(name)) throw new HistoireSdkError('CAPABILITY_UNAVAILABLE', 'Host channel is not enabled.', { name })
    if (!actor?.active) throw new HistoireSdkError('RUNTIME_CHANGED', 'Host channel actor was retired.')
    return scope
  }
  if (target) assertOwner()
  return {
    post(type, data) {
      const operation = Promise.resolve().then(() => {
        const owner = assertOwner()
        const payload = validateHostChannelPayload({ name, type, data })
        if (!owner.ready(target!)) throw new HistoireSdkError('PREVIEW_NOT_READY', 'Host channel actor is unavailable.')
        if (!owner.outgoing.accept()) throw new HistoireSdkError('RATE_LIMITED', 'Host channel rate limit exceeded.')
        owner.post(payload, target!)
      })
      void operation.catch(() => {})
      return operation
    },
    on(type, listener) {
      if (!target) return () => {}
      const owner = assertOwner()
      validateHostChannelPayload({ name, type, data: null })
      if (typeof listener !== 'function') throw new HistoireSdkError('INVALID_ARGUMENT', 'Expected host channel listener.')
      const entry = { actor: actor!, target, name, type, listener }
      owner.listeners.add(entry)
      return () => owner.listeners.delete(entry)
    },
    getDroppedCount: () => Math.min(Number.MAX_SAFE_INTEGER, (scope?.incoming.droppedCount ?? 0) + (scope?.outgoing.droppedCount ?? 0)),
  }
}
