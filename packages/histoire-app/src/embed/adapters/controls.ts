import { registerEmbedSurface } from '../surfaces.js'
import { createLazyEmbedSurface } from './lazy-surface.js'

/** Registration remains metadata-safe; Vue/control code loads only for explicit surface. */
registerEmbedSurface('controls', context => createLazyEmbedSurface(context, () => import('./controls-view.js').then((module) => {
  context.signal.throwIfAborted()
  return module.createEmbedControlsView(context)
})))
