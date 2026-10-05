import type { HistoireBridgeCommand, HistoireRuntimeSnapshot } from '@histoire/protocol'
import type { HistoireMount, HistoireRequestCapture, HistoireSession, HistoireSessionCommand, HistoireSurfaceConnection } from '@histoire/sdk/internal'
import type { EmbedSurfaceContext } from '../surfaces.js'
import { HistoireSdkError } from '@histoire/protocol'
import { bindHistoireMountChannel, getHistoireSessionDescriptor, registerHistoireSessionInternals, requestHistoireOpenInEditor, requestHistoireStatePreset } from '@histoire/sdk/internal'
import { mountLocalHistoireSurface } from './local-mount.js'

/** Explorer iframe's nested parts share outer primary reservation and canonical parent proxy. */
export function createExplorerViewSession(context: EmbedSurfaceContext) {
  let active = true
  let counter = 0
  let primary: HistoireSurfaceConnection | undefined
  let primaryClosing = false
  let readyRuntime: HistoireRuntimeSnapshot | undefined
  const children = new Set<HistoireMount>()
  const transitions = new Set<() => void>()
  let selectedTarget = JSON.stringify(context.session.getSnapshot().selection)
  let selected = Promise.resolve()
  let settleSelection = () => {}
  // Registered before native snapshot observers: target synchronization can
  // arrive before finite selection command, so reserve its barrier eagerly.
  const stopSelection = context.session.subscribe((snapshot) => {
    const target = JSON.stringify(snapshot.selection)
    if (target === selectedTarget) return
    selectedTarget = target
    settleSelection()
    if (primary && snapshot.selection?.variantId != null) selected = new Promise<void>(resolve => settleSelection = resolve)
    else selected = Promise.resolve()
  })
  const session: HistoireSession = { ...context.session, mount(container, { surface }) {
    if (!active) throw new HistoireSdkError('DISPOSED', 'Explorer detached')
    const isPrimary = ['preview', 'grid'].includes(surface)
    if (surface === 'explorer' || (isPrimary && primary)) throw new HistoireSdkError('RUNTIME_IN_USE', 'Explorer already owns primary runtime')
    const owner = context.bridge.getOwner()
    const snapshot = session.getSnapshot()
    const mountId = isPrimary ? owner.mountId : `${owner.mountId}:child:${++counter}`
    const transport = mountLocalHistoireSurface({ session, sessionId: owner.sessionId, mountId, surface, hidden: false, container, target: snapshot.selection, settings: snapshot.settings, source: { id: owner.connectionId, descriptor: context.descriptor, request: async () => {
      throw new HistoireSdkError('CAPABILITY_UNAVAILABLE', 'Use canonical parent data session')
    }, subscribe: () => () => {}, close: () => {} } }, context.sourceBase ?? new URL('./', window.location.href).href)
    if (isPrimary) {
      primary = transport
      primaryClosing = false
      for (const notify of transitions) notify()
    }
    const off = transport.subscribe((event) => {
      if (!active || !isPrimary || primary !== transport) return
      const identity = { runtimeId: event.runtimeId, target: session.getSnapshot().selection ?? undefined }
      if (event.type === 'runtime') context.bridge.post('readiness.changed', { runtime: event.runtime }, identity)
      if (event.type === 'state') context.bridge.post('state.changed', event.state, identity)
      if (event.type === 'layout') context.bridge.post('layout.changed', { viewports: event.viewports }, identity)
      if (event.type === 'event') context.bridge.post('events.appended', { items: [event.event] }, identity)
      if (event.type === 'dropped') context.bridge.post('events.appended', { items: [], droppedCount: event.count }, identity)
      // Inner port has validated document/origin actor; outer envelope still
      // belongs to Explorer's current selection, including non-selected grid actors.
      if (event.type === 'channel' && !primaryClosing) context.bridge.post('channel.message', event.message, identity)
    })
    const stopFocus = isPrimary
      ? transport.channel?.subscribe((event) => {
        if (active && primary === transport && !primaryClosing && event.event === 'focus.changed') context.bridge.post(event.event, event.payload, { runtimeId: event.runtimeId, target: event.target })
      })
      : undefined
    let closing: Promise<void> | undefined
    let stopChannel = () => {}
    // Native primary channel validates same outer reservation, including focus
    // intent; inventing a child handle ID would reject its valid publications.
    const handle: HistoireMount = { id: mountId, ready: transport.ready.then((runtime) => {
      if (isPrimary && runtime) readyRuntime = runtime
    }),
    /** Local child close joins actual runtime before allowing grid replacement. */
    unmount() {
      if (closing) return closing
      if (primary === transport) primaryClosing = true
      closing = Promise.resolve().then(async () => {
        try {
          stopChannel()
        }
        finally {
          off()
          stopFocus?.()
          await transport.close()
          children.delete(handle)
          if (primary === transport) {
            primary = undefined
            primaryClosing = false
            readyRuntime = undefined
            if (active) context.bridge.post('readiness.changed', { runtime: { status: 'absent', mountId: owner.mountId, runtimeId: null, layout: null, viewports: [], viewport: null } }, { runtimeId: undefined })
            for (const notify of transitions) notify()
          }
        }
      })
      void closing.catch(() => {})
      return closing
    } }
    children.add(handle)
    try {
      stopChannel = bindHistoireMountChannel(handle, session, transport.channel)
    }
    catch (error) {
      void handle.unmount().catch(() => {})
      throw error
    }
    void handle.ready.catch(() => {})
    return handle
  }, createHiddenPreview() {
    throw new HistoireSdkError('RUNTIME_IN_USE', 'Explorer owns visible primary runtime')
  } }
  registerHistoireSessionInternals(session, { descriptor: () => getHistoireSessionDescriptor(context.session), presets: action => requestHistoireStatePreset(context.session, action), openInEditor: target => requestHistoireOpenInEditor(context.session, target), selectionSettled: () => selected, primaryMountActive: mount => active && children.has(mount) && mount.id === context.bridge.getOwner().mountId && !!primary && !primaryClosing })
  /** Selection already changed canonical parent; wait only for its explicitly composed inner primary. */
  function waitPrimary(capture: HistoireRequestCapture): Promise<HistoireSurfaceConnection> {
    return new Promise((resolve, reject) => {
      let off = () => {}
      const timer = setTimeout(() => finish(new HistoireSdkError('PREVIEW_NOT_READY', 'Explorer primary did not mount')), context.descriptor.config.storyCollectTimeout ?? 30_000)
      const abort = () => finish(new HistoireSdkError('CANCELLED', 'Explorer selection cancelled'))
      /** Every wake checks exact target/source before allocating authority to replacement. */
      function check() {
        if (!active) {
          finish(new HistoireSdkError('RUNTIME_CHANGED', 'Explorer detached'))
          return
        }
        const snapshot = session.getSnapshot()
        if (snapshot.selection?.storyId !== capture.target?.storyId || snapshot.selection?.variantId !== capture.target?.variantId || snapshot.source?.epoch !== capture.epoch || snapshot.source.revision !== capture.revision) finish(new HistoireSdkError('RUNTIME_CHANGED', 'Explorer selection owner changed'))
        else if (primary && !primaryClosing) finish(undefined, primary)
      }
      /** Remove observations before settling once. */
      function finish(error?: unknown, value?: HistoireSurfaceConnection) {
        clearTimeout(timer)
        off()
        transitions.delete(check)
        capture.signal.removeEventListener('abort', abort)
        if (error) reject(error)
        else resolve(value!)
      }
      off = session.subscribe(check)
      transitions.add(check)
      capture.signal.addEventListener('abort', abort, { once: true })
      if (capture.signal.aborted) abort()
      else check()
    })
  }
  return { session,
    /** Outer finite requests target currently owned inner primary document. */
    async request(command: HistoireBridgeCommand, payload: unknown, capture: HistoireRequestCapture) {
      if (['settings.update', 'events.clear'].includes(command) && (!primary || primaryClosing)) return null
      if (command === 'selection.select' && session.getSnapshot().selection?.variantId == null) return null
      const owned = command === 'selection.select' ? await waitPrimary(capture) : primaryClosing ? undefined : primary
      if (!owned) throw new HistoireSdkError('PREVIEW_NOT_READY', 'Explorer primary unavailable')
      const target = selectedTarget
      try {
        return await owned.request(command as HistoireSessionCommand, payload, capture)
      }
      finally {
        if (command === 'selection.select' && target === selectedTarget) settleSelection()
      }
    },
    /** Readiness reports outer mount identity already supplied by reused runtime. */
    runtime(): HistoireRuntimeSnapshot {
      return readyRuntime ?? session.getSnapshot().runtime
    },
    /** No caller controller disposal; close all child resources even when one fails. */
    async close() {
      active = false
      stopSelection()
      settleSelection()
      for (const notify of transitions) notify()
      const results = await Promise.allSettled([...children].map(handle => handle.unmount()))
      const errors = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected').map(result => result.reason)
      if (errors.length) throw new AggregateError(errors, 'Explorer cleanup failed')
    } }
}
