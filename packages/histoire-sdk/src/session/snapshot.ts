import type { HistoireCapabilities, HistoireSnapshot } from '@histoire/protocol'
import { createDefaultHistoireSettings } from '@histoire/protocol'

/** Copy only validated portable projections; never freeze adapter/live objects. */
export function copyProjection<T>(value: T): T {
  return structuredClone(value)
}

/** Freeze cyclic cleaned projections iteratively while reusing immutable branches. */
export function freezeProjection<T>(value: T): T {
  const stack: unknown[] = [value]
  const seen = new WeakSet<object>()
  while (stack.length) {
    const next = stack.pop()
    if (!next || typeof next !== 'object' || seen.has(next) || Object.isFrozen(next)) continue
    seen.add(next)
    for (const value of Object.values(next)) stack.push(value)
    Object.freeze(next)
  }
  return value
}

/** Complete unavailable map before source capability negotiation. */
export function emptyCapabilities(reason = 'NOT_CONNECTED'): HistoireCapabilities {
  const no = () => ({ available: false, reason })
  return {
    catalog: no(),
    search: no(),
    docs: no(),
    rawSource: no(),
    dynamicSource: no(),
    state: no(),
    customControls: no(),
    previewTests: no(),
    serverTests: no(),
    openInEditor: no(),
    hostChannels: no(),
    surfaces: { explorer: no(), preview: no(), grid: no(), tree: no(), search: no(), toolbar: no(), controls: no(), docs: no(), source: no(), events: no(), tests: no() },
  }
}

/** Initial snapshot never touches document, storage or source adapters. */
export function initialSnapshot(): HistoireSnapshot {
  return freezeProjection({
    status: 'idle',
    stale: false,
    source: null,
    catalog: { stories: [], tree: [], diagnostics: [] },
    diagnostics: [],
    selection: null,
    runtime: { status: 'absent', mountId: null, runtimeId: null, layout: null, viewports: [], viewport: null },
    state: null,
    settings: createDefaultHistoireSettings(),
    capabilities: emptyCapabilities(),
    events: { items: [], droppedCount: 0 },
  })
}

/** Readiness filters supported engines without inventing automatic runtimes. */
export function effectiveCapabilities(snapshot: HistoireSnapshot, engine: HistoireCapabilities | null): HistoireCapabilities {
  if (!engine || snapshot.status !== 'ready') return emptyCapabilities(snapshot.status === 'disposed' ? 'DISPOSED' : 'NOT_CONNECTED')
  const capabilities = copyProjection(engine)
  if (capabilities.hostChannels.available && !capabilities.hostChannels.channels?.length) capabilities.hostChannels = { available: false, reason: 'CAPABILITY_UNAVAILABLE' }
  const selected = snapshot.selection?.variantId != null
  const ready = selected && snapshot.runtime.status === 'ready' && snapshot.runtime.runtimeId !== null
  for (const name of ['state', 'dynamicSource', 'customControls', 'previewTests', 'hostChannels'] as const) {
    if (capabilities[name].available && !ready) capabilities[name] = { ...capabilities[name], available: false, reason: selected ? 'PREVIEW_NOT_READY' : 'SELECTION_REQUIRED' }
  }
  if (capabilities.serverTests.available && (!selected || snapshot.source?.mode !== 'dev')) {
    capabilities.serverTests = { available: false, reason: snapshot.source?.mode !== 'dev' ? 'CAPABILITY_UNAVAILABLE' : 'SELECTION_REQUIRED' }
  }
  return capabilities
}
