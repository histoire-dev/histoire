import type { Plugin as VitePlugin } from 'vite'
import type { Context } from '../context.js'
import type { BrowserRuntimePaths } from './resolve-paths.js'
import { createStoryImporterIdsGetter, isStoryVitestImporter } from './story-importer.js'
import { generateStoryVitestShim } from './story-vitest-shim/index.js'

const STORY_VITEST_SHIM_ID = '\0virtual:$histoire-story-vitest'

/**
 * Serves the browser-compatible `vitest` shim to story files.
 *
 * Only story files are redirected: everything else (the app, helpers imported
 * by real spec files) keeps the real `vitest` resolution.
 * @param ctx The histoire context.
 * @param paths Project module paths the shim re-exports from.
 */
export function createStoryVitestShimPlugin(ctx: Context, paths: BrowserRuntimePaths): VitePlugin {
  const getStoryImporterIds = createStoryImporterIdsGetter(ctx)

  return {
    name: 'histoire:story-vitest-shim',
    enforce: 'pre',
    resolveId(id, importer) {
      if (id === 'vitest' && isStoryVitestImporter(importer, getStoryImporterIds(), ctx.root)) {
        return STORY_VITEST_SHIM_ID
      }
    },
    load(id) {
      if (id !== STORY_VITEST_SHIM_ID) {
        return
      }

      return generateStoryVitestShim(paths)
    },
  }
}
