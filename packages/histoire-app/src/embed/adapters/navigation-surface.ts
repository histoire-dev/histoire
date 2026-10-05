import { registerEmbedSurface } from '../surfaces.js'
import { createLazyEmbedSurface } from './lazy-surface.js'

/** Register names only; metadata connection never imports Vue panels or story modules. */
for (const surface of ['tree', 'search', 'toolbar', 'events'] as const) {
  registerEmbedSurface(surface, context => createLazyEmbedSurface(context, async () => {
    const { createEmbedNavigationView } = await import('./navigation-view.js')
    context.signal.throwIfAborted()
    return createEmbedNavigationView(context, surface)
  }))
}
