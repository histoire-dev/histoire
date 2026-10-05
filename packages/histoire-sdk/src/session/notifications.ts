import type { HistoireSessionNotification } from '../adapters/types.js'
import type { SessionContext } from './context.js'
import { validateHistoireEvent, validateHistoireSourceDescriptor, validateHistoireStateSnapshot, validateHistoireViewports, validateWireValue } from '@histoire/protocol'
import { appendEvent } from './events.js'
import { publishRuntime } from './runtime.js'
import { reconcileSelection } from './selection.js'
import { sendCurrentSettings } from './settings.js'

/** Gate every validated notification against current source and attachment. */
export function receiveNotification(context: SessionContext, notification: HistoireSessionNotification, mountId?: string): void {
  const mount = mountId ? context.mounts.get(mountId) : undefined
  const connectionId = mountId ? mount?.transport.id : context.connection?.id
  if (context.snapshot.status !== 'ready' || notification.connectionId !== connectionId || notification.sourceId !== context.snapshot.source?.sourceId) return
  if (mountId && (!mount?.active || notification.mountId !== mountId || context.primaryId !== mountId)) return
  if (notification.type === 'catalog' && !mountId) {
    try {
      validateHistoireSourceDescriptor(notification.descriptor)
    }
    catch {
      context.publish({ stale: true })
      return
    }
    const descriptor = notification.descriptor
    if (descriptor.sourceId !== context.snapshot.source.sourceId || descriptor.epoch !== notification.epoch || descriptor.revision !== notification.revision) return
    // One source descriptor remains canonical for first-party config getters.
    context.descriptor = context.copy(descriptor)
    const changed = descriptor.epoch !== context.snapshot.source.epoch || descriptor.revision !== context.snapshot.source.revision
    if (changed) context.operations.reject('STALE_REVISION', 'Source publication changed.')
    context.engine = context.copy(descriptor.capabilities)
    const catalog = context.copy(descriptor.catalog)
    // Reconcile against the new catalog before notifying any external observer.
    const previous = context.snapshot
    const selection = reconcileSelection(context, catalog)
    const targetChanged = selection?.storyId !== previous.selection?.storyId || selection?.variantId !== previous.selection?.variantId
    if (targetChanged) {
      context.selectionVersion++
      context.runtimeVersion++
    }
    context.publish({
      source: context.copy({ ...previous.source!, epoch: descriptor.epoch, revision: descriptor.revision, mode: descriptor.mode }),
      catalog,
      diagnostics: catalog.diagnostics,
      selection: context.copy(selection),
      stale: false,
      ...(targetChanged || descriptor.epoch !== previous.source?.epoch ? { state: null, runtime: { ...previous.runtime, status: context.primaryId ? 'stale' : 'absent', runtimeId: null, viewports: [], viewport: null } } : {}),
    })
    return
  }
  if (notification.epoch !== context.snapshot.source?.epoch || notification.revision !== context.snapshot.source.revision) return
  if (notification.type === 'disconnect' && !mountId) {
    context.operations.reject('NOT_CONNECTED', 'Source disconnected.')
    context.runtimeVersion++
    context.publish({ status: 'disconnected', stale: true, runtime: { ...context.snapshot.runtime, status: context.primaryId ? 'stale' : 'absent', viewports: [], viewport: null } })
    return
  }
  if (notification.type === 'dropped') {
    if (!Number.isSafeInteger(notification.count) || notification.count < 0) return
    context.publish({ events: { ...context.snapshot.events, droppedCount: context.snapshot.events.droppedCount + notification.count }, ...(notification.stale ? { stale: true } : {}) })
    if (notification.stale) context.operations.reject('STALE_REVISION', 'Required publication was dropped.')
    return
  }
  if (!mountId) return
  if (notification.type === 'runtime') {
    const runtime = notification.runtime
    if (runtime.mountId !== mountId || runtime.runtimeId !== (notification.runtimeId ?? null)) return
    try {
      if (!publishRuntime(context, mount!, runtime)) return
    }
    catch {
      context.publish({ stale: true })
      return
    }
    if (runtime.status === 'ready') void sendCurrentSettings(context).catch(() => {})
    return
  }
  if (notification.runtimeId !== context.snapshot.runtime.runtimeId || context.snapshot.runtime.status !== 'ready') return
  if (notification.type === 'layout') {
    try {
      validateWireValue({ viewports: notification.viewports }, { kind: 'event', name: 'layout.changed' })
      validateHistoireViewports(notification.viewports)
    }
    catch {
      context.publish({ stale: true })
      return
    }
    const viewports = mount?.hidden ? [] : context.copy(notification.viewports)
    const viewport = viewports.find(viewport => viewport.target.storyId === context.snapshot.selection?.storyId && viewport.target.variantId === context.snapshot.selection.variantId) ?? null
    context.publish({ runtime: { ...context.snapshot.runtime, viewports, viewport } })
  }
  else if (notification.type === 'state') {
    const state = notification.state
    if (state.runtimeId !== notification.runtimeId || state.target.storyId !== context.snapshot.selection?.storyId || state.target.variantId !== context.snapshot.selection.variantId) return
    try {
      validateHistoireStateSnapshot(state)
    }
    catch {
      context.publish({ stale: true })
      return
    }
    context.publish({ state: context.copy(state) })
  }
  else if (notification.type === 'event') {
    try {
      validateWireValue(notification.event, { kind: 'event', name: 'events.appended' })
      validateHistoireEvent(notification.event)
    }
    catch {
      context.publish({ events: { ...context.snapshot.events, droppedCount: context.snapshot.events.droppedCount + 1 } })
      return
    }
    appendEvent(context, notification.event)
  }
  else if (notification.type === 'channel') {
    context.deliverChannel?.(notification.message)
  }
}
