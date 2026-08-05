import type { Plugin as VitePlugin } from 'vite'
import type { Context } from '../context.js'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'pathe'
import { resolveVitestModule } from '../util/resolve-vitest-package.js'
import {
  BROWSER_COLLECTOR_ID,
  GENERATED_GLOBAL_SETUP,
  GENERATED_SETUP_CODE,
  NOOP_ID,
  PREVIEW_RUNTIME_ID,
  RESOLVED_BROWSER_COLLECTOR_ID,
  RESOLVED_GENERATED_GLOBAL_SETUP,
  RESOLVED_GENERATED_SETUP_CODE,
  RESOLVED_PREVIEW_RUNTIME_ID,
  RESOLVED_TEST_HARNESS_ID,
  SETUP_ID,
  TEST_HARNESS_ID,
} from '../virtual/index.js'
import { ID_SEPARATOR } from '../virtual/util.js'

const require = createRequire(import.meta.url)
const histoireRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
const EXPECT_TYPE_STUB_ID = '\0histoire:expect-type-stub'

/**
 * Maps the ids the browser runtime imports to concrete files, so a single
 * copy of Vitest (the project's own) is used everywhere.
 * @param root Project root, falling back to the histoire package itself.
 */
function getResolvedIds(root?: string) {
  const resolveFromVitest = (id: string) => resolveVitestModule(root ?? histoireRoot, id)
  const vitestDir = dirname(resolveFromVitest('vitest/package.json'))
  const vitestBrowserDir = dirname(resolveFromVitest('@vitest/browser/package.json'))

  return {
    'vitest': resolve(vitestDir, 'dist/index.js'),
    'vitest/internal/browser': resolve(vitestDir, 'dist/browser.js'),
    '@vitest/browser/dist/context.js': resolve(vitestBrowserDir, 'dist/context.js'),
    '@vitest/runner': resolveFromVitest('@vitest/runner'),
    'vitest/runners': resolve(vitestDir, 'dist/runners.js'),
    [BROWSER_COLLECTOR_ID]: RESOLVED_BROWSER_COLLECTOR_ID,
    [TEST_HARNESS_ID]: RESOLVED_TEST_HARNESS_ID,
    [PREVIEW_RUNTIME_ID]: RESOLVED_PREVIEW_RUNTIME_ID,
    ...getOptionalResolvedIds(root, [
      '@testing-library/dom',
      '@testing-library/user-event',
    ]),
  }
}

/**
 * Resolves optional browser helpers only when the host project provides them.
 */
function getOptionalResolvedIds(root: string | undefined, ids: string[]) {
  const projectRequire = root ? createRequire(resolve(root, 'package.json')) : require

  return Object.fromEntries(ids.flatMap((id) => {
    try {
      return [[id, projectRequire.resolve(id)]]
    }
    catch {
      return []
    }
  }))
}

/**
 * Vite plugin resolving Histoire's virtual browser-runtime ids, the project's
 * Vitest copy, and the user setup file for a browser (or server) run.
 * @param ctx The histoire context; omitted in the standalone/config-less path.
 * @param isServer Selects the `server` half of a split `setupFile` config.
 */
export function createVitestBrowserResolvePlugin(ctx?: Context, isServer = false): VitePlugin {
  const resolvedIds = getResolvedIds(ctx?.root)

  return {
    name: 'histoire-vitest-browser-resolve',
    enforce: 'pre',
    async resolveId(id, importer) {
      if (id in resolvedIds) {
        return resolvedIds[id]
      }

      if (id === 'expect-type') {
        return EXPECT_TYPE_STUB_ID
      }

      if (id.startsWith(GENERATED_GLOBAL_SETUP)) {
        return RESOLVED_GENERATED_GLOBAL_SETUP
      }

      if (id.startsWith(GENERATED_SETUP_CODE)) {
        const [, index] = id.split(ID_SEPARATOR)
        return `${RESOLVED_GENERATED_SETUP_CODE}${ID_SEPARATOR}${index}`
      }

      if (id.startsWith('virtual:story:')) {
        return `\0${id}`
      }

      if (id.startsWith(SETUP_ID)) {
        const setupFileConfig = ctx?.config.setupFile
        if (!setupFileConfig) {
          return NOOP_ID
        }

        let file: string | undefined
        if (typeof setupFileConfig === 'string') {
          file = setupFileConfig
        }
        else if (isServer && 'server' in setupFileConfig) {
          file = setupFileConfig.server
        }
        else if (!isServer && 'browser' in setupFileConfig) {
          file = setupFileConfig.browser
        }

        if (!file || !ctx) {
          return NOOP_ID
        }

        return await this.resolve(resolve(ctx.root, file), importer, {
          skipSelf: true,
        })
      }
    },
    load(id) {
      if (id === EXPECT_TYPE_STUB_ID) {
        return 'export const expectTypeOf = () => ({})\n'
      }
    },
  }
}
