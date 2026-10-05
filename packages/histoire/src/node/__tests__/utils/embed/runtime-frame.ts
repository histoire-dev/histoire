import type { HistoireRuntimeSnapshot } from '@histoire/protocol'
import type { HistoireSessionNotification } from '../../../../../../histoire-sdk/src/adapters/types.js'
import type { HistoireBridgePort } from '../../../../../../histoire-sdk/src/internal.js'
import { createEmbedRuntimeFrame } from '../../../../../../histoire-app/src/embed/adapters/runtime-frame.js'
import { sourceFixture } from '../../../../../../histoire-sdk/src/__tests__/fixtures/session.js'
import { createHistoireSessionWithAdapters } from '../../../../../../histoire-sdk/src/internal.js'

/** Real controller/runtime adapter; only already-validated notification delivery is synchronous. */
export async function createRuntimeFrameFixture(options: { standalone?: boolean, sourceBase?: string, runtimeRevision?: string, extraVariants?: string[] } = {}) {
  const fixture = sourceFixture()
  for (const id of options.extraVariants ?? []) fixture.descriptor.catalog.stories[0].variants.push({ id, title: id })
  if (options.runtimeRevision) fixture.descriptor.catalog.stories[0].runtimeRevision = options.runtimeRevision
  fixture.descriptor.config = { title: 'Book', autoApplyContrastColor: false, theme: { defaultColorScheme: 'light', darkClass: 'dark' }, responsivePresets: [], backgroundPresets: [], storyCollectTimeout: 100 }
  const container = document.createElement('div')
  document.body.append(container)
  const publications: HistoireRuntimeSnapshot[] = []
  const messages: { event: string, payload: any }[] = []
  const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, {
    ...fixture.adapters,
    mount(context) {
      const listeners = new Set<(event: HistoireSessionNotification) => void>()
      const owner = { protocolVersion: 1 as const, sessionId: context.sessionId, connectionId: 'surface-connection', sourceId: fixture.descriptor.sourceId, epoch: fixture.descriptor.epoch, revision: fixture.descriptor.revision, mountId: context.mountId }
      const bridge = {
        getOwner: () => owner,
        post(event, payload, identity) {
          messages.push({ event, payload })
          const notification = event === 'readiness.changed'
            ? { type: 'runtime', runtime: (payload as { runtime: HistoireRuntimeSnapshot }).runtime }
            : event === 'state.changed'
              ? { type: 'state', state: payload }
              : event === 'events.appended'
                ? { type: 'event', event: (payload as { items: unknown[] }).items[0] }
                : null
          if (!notification) return
          if (notification.type === 'runtime') publications.push(notification.runtime)
          for (const listener of listeners) listener({ ...owner, epoch: fixture.descriptor.epoch, revision: fixture.descriptor.revision, ...identity, ...notification } as HistoireSessionNotification)
        },
      } as HistoireBridgePort
      const view = createEmbedRuntimeFrame({ container: context.container!, session: context.session, descriptor: fixture.descriptor, sourceBase: options.sourceBase ?? 'http://localhost/book/', standalone: options.standalone, signal: new AbortController().signal, bridge }, 'single')
      return { id: owner.connectionId, ready: view.ready, request: view.request, close: view.close, subscribe(listener) {
        listeners.add(listener)
        return () => listeners.delete(listener)
      } }
    },
  })
  await session.connect()
  await session.selection.select({ storyId: 'a:b', variantId: 'c' })
  const primary = session.mount(container, { surface: 'preview' })
  return { session, primary, container, publications, messages, source: fixture,
    /** Cleanup owns only this controller and its attached element. */
    async close() {
      await session.dispose()
      container.remove()
    } }
}

/** Deliver real frame/document ownership, optionally retaining a predecessor document ID. */
export function publishFrameMessage(frame: HTMLIFrameElement, type: string, documentId = new URL(frame.src).searchParams.get('documentId'), payload: Record<string, unknown> = {}) {
  window.dispatchEvent(new MessageEvent('message', { source: frame.contentWindow, origin: window.location.origin, data: { __histoire: true, type, documentId, selectionVersion: Number(new URL(frame.src).searchParams.get('selectionVersion') ?? 0), storyId: 'a:b', variantId: 'c', ...payload } }))
}
