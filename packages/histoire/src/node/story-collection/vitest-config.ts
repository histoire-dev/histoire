import type { Context } from '../context.js'
import type { createCollectionChannel } from './channel.js'
import { getHistoireBrowserRunConfig } from '../vitest-browser-config/run-config.js'

/** The Vite plugin exposing the collection results endpoint. */
type CollectionChannelPlugin = ReturnType<typeof createCollectionChannel>['plugin']

/**
 * Builds the Vitest browser config of a story collection run.
 * @param ctx The histoire context.
 * @param specFiles The generated collection specs, also used as optimizer entries.
 * @param channelPlugin The plugin exposing the collection results endpoint.
 */
export async function getCollectionVitestConfig(ctx: Context, specFiles: string[], channelPlugin: CollectionChannelPlugin) {
  return getHistoireBrowserRunConfig(ctx, {
    collecting: true,
    entries: specFiles,
    plugins: [channelPlugin],
  })
}
