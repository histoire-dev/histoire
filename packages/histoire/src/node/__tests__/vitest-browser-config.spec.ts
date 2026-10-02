import type { Context } from '../context.js'
import fs from 'node:fs'
import { readFile } from 'node:fs/promises'
import { expect, it, vi } from 'vitest'
import { getDefaultConfig } from '../config/index.js'
import { resolveVitestModule } from '../util/resolve-vitest-package.js'
import { getVitestBrowserDependencyNames } from '../vitest-browser-config/dependencies.js'
import { createVitestBrowserResolvePlugin } from '../vitest-browser-config/index.js'
import { getHistoireBrowserRunConfig } from '../vitest-browser-config/run-config.js'

function createContext(): Context {
  const root = process.cwd()

  return {
    root,
    config: getDefaultConfig(),
    resolvedViteConfig: { root } as Context['resolvedViteConfig'],
    mode: 'dev',
    storyFiles: [],
    supportPlugins: [],
    markdownFiles: [],
    registeredCommands: [],
  }
}

it('keeps installed Node Playwright providers out of browser dependency optimization', () => {
  const read = vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify({
    dependencies: { 'vue': '3', 'playwright': '1', 'playwright-core': '1' },
    devDependencies: { '@playwright/test': '1', '@vitest/browser-playwright': '4', 'client-library': '1' },
  }))
  try {
    expect(getVitestBrowserDependencyNames({ root: '/consumer', supportPlugins: [] } as Context)).toEqual(['vue', 'client-library'])
  }
  finally { read.mockRestore() }
})

it('reuses the dep-optimizer cache between runs instead of forcing prebundles', async () => {
  const ctx = createContext()
  const collection = await getHistoireBrowserRunConfig(ctx, { collecting: true, entries: ['/spec.ts'] })
  const test = await getHistoireBrowserRunConfig(ctx, { collecting: false, entries: ['/spec.ts'] })

  // With `force: true` every `histoire test` ran two full esbuild prebundles
  // of the project's entire dependency list (collection + test phase) — the
  // dominant cost of a run. Vite validates its cache against the config and
  // lockfile hash, so re-optimization still happens when it must.
  expect(collection.viteConfig.optimizeDeps?.force).toBeFalsy()
  expect(test.viteConfig.optimizeDeps?.force).toBeFalsy()
  expect(collection.viteConfig.test.deps.optimizer.client.force).toBeFalsy()
  expect(test.viteConfig.test.deps.optimizer.client.force).toBeFalsy()

  // The caches must live OUTSIDE the tmp dirs that are emptied on every run,
  // apart from each other, and apart from the app dev server's cache (a shared
  // dir would ping-pong invalidate between the two configs).
  expect(collection.viteConfig.cacheDir).toBe(`${ctx.root}/.histoire/cache/vitest-collect`)
  expect(test.viteConfig.cacheDir).toBe(`${ctx.root}/.histoire/cache/vitest-test`)
})

it('bakes the collection flag matching the kind of run', async () => {
  const ctx = createContext()
  const collection = await getHistoireBrowserRunConfig(ctx, { collecting: true, entries: [] })
  const test = await getHistoireBrowserRunConfig(ctx, { collecting: false, entries: [] })

  expect(collection.viteConfig.define?.__HST_COLLECT__).toBe('true')
  expect(test.viteConfig.define?.__HST_COLLECT__).toBe('false')
  // Story modules run one file at a time while collecting: they execute real
  // story setup (mocks, global setup) in a shared page.
  expect(collection.viteConfig.test.fileParallelism).toBe(false)
  expect(test.viteConfig.test.fileParallelism).toBeUndefined()
})

it('runs against the Vitest major its @internal patches were verified on', async () => {
  // `getVitestBrowserProjectConfig`/`assignVitestBrowserProjectOptions` write
  // Vitest-internal surfaces (`provider.serverFactory`, `project.options`)
  // — the only channel accepting extra Vite plugins for the browser server.
  // A major bump silently reshapes them, so it must break here first.
  const vitestPackageJson = JSON.parse(
    await readFile(resolveVitestModule(process.cwd(), 'vitest/package.json'), 'utf8'),
  ) as { version: string }
  const peerRange = JSON.parse(await readFile(new URL('../../../package.json', import.meta.url), 'utf8')) as {
    peerDependencies: Record<string, string>
  }

  expect(vitestPackageJson.version.split('.')[0]).toBe('4')
  expect(peerRange.peerDependencies.vitest).toBe('^4.0.0')
})

it('creates the browser resolve plugin when optional testing-library packages are missing', () => {
  expect(() => createVitestBrowserResolvePlugin()).not.toThrow()
})

it('stubs expect-type in the browser runtime', async () => {
  const plugin = createVitestBrowserResolvePlugin()
  const resolvedId = await plugin.resolveId?.('expect-type')
  const code = await plugin.load?.(resolvedId as string)

  expect(resolvedId).toBe('\0histoire:expect-type-stub')
  expect(code).toContain('expectTypeOf')
})
