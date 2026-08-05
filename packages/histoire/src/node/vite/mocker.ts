import type { Plugin as VitePlugin } from 'vite'
import type { Context } from '../context.js'
import pc from 'picocolors'
import { importResolvedModule } from '../util/import-resolved.js'
import { tryResolveVitestModule } from '../util/resolve-vitest-package.js'
import { createVitestMockRpcPlugin } from '../vitest-mock-rpc.js'

/**
 * Builds the Vitest mocking plugins (`vi.mock`, automock, dynamic import
 * rewriting) from the project's own `@vitest/mocker`.
 *
 * Older Vitest versions or strict install layouts may not expose
 * `@vitest/mocker`: the run degrades to "no mocking support" with a warning
 * instead of crashing dev/build startup.
 * @param ctx The histoire context.
 * @returns The plugins to add, empty when mocking is unavailable.
 */
export async function createMockerPlugins(ctx: Context): Promise<VitePlugin[]> {
  const mockerModuleId = tryResolveVitestModule(ctx.root, '@vitest/mocker/node')
  if (!mockerModuleId) {
    console.warn(pc.yellow('Could not resolve @vitest/mocker from the project\'s vitest — Vitest mocking is disabled in Histoire.'))
    return []
  }

  const mocker = await importResolvedModule(mockerModuleId)

  if (ctx.mode === 'dev') {
    return [
      ...mocker.mockerPlugin({
        globalThisAccessor: '"__vitest_mocker__"',
      }),
      // The browser runtimes resolve mocks through Histoire's own correlated
      // events instead of the mocker's `vitest:mocks:*` ones, whose replies
      // are broadcast to every frame sharing this dev server.
      createVitestMockRpcPlugin(mocker),
    ]
  }

  return [
    mocker.hoistMocksPlugin(),
    mocker.automockPlugin(),
    mocker.dynamicImportPlugin({
      globalThisAccessor: '"__vitest_browser_runner__"',
    }),
  ]
}
