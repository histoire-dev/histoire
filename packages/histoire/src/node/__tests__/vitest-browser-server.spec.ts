import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { TEST_HARNESS_ID } from '../virtual/index.js'
import { getHistoireBrowserRunConfig } from '../vitest-browser-config/run-config.js'
import { createBrowserRunContext, startBrowserOnlyDependencyRun, withVitestBrowserServer, writeProjectFiles } from './utils/vitest-browser-run.js'

it('isolates consecutive browser runs from reconnects to the previous server', async () => {
  let previousOrigin: string | undefined
  await startBrowserOnlyDependencyRun({}, undefined, async (server) => {
    previousOrigin = new URL(server.resolvedUrls!.local[0]).origin
  })
  expect(previousOrigin).toBeDefined()
  await startBrowserOnlyDependencyRun({}, undefined, async (server) => {
    expect(new URL(server.resolvedUrls!.local[0]).origin).not.toBe(previousOrigin)
  })
}, 60_000)

it('keeps browser-only dependencies in the client optimizer', async () => {
  for (const reachableDependencies of [false, true]) {
    const config = await startBrowserOnlyDependencyRun({ reachableDependencies })
    expect(config.environments.client.optimizeDeps.include).toContain('browser-only')
    expect(config.environments.__vitest__.optimizeDeps.include ?? []).not.toContain('browser-only')
  }
}, 60_000)

it('keeps the framework optimizer policy for the definition browser server', async () => {
  const config = await startBrowserOnlyDependencyRun({ reachableDependencies: true }, () => ({ optimizeDeps: { include: ['browser-only'], exclude: ['framework-exclude'] } }))
  const optimizer = config.environments.client.optimizeDeps
  expect(optimizer?.include).toContain('browser-only')
  // Vitest's own excludes stay: discovering its `msw/browser` client import
  // after the first optimization reloaded every tester page mid-run.
  expect(optimizer?.exclude).toEqual(expect.arrayContaining(['framework-exclude', 'msw', 'msw/browser']))
}, 60_000)

it('gives the browser server the framework Vite config, not only its plugins', async () => {
  // Nuxt's `#app` aliases never reached the browser server, so every story
  // importing Nuxt UI failed with `Missing "#app/config" specifier`.
  let channelStatus: number | undefined
  const browser = await startBrowserOnlyDependencyRun({}, root => ({
    resolve: { alias: { '#framework': join(root, 'framework') }, dedupe: ['framework-dedupe'] },
    publicDir: join(root, 'framework-public'),
    server: { port: 6006, fs: { allow: [root] }, watch: { ignored: ['**/framework/**'] } },
    css: { preprocessorOptions: { scss: { additionalData: '$framework: 1;' } } },
    plugins: [{
      name: 'run-channel',
      configureServer(server) {
        server.middlewares.use('/__run_channel__', (_req, res) => {
          res.statusCode = 204
          res.end()
        })
      },
    }],
  }), async (server) => {
    channelStatus = (await fetch(new URL('/__run_channel__', server.resolvedUrls!.local[0]), { method: 'POST' })).status
  })
  expect(browser.resolve.alias).toEqual(expect.arrayContaining([expect.objectContaining({ find: '#framework', replacement: expect.stringMatching(/framework$/) })]))
  expect(browser.resolve.dedupe).toContain('framework-dedupe')
  expect(browser.publicDir).toMatch(/framework-public$/)
  expect(browser.css.preprocessorOptions?.scss).toMatchObject({ additionalData: '$framework: 1;' })
  // Forwarded `server` options must not shadow run plugin middlewares.
  expect(channelStatus).toBe(204)
}, 60_000)

it('gives collection and test browser servers the framework optimizer lists', async () => {
  // CommonJS dependencies a framework pre-bundles (Nuxt's `vite.optimizeDeps`)
  // were served raw: "does not provide an export named 'default'".
  const config = await startBrowserOnlyDependencyRun({}, () => ({ optimizeDeps: { include: ['browser-only'], exclude: ['framework-exclude'] } }))
  const optimizer = config.environments.client.optimizeDeps
  expect(optimizer?.include).toContain('browser-only')
  expect(optimizer?.exclude).toContain('framework-exclude')
}, 60_000)

it.each([false, true])('resolves the test harness in test run specs (definitions=%s)', async (definitions) => {
  const root = await mkdtemp(join(tmpdir(), 'histoire-browser-harness-'))
  try {
    await writeProjectFiles(root, {
      'package.json': { type: 'module' },
      'harness.spec.ts': `import { collectVariantTests } from ${JSON.stringify(TEST_HARNESS_ID)}\nexport default collectVariantTests\n`,
    })
    const config = await getHistoireBrowserRunConfig(createBrowserRunContext(root), { collecting: false, definitions, entries: [] })
    await withVitestBrowserServer(root, config, async (server) => {
      // Import analysis fails on an import no plugin resolves.
      await expect(server.environments.client.transformRequest('/harness.spec.ts')).resolves.toBeTruthy()
    })
  }
  finally { await rm(root, { recursive: true, force: true }) }
}, 60_000)
