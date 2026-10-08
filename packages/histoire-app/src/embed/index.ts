import { bookBase, subscribeSource } from 'virtual:$histoire-embed-source'
import { installEmbedHandshake } from './handshake.js'
import { createEmbedDocumentLifecycle } from './lifecycle.js'
import { createEmbedSourceConnection } from './source.js'
import './adapters/preview.js'
import './adapters/tests-surface.js'
import './adapters/controls.js'
import './adapters/content-surface.js'
import './adapters/navigation-surface.js'
import './adapters/explorer.js'

/** Data-only document bootstrap reused by later bridge/surface dispatch. */
export function bootstrapEmbedSource() {
  return createEmbedSourceConnection({ url: new URL(bookBase, window.location.origin).href, subscribe: subscribeSource })
}

/** Explicit document bootstrap: data bridge plus exact-parent handshake, no story imports. */
export function bootstrapEmbedDocument() {
  const sourceConnection = bootstrapEmbedSource()
  if (new URL(window.location.href).searchParams.get('view') === 'embed') {
    const lifecycle = createEmbedDocumentLifecycle(window)
    void sourceConnection.then(source => lifecycle.add(() => source.close())).catch(() => {})
    void import('./direct.js').then(({ bootstrapDirectEmbed }) => bootstrapDirectEmbed(sourceConnection, new URL(bookBase, window.location.origin).href, lifecycle)).catch(() => {
      if (!lifecycle.signal.aborted) document.body.textContent = 'Embed failed to load'
    })
    return sourceConnection
  }
  const lifecycle = installEmbedHandshake(sourceConnection)
  void sourceConnection.catch(() => lifecycle.close())
  return sourceConnection
}

export { createEmbedSurfaceCapabilities, implementedEmbedSurfaces } from './capabilities.js'
export { createEmbedSourceConnection } from './source.js'
export { registerEmbedSurface } from './surfaces.js'
export type { EmbedSurfaceContext, EmbedSurfaceInstance } from './surfaces.js'
