import type { Context } from '../context.js'
import { createRequire } from 'node:module'
import { dirname } from 'pathe'
import { resolveHistoireSharedEntry } from '../util/resolve-histoire-shared.js'
import { tryResolveDependency } from '../util/resolve-package.js'
import { tryResolveVitestModule } from '../util/resolve-vitest-package.js'

const require = createRequire(import.meta.url)

/**
 * Runtime entry of `@histoire/shared`, aliased into every Histoire Vite config
 * so the app and the browser runtimes share a single instance of it.
 */
export const histoireSharedPath = resolveHistoireSharedEntry()

/**
 * Packages whose install directory must be readable by the Vite dev server when
 * a browser runtime (story collection / test run) is in use.
 */
const BROWSER_RUNTIME_PACKAGE_IDS = [
  'vitest/package.json',
  '@vitest/browser/package.json',
  '@vitest/expect/package.json',
  '@vitest/mocker/package.json',
  '@vitest/runner/package.json',
  '@vitest/spy/package.json',
  '@testing-library/dom/package.json',
  '@testing-library/user-event/package.json',
]

export { tryResolveDependency, withPackageDirs } from '../util/resolve-package.js'

/**
 * Lists the directories of the support plugins (and of their `client`/`collect`
 * entries) so the dev server is allowed to serve files from them.
 * @param ctx The histoire context.
 */
export function resolveSupportPluginAllowPaths(ctx: Context): string[] {
  return ctx.supportPlugins.flatMap((plugin) => {
    const paths = [ctx.root, import.meta.url]
    const result = new Set<string>()

    for (const suffix of ['', '/client', '/collect']) {
      try {
        const resolved = require.resolve(`${plugin.moduleName}${suffix}`, {
          paths,
        })
        result.add(dirname(resolved))
      }
      catch {
        // Noop
      }
    }

    return Array.from(result)
  })
}

/**
 * Module paths the browser runtimes need, resolved from the user project.
 */
export interface BrowserRuntimePaths {
  /** Directories added to `server.fs.allow` for the browser runtime packages. */
  allowPaths: string[]
  /** Resolved `msw/browser` entry, aliased so stories and the runtime share one instance. */
  mswBrowser: string | null
  /** Resolved `msw/core/http` entry, aliased for the same reason. */
  mswCoreHttp: string | null
  /** Directories of the resolved msw entries, added to `server.fs.allow`. */
  mswAllowPaths: string[]
  /** Resolved `@vitest/expect`, used by the story `vitest` shim. */
  vitestExpect: string | null
  /** Resolved `@vitest/mocker/browser`, used by the story `vitest` shim. */
  vitestMockerBrowser: string | null
  /** Resolved `@vitest/spy`, used by the story `vitest` shim. */
  vitestSpy: string | null
}

/**
 * Resolves everything the browser-side runtimes need from the user project.
 *
 * All lookups are skipped when the project has no Vitest: the shim and the msw
 * aliases only exist to make story-level test/mocking code run in the browser.
 * @param ctx The histoire context.
 * @param projectHasVitest Whether Vitest is available in the user project.
 */
export function resolveBrowserRuntimePaths(ctx: Context, projectHasVitest: boolean): BrowserRuntimePaths {
  const allowPaths = projectHasVitest
    ? BROWSER_RUNTIME_PACKAGE_IDS.flatMap((id) => {
        // Vitest's own tree first (so `@vitest/*` matches the project's Vitest),
        // then the usual project-then-histoire lookup.
        const resolved = tryResolveVitestModule(ctx.root, id) ?? tryResolveDependency(ctx.root, id)
        return resolved ? [dirname(resolved)] : []
      })
    : []
  const mswBrowser = projectHasVitest
    ? tryResolveDependency(ctx.root, 'msw/browser')
    : null
  const mswCoreHttp = projectHasVitest
    ? tryResolveDependency(ctx.root, 'msw/core/http')
    : null

  return {
    allowPaths,
    mswBrowser,
    mswCoreHttp,
    mswAllowPaths: [mswBrowser, mswCoreHttp]
      .filter((value): value is string => Boolean(value))
      .map(dirname),
    vitestExpect: projectHasVitest
      ? tryResolveVitestModule(ctx.root, '@vitest/expect')
      : null,
    vitestMockerBrowser: projectHasVitest
      ? tryResolveVitestModule(ctx.root, '@vitest/mocker/browser')
      : null,
    vitestSpy: projectHasVitest
      ? tryResolveVitestModule(ctx.root, '@vitest/spy')
      : null,
  }
}
