import type { Plugin as VitePlugin } from 'vite'
import type { Context } from '../context.js'
import type { BrowserRuntimePaths } from './resolve-paths.js'
import { generateStoryVitestShim } from './story-vitest-shim/index.js'
import { isVitestRuntimeImporter } from './vitest-collect-stub.js'

const STORY_VITEST_SHIM_ID = '\0virtual:$histoire-story-vitest'

/**
 * Serves the browser-compatible `vitest` shim to story files.
 *
 * Components, setup modules and imported helpers can also register story
 * tests. Vitest's own browser runtime retains its real exports.
 * @param ctx The histoire context.
 * @param paths Project module paths the shim re-exports from.
 */
export function createStoryVitestShimPlugin(ctx: Context, paths: BrowserRuntimePaths): VitePlugin {
  return {
    name: 'histoire:story-vitest-shim',
    enforce: 'pre',
    resolveId(id, importer) {
      if (id === 'vitest' && importer && !isVitestRuntimeImporter(importer) && !/\.histoire\.spec\.[^/?]+(?:\?|$)/.test(importer)) {
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
