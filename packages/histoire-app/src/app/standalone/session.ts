import type { HistoireSourceDescriptor } from '@histoire/protocol'
import { createHistoireSessionWithAdapters } from '@histoire/sdk/internal'
import { mountLocalHistoireSurface } from '../../embed/adapters/local-mount.js'
import { createEmbedSourceConnection } from '../../embed/source.js'
import '../../embed/adapters/preview.js'
import '../../embed/adapters/tests-surface.js'
import '../../embed/adapters/controls.js'
import '../../embed/adapters/content-surface.js'
import '../../embed/adapters/navigation-surface.js'
import '../../embed/adapters/explorer.js'

/** Local metadata projection shares catalog/content services with opt-in external embeddings. */
export function createStandaloneSession(options: {
  /** Absolute source base independent of current story route. */
  url: string
  /** Internal passive matrix runtime mode; never part of public source book URL. */
  matrix?: boolean
  /** First-party virtual reader; never public descriptor discovery. */
  loadDescriptor: () => Promise<HistoireSourceDescriptor>
  /** Completed Vite publication listener, absent in static books. */
  subscribe: (listener: (descriptor: HistoireSourceDescriptor | null) => void) => () => void
}) {
  const runtimeBase = new URL(options.url)
  if (options.matrix) runtimeBase.searchParams.set('matrix', 'true')
  return createHistoireSessionWithAdapters({ url: options.url }, {
    connect: async ({ signal }) => createEmbedSourceConnection({ url: options.url, descriptor: await options.loadDescriptor(), actionBase: '__histoire/local/', signal, subscribe: options.subscribe }),
    mount: context => mountLocalHistoireSurface(context, runtimeBase.href, true),
  })
}
