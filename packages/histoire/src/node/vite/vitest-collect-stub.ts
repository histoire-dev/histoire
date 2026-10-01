import type { Plugin as VitePlugin } from 'vite'
import { existsSync } from 'node:fs'
import { resolve } from 'pathe'

/**
 * Resolves the `vitest` stub used while collecting stories.
 *
 * Uses the bundled `.js` when running built package code and the source `.ts`
 * during local source execution.
 */
function resolveVitestCollectStubPath() {
  const jsPath = resolve(import.meta.dirname, '../vendors/vitest-collect.js')
  if (existsSync(jsPath)) {
    return jsPath
  }

  return resolve(import.meta.dirname, '../vendors/vitest-collect.ts')
}

const vitestCollectStubPath = resolveVitestCollectStubPath()

/**
 * Detects imports made by Vitest's own browser runtime. Those imports must
 * resolve to real Vitest; replacing them with Histoire's story facade breaks
 * whenever Vitest adds a new internal public-export dependency.
 * @param importer Module requesting `vitest`.
 */
function isVitestRuntimeImporter(importer?: string) {
  const normalized = importer?.replaceAll('\\', '/')
  return normalized?.includes('/node_modules/@vitest/')
    || normalized?.includes('/node_modules/vitest/')
}

/**
 * Redirects user story/helper `vitest` imports to the collect stub.
 *
 * During collection the story modules only need `vi`/`expect`-shaped no-ops:
 * the real `vitest` entry either targets node (breaking in the browser) or
 * requires a live test runner that does not exist at collection time.
 * @param name The plugin name, kept distinct per collection mode so both can be
 * looked up (and asserted on) independently.
 */
function createVitestCollectStubPlugin(name: string): VitePlugin {
  return {
    name,
    enforce: 'pre',
    resolveId(id, importer) {
      if (id === 'vitest' && !isVitestRuntimeImporter(importer)) {
        return vitestCollectStubPath
      }
    },
  }
}

/**
 * Collect stub for the browser collection runtime.
 */
export function createBrowserCollectVitestStubPlugin(): VitePlugin {
  return createVitestCollectStubPlugin('histoire:collect-story-vitest-stub')
}

/**
 * Collect stub for the node-side collecting server.
 */
export function createNodeCollectVitestStubPlugin(): VitePlugin {
  return createVitestCollectStubPlugin('histoire:collect-vitest-stub')
}
