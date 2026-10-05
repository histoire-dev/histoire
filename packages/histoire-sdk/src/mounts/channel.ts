import type { HistoireBridgePublication } from '@histoire/protocol'
import type { HistoireMount, HistoireSession } from '../types.js'
/** First-party controls publications; finite payload validators remain protocol-owned. */
export interface HistoireMountChannel {
  /** Configure native custom-only presentation before first view synchronization. */
  configure?: (customOnly: boolean) => void
  /** Observe validated port publications scoped to one mounted surface. */
  subscribe: (listener: (event: HistoireBridgePublication) => void) => () => void
  /** Reply to current controls overlay; arbitrary commands/events are not exposed. */
  post: (event: 'overlay.result', payload: unknown) => void
}
/** Handle-private bindings never become part of public session/snapshot shape. */
interface MountBinding {
  listeners: Set<(event: HistoireBridgePublication) => void>
  post: HistoireMountChannel['post']
  configure: (customOnly: boolean) => void
}
const bindings = new WeakMap<HistoireMount, MountBinding>()
const bindingKey = Symbol.for('@histoire/sdk/mount-channel/protocol-1')
/** Split native/SDK bundles share only already validated finite mount channel binding. */
function binding(mount: HistoireMount): MountBinding | undefined {
  return bindings.get(mount) ?? (mount as HistoireMount & { [bindingKey]?: MountBinding })[bindingKey]
}
const events = new Set(['overlay.open', 'overlay.update', 'overlay.close', 'controls.height', 'focus.changed'])
/** Bind one mount channel; canonical runtime remains sole authority for replica traffic. */
export function bindHistoireMountChannel(mount: HistoireMount, session: HistoireSession, channel?: HistoireMountChannel): () => void {
  if (!channel) {
    return () => {
    }
  }
  let active = true
  const listeners = new Set<(event: HistoireBridgePublication) => void>()
  /** Scope check also rejects same-target reloads, publication changes and detached primary. */
  function current(event?: HistoireBridgePublication): boolean {
    const snapshot = session.getSnapshot()
    return active && snapshot.status === 'ready' && snapshot.runtime.status === 'ready' && !!snapshot.runtime.runtimeId
      && (!event || (event.mountId === mount.id && event.sourceId === snapshot.source?.sourceId
        && event.epoch === snapshot.source.epoch && event.revision === snapshot.source.revision
        && event.runtimeId === snapshot.runtime.runtimeId && event.target?.storyId === snapshot.selection?.storyId
        && event.target?.variantId === snapshot.selection?.variantId))
  }
  const off = channel.subscribe((event) => {
    if (!events.has(event.event) || !current(event)) {
      return
    }
    for (const listener of [...listeners]) {
      try {
        listener(event)
      }
      catch {
        // UI observer failure cannot interrupt owned port lifecycle.
      }
    }
  })
  bindings.set(mount, { listeners, post(event, payload) {
    if (current()) {
      channel.post(event, payload)
    }
  }, configure(customOnly) {
    if (active) {
      channel.configure?.(customOnly)
    }
  } })
  if (!Object.hasOwn(mount, bindingKey)) Object.defineProperty(mount, bindingKey, { get: () => bindings.get(mount), enumerable: false })
  return () => {
    if (!active) {
      return
    }
    active = false
    bindings.delete(mount)
    listeners.clear()
    off()
  }
}
/** Subscribe before mount.ready so initial replica availability cannot be lost. */
export function subscribeHistoireMountEvents(mount: HistoireMount, listener: (event: HistoireBridgePublication) => void): () => void {
  const entry = binding(mount)
  entry?.listeners.add(listener)
  return () => {
    entry?.listeners.delete(listener)
  }
}
/** Resolve opaque option identity only on its owning current surface port. */
export function postHistoireMountEvent(mount: HistoireMount, event: 'overlay.result', payload: unknown): void {
  if (event === 'overlay.result') {
    binding(mount)?.post(event, payload)
  }
}
/** Native custom frame omits generic editors rendered locally by owning provider. */
export function configureHistoireMountControls(mount: HistoireMount, customOnly: boolean): void {
  binding(mount)?.configure(customOnly)
}
