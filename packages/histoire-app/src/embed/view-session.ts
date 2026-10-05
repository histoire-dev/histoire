import type { HistoireBridgeCommand, HistoireEvent, HistoireSnapshot, HistoireSourceDescriptor, HistoireStateSnapshot } from '@histoire/protocol'
import type { HistoireBridgePort, HistoireSession } from '@histoire/sdk/internal'
import { HistoireSdkError, validateHistoireStateSnapshot } from '@histoire/protocol'
import { registerHistoireSessionInternals } from '@histoire/sdk/internal'
/** Surface uses canonical host snapshot and method intents; creates no controller. */
export function createParentViewSession(bridge: HistoireBridgePort, signal: AbortSignal, descriptor?: () => HistoireSourceDescriptor) {
  let snapshot: Readonly<HistoireSnapshot> | undefined
  const listeners = new Set<(value: Readonly<HistoireSnapshot>) => void>()
  const events = new Set<(event: HistoireEvent) => void>()
  /** Current host state exists only after first validated view synchronization. */
  function getSnapshot(): Readonly<HistoireSnapshot> {
    if (!snapshot) {
      throw new HistoireSdkError('NOT_CONNECTED', 'Parent snapshot unavailable')
    }
    return snapshot
  }
  /** Runtime-targeted view intents capture current host document/target. */
  function request<T>(command: HistoireBridgeCommand, payload: unknown, callerSignal?: AbortSignal): Promise<T> {
    const current = getSnapshot()
    return bridge.request(command, payload, { ...bridge.getOwner(), ...(current.runtime.runtimeId ? { runtimeId: current.runtime.runtimeId } : {}), ...(current.selection ? { target: current.selection } : {}), signal: callerSignal ? AbortSignal.any([signal, callerSignal]) : signal })
  }
  /** Canonical ACK updates existing parent mirror before replica subscribers run. */
  async function stateRequest(command: 'state.get' | 'state.patch' | 'state.reset', payload: unknown): Promise<HistoireStateSnapshot> {
    const captured = getSnapshot()
    const state = await request<HistoireStateSnapshot>(command, payload)
    validateHistoireStateSnapshot(state)
    if (!snapshot || snapshot.runtime.runtimeId !== captured.runtime.runtimeId || snapshot.source?.epoch !== captured.source?.epoch || snapshot.source?.revision !== captured.source?.revision
      || state.runtimeId !== snapshot.runtime.runtimeId || state.target.storyId !== snapshot.selection?.storyId || state.target.variantId !== snapshot.selection?.variantId) {
      throw new HistoireSdkError('RUNTIME_CHANGED', 'State acknowledgment belongs to another runtime')
    }
    snapshot = { ...snapshot, state }
    for (const listener of listeners) listener(snapshot)
    return state
  }
  const session: HistoireSession = {
    connect: async () => {
      getSnapshot()
    },
    getSnapshot,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    catalog: { list: () => request('catalog.list', {}), getStory: storyId => request('catalog.getStory', { storyId }), search: query => request('catalog.search', { query }) },
    selection: { select: input => request('selection.select', input) },
    state: {
      get: () => stateRequest('state.get', {}),
      patch: async (patch) => {
        await stateRequest('state.patch', patch)
      },
      reset: async () => {
        await stateRequest('state.reset', {})
      },
    },
    settings: { update: patch => request('settings.update', patch) },
    events: { subscribe(listener) {
      events.add(listener)
      return () => {
        events.delete(listener)
      }
    }, clear() {
      void request('events.clear', {}).catch(() => {
      })
    } },
    docs: { get: storyId => request('docs.get', { storyId }) },
    channels: { open: () => { throw new HistoireSdkError('CAPABILITY_UNAVAILABLE', 'Application channels belong to parent session') } },
    source: { get: input => request('source.get', input) },
    tests: { collect: () => request('tests.collect', {}), run: options => request('tests.run', { mode: options.mode }, options.signal) },
    mount: () => {
      throw new HistoireSdkError('CAPABILITY_UNAVAILABLE', 'Nested surface mounting unavailable')
    },
    createHiddenPreview: () => {
      throw new HistoireSdkError('CAPABILITY_UNAVAILABLE', 'Nested runtime mounting unavailable')
    },
    dispose: async () => {
    },
  }
  registerHistoireSessionInternals(session, {
    descriptor() {
      if (!descriptor) throw new HistoireSdkError('NOT_CONNECTED', 'Source metadata unavailable')
      getSnapshot()
      return structuredClone(descriptor())
    },
    presets: input => request('controls.preset', input),
    openInEditor: target => request('openInEditor', target),
  })
  return {
    session,
    /** Shared envelope validator has already checked bounded snapshot shape. */
    synchronize(value: HistoireSnapshot) {
      const sameOwner = snapshot?.runtime.runtimeId === value.runtime.runtimeId && snapshot?.selection?.storyId === value.selection?.storyId && snapshot?.selection?.variantId === value.selection?.variantId && snapshot?.source?.epoch === value.source?.epoch
      snapshot = sameOwner ? { ...value, events: snapshot!.events } : value
      for (const listener of listeners) {
        listener(snapshot)
      }
    },
    /** Deliver bounded future host events separately from view synchronization. */
    event(value: HistoireEvent) {
      if (!snapshot || value.runtimeId !== snapshot.runtime.runtimeId || value.target.storyId !== snapshot.selection?.storyId) return
      snapshot = { ...snapshot, events: { ...snapshot.events, items: [...snapshot.events.items, value].slice(-1000) } }
      for (const listener of listeners) listener(snapshot)
      for (const listener of events) listener(value)
    },
    /** Parent clear/initial replay resets history without fabricating a runtime operation. */
    clearEvents(droppedCount = 0) {
      if (!snapshot) return
      snapshot = { ...snapshot, events: { items: [], droppedCount } }
      for (const listener of listeners) listener(snapshot)
    },
    /** Loss deltas follow retained reset separately, preserving canonical bounded history count. */
    dropEvents(count: number) {
      if (!snapshot) return
      snapshot = { ...snapshot, events: { ...snapshot.events, droppedCount: snapshot.events.droppedCount + count } }
      for (const listener of listeners) listener(snapshot)
    },
    /** Own proxy observations only; parent controller remains caller-owned. */
    close() {
      listeners.clear()
      events.clear()
      snapshot = undefined
    },
  }
}
