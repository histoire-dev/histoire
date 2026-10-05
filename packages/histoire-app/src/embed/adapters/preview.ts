import { registerEmbedSurface } from '../surfaces.js'
import { createEmbedRuntimeFrame } from './runtime-frame.js'

/** Registration imports metadata-safe adapter only; story modules execute after explicit mount. */
registerEmbedSurface('preview', context => createEmbedRuntimeFrame(context, 'single'))
registerEmbedSurface('grid', context => createEmbedRuntimeFrame(context, 'grid'))
