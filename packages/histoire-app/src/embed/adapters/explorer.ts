import { registerEmbedSurface } from '../surfaces.js'
import { createLazyEmbedSurface } from './lazy-surface.js'

/** Explorer imports reusable Vue only when explicitly mounted, never metadata access. */
registerEmbedSurface('explorer', context => createLazyEmbedSurface(context, async () => {
  const module = await import('./explorer-view.js')
  context.signal.throwIfAborted()
  return module.createEmbedExplorerView(context)
}))
