import { registerEmbedSurface } from '../surfaces.js'
import { createLazyEmbedSurface } from './lazy-surface.js'

/** Metadata bootstrap registers names only; UI module loads on explicit mount. */
registerEmbedSurface('tests', context => createLazyEmbedSurface(context, async () => {
  const { createEmbedTestsView } = await import('./tests-view.js')
  context.signal.throwIfAborted()
  return createEmbedTestsView(context)
}))
