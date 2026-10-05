import type { HistoireSurface } from '@histoire/protocol'
import { registerEmbedSurface } from '../surfaces.js'
import { createLazyEmbedSurface } from './lazy-surface.js'

/** Registration is data-only; native UI/heavy content dependencies load only explicit mount. */
for (const surface of ['docs', 'source'] satisfies HistoireSurface[]) {
  registerEmbedSurface(surface, context => createLazyEmbedSurface(context, async () => {
    const module = await import('./content-view.js')
    if (context.signal.aborted) throw context.signal.reason
    return module.createEmbedContentView(context, surface)
  }))
}
