import type { HistoireEvent, HistoireStateSnapshot } from '@histoire/protocol'
import type { HistoireSessionAdapters, HistoireSessionNotification, HistoireSourceConnection, HistoireSurfaceConnection } from '../../adapters/types.js'
import { createDefaultHistoireSettings } from '@histoire/protocol'
import { vi } from 'vitest'
import { createEmbedDescriptor } from '../../../../histoire/src/node/__tests__/utils/embed/catalog.js'

export { deferred } from '../../../../histoire/src/node/__tests__/utils/mcp/deferred.js'

/** One data source and optional primary runtime, without browser globals. */
export function sourceFixture() {
  const descriptor = createEmbedDescriptor()
  descriptor.epoch = 'epoch-1'
  descriptor.revision = 'revision-1'
  const listeners = new Set<(event: HistoireSessionNotification) => void>()
  const frameListeners = new Set<(event: HistoireSessionNotification) => void>()
  let runtimeId = 'document-1'
  let mountId = ''
  let target = { storyId: 'a:b', variantId: 'c' as string | null }
  let value: Record<string, unknown> = { count: 5, nested: { value: 'initial' } }
  const initial = structuredClone(value)
  const owner = () => ({ connectionId: 'surface-connection', sourceId: descriptor.sourceId, epoch: descriptor.epoch, revision: descriptor.revision, mountId, runtimeId })
  const state = (): HistoireStateSnapshot => ({ target, runtimeId, value: structuredClone(value) })
  const runtime = () => ({ status: 'ready' as const, mountId, runtimeId, layout: 'single' as const, viewports: [], viewport: null })
  const emit = (notification: HistoireSessionNotification, frames = false) => {
    for (const listener of frames ? frameListeners : listeners) listener(notification)
  }
  const request = vi.fn(async (command: string, payload: any) => {
    if (command === 'selection.select') {
      target = payload
      return runtime()
    }
    if (command === 'state.patch') {
      Object.assign(value, payload)
      return state()
    }
    if (command === 'state.reset') {
      value = structuredClone(initial)
      return state()
    }
    if (command === 'state.get') return state()
    if (command === 'catalog.search') return [{ target, kind: 'story', title: 'First', rank: 1 }]
    if (command === 'docs.get') return { storyId: payload.storyId, epoch: descriptor.epoch, revision: descriptor.revision, origin: 'sibling', format: 'html', body: '<p>Docs</p>' }
    if (command === 'source.get') return { ...payload, epoch: descriptor.epoch, revision: descriptor.revision, origin: 'file', body: 'source' }
    if (command === 'tests.collect') return { definitions: [] }
    if (command === 'tests.run') return { ok: true, total: 0, passed: 0, failed: 0, skipped: 0, errors: [], tests: [] }
  })
  const close = vi.fn(async () => {})
  const connection: HistoireSourceConnection = {
    id: 'connection',
    descriptor,
    request: request as HistoireSourceConnection['request'],
    close,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
  const surfaceClose = vi.fn(async () => {})
  const surfaces: HistoireSurfaceConnection[] = []
  const adapters: HistoireSessionAdapters = {
    connect: vi.fn(async () => connection),
    mount: vi.fn((context) => {
      mountId = context.mountId
      target = context.target ?? target
      const surface: HistoireSurfaceConnection = {
        id: 'surface-connection',
        ready: Promise.resolve(runtime()),
        close: surfaceClose,
        request: request as HistoireSourceConnection['request'],
        subscribe: (listener) => {
          frameListeners.add(listener)
          return () => frameListeners.delete(listener)
        },
      }
      surfaces.push(surface)
      return surface
    }),
  }
  return {
    adapters,
    connection,
    descriptor,
    request,
    close,
    surfaceClose,
    listeners,
    frameListeners,
    surfaces,
    state,
    runtime,
    owner,
    emitCatalog: () => emit({ type: 'catalog', ...owner(), connectionId: connection.id, descriptor }),
    emitDisconnect: () => emit({ type: 'disconnect', ...owner(), connectionId: connection.id }),
    emitState: () => emit({ type: 'state', ...owner(), state: state() }, true),
    emitEvent: (sequence = 1) => {
      const event: HistoireEvent = { sequence, timestamp: sequence, target, runtimeId, payload: { count: sequence } }
      emit({ type: 'event', ...owner(), event }, true)
    },
    reload: () => {
      runtimeId = 'document-2'
      emit({ type: 'runtime', ...owner(), runtime: { ...runtime(), status: 'mounting' } }, true)
    },
    ready: () => {
      emit({ type: 'runtime', ...owner(), runtime: runtime() }, true)
      emit({ type: 'state', ...owner(), state: state() }, true)
    },
    defaults: createDefaultHistoireSettings(),
  }
}
