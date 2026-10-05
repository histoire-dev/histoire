import type { HistoireEvent, HistoireRuntimeSnapshot, HistoireSnapshot, HistoireStateSnapshot } from '../types/snapshot.js'
import { validateHistoireCapabilities, validateHistoireCatalog, validateHistoireDiagnostics } from './catalog.js'
import { measureWireValue, validateWireValue } from './size.js'
import { invalid, validateHistoireTarget, validateSettingsPatch, wireId, wireRecord } from './validation.js'

/** Ready visible variant geometry, finite and target-attributed. */
export function validateHistoireViewports(value: unknown): void {
  if (!Array.isArray(value)) invalid('Expected runtime viewports')
  for (const entry of value) {
    const viewport = wireRecord(entry)
    validateHistoireTarget(viewport.target)
    for (const key of ['x', 'y', 'width', 'height', 'scale']) {
      if (typeof viewport[key] !== 'number' || !Number.isFinite(viewport[key]) || (['width', 'height', 'scale'].includes(key) && (viewport[key] as number) <= 0)) invalid('Invalid runtime geometry')
    }
    const clip = wireRecord(viewport.visibleRect)
    for (const key of ['x', 'y', 'width', 'height']) {
      if (typeof clip[key] !== 'number' || !Number.isFinite(clip[key]) || (['width', 'height'].includes(key) && (clip[key] as number) <= 0)) invalid('Invalid visible clip')
    }
  }
}

/** Validates primary lifecycle before state/control/dynamic operations become ready. */
export function validateHistoireRuntimeSnapshot(value: unknown): HistoireRuntimeSnapshot {
  const input = wireRecord(value)
  if (!['absent', 'mounting', 'ready', 'failed', 'stale'].includes(input.status as string)) invalid('Invalid runtime status')
  for (const key of ['mountId', 'runtimeId']) {
    if (!(input[key] === null || wireId(input[key]))) invalid('Invalid runtime owner')
  }
  if (!(input.layout === null || ['single', 'grid'].includes(input.layout as string))) invalid('Invalid runtime layout')
  validateHistoireViewports(input.viewports)
  if (input.viewport !== null) validateHistoireViewports([input.viewport])
  if (input.status === 'ready' && (!wireId(input.mountId) || !wireId(input.runtimeId) || input.layout === null)) invalid('Ready runtime requires owner')
  return input as unknown as HistoireRuntimeSnapshot
}

/** Cyclic cleaned state root remains structured-clone data and never runtime callbacks. */
export function validateHistoireStateSnapshot(value: unknown): HistoireStateSnapshot {
  validateWireValue(value, { kind: 'event', name: 'state.changed' })
  const input = wireRecord(value)
  validateHistoireTarget(input.target)
  if (!wireId(input.runtimeId) || !input.value || typeof input.value !== 'object') invalid('Invalid state snapshot')
  return input as unknown as HistoireStateSnapshot
}

/** Every event retains exact target/document ownership and finite chronology. */
export function validateHistoireEvent(value: unknown): HistoireEvent {
  const input = wireRecord(value)
  validateHistoireTarget(input.target)
  if (!wireId(input.runtimeId) || !Number.isSafeInteger(input.sequence) || (input.sequence as number) < 0 || typeof input.timestamp !== 'number' || !Number.isFinite(input.timestamp) || !Object.hasOwn(input, 'payload')) invalid('Invalid story event')
  measureWireValue(input.payload)
  return input as unknown as HistoireEvent
}

/** Complete projected view snapshot; event history arrives in separate bounded batches. */
export function validateHistoireSnapshot(value: unknown): HistoireSnapshot {
  validateWireValue(value, { kind: 'request', name: 'view.sync' })
  const input = wireRecord(value)
  if (!['idle', 'connecting', 'ready', 'restarting', 'disconnected', 'failed', 'disposed'].includes(input.status as string) || typeof input.stale !== 'boolean') invalid('Invalid session lifecycle')
  if (input.source !== null) {
    const source = wireRecord(input.source)
    if (!wireId(source.sourceId) || !wireId(source.epoch) || !wireId(source.revision) || typeof source.url !== 'string' || !['dev', 'static'].includes(source.mode as string)) invalid('Invalid source identity')
    let url: URL
    try {
      url = new URL(source.url)
    }
    catch {
      return invalid('Invalid source URL')
    }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) invalid('Invalid source URL')
  }
  validateHistoireCatalog(input.catalog)
  validateHistoireDiagnostics(input.diagnostics)
  const diagnostics = wireRecord(input.catalog).diagnostics
  if (!Array.isArray(input.diagnostics) || input.diagnostics.length !== (diagnostics as unknown[]).length) invalid('Invalid snapshot diagnostics')
  if (input.selection !== null) validateHistoireTarget(input.selection)
  validateHistoireRuntimeSnapshot(input.runtime)
  if (input.state !== null) validateHistoireStateSnapshot(input.state)
  const settings = validateSettingsPatch(input.settings)
  for (const key of ['responsiveWidth', 'responsiveHeight', 'rotate', 'backgroundColor', 'checkerboard', 'textDirection', 'colorScheme', 'globals']) {
    if (!Object.hasOwn(settings, key)) invalid('Incomplete session settings')
  }
  validateHistoireCapabilities(input.capabilities)
  const events = wireRecord(input.events)
  if (!Array.isArray(events.items) || events.items.length > 1000 || !Number.isSafeInteger(events.droppedCount) || (events.droppedCount as number) < 0) invalid('Invalid event history')
  for (const event of events.items) validateHistoireEvent(event)
  return input as unknown as HistoireSnapshot
}
