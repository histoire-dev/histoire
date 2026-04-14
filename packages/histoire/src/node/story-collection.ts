import type { ServerStory, ServerStoryFile } from '@histoire/shared'
import type { TestModule, Vitest } from 'vitest/node'
import type { Context } from './context.js'
import { performance } from 'node:perf_hooks'
import fs from 'fs-extra'
import { join, relative, resolve } from 'pathe'
import pc from 'picocolors'
import { createServer as createViteServer, mergeConfig as mergeViteConfig } from 'vite'
import { createVitest } from 'vitest/node'
import { finalizeCollectedStoryFile } from './collect/finalize.js'
import { useCollectStories } from './collect/index.js'
import { getCollectionVitestCliOptions } from './collect/reporter.js'
import { formatVitestError } from './util/vitest-errors.js'
import { browserCollector } from './virtual/browser-collector.js'
import { resolvedSupportPluginsCollect } from './virtual/resolved-support-plugins-collect.js'
import { getViteConfigWithPlugins } from './vite.js'
import { cleanupVitestBrowserRun } from './vitest-browser-cleanup.js'
import { assignVitestBrowserProjectOptions, createVitestBrowserRuntimeConfig, debugVitestBrowserLifecycle } from './vitest-browser-config.js'

const BROWSER_COLLECTION_ENDPOINT = '/__histoire_browser_collect__'

/** Maximum time (ms) to wait for the browser collection vitest run before aborting. */
const COLLECTION_TIMEOUT = 120_000

/** Maximum time (ms) to wait for Vitest cleanup before failing the run. */
const CLEANUP_TIMEOUT = 10_000

interface BrowserCollectedStoryResult {
  file: string
  storyData: ServerStory[]
}

export interface CollectStoriesBrowserOptions {
  storyFiles?: Context['storyFiles']
}

export async function collectStoriesNode(ctx: Context) {
  const { viteConfig } = await getViteConfigWithPlugins(false, ctx, {
    browserRuntime: true,
    collecting: true,
  })
  const server = await createViteServer(mergeViteConfig(viteConfig, {
    optimizeDeps: {
      include: [],
      noDiscovery: true,
    },
  }))
  await server.pluginContainer.buildStart({})

  const { executeStoryFile, destroy } = useCollectStories({
    server,
    throws: true,
  }, ctx)

  try {
    await Promise.all(ctx.storyFiles.map(file => executeStoryFile(file)))
  }
  finally {
    await destroy()
    await server.close()
  }
}

export async function collectStoriesBrowser(ctx: Context, options: CollectStoriesBrowserOptions = {}) {
  const startTime = performance.now()
  const collectionVitestCliOptions = getCollectionVitestCliOptions()
  let retryCount = 0
  const storyFiles = options.storyFiles ?? ctx.storyFiles

  while (true) {
    const channel = createCollectionChannel()
    const runToken = `${Date.now().toString(36)}:${Math.random().toString(36).slice(2)}`
    const specFiles = await generateCollectionSpecFiles(ctx, runToken, storyFiles)
    const { vitestOptions, viteConfig } = await getCollectionVitestConfig(ctx, specFiles, channel.plugin)
    let vitest: Awaited<ReturnType<typeof createVitest>> | undefined

    try {
      vitest = await createVitest('test', {
        config: false,
        run: true,
        watch: false,
        passWithNoTests: true,
        include: specFiles,
        ...collectionVitestCliOptions,
        ...vitestOptions,
      }, viteConfig)
      debugVitestBrowserLifecycle('collect:createVitest:done', specFiles.length)
      assignVitestBrowserProjectOptions(vitest, vitestOptions)
      debugVitestBrowserLifecycle('collect:starting vitest...')

      // Add a safety timeout around vitest.start() itself — if the browser
      // pool never finishes initializing, this prevents an indefinite hang.
      let collectionTimer: ReturnType<typeof setTimeout> | undefined
      const startResult = await Promise.race([
        vitest.start([]).then(() => 'ok' as const),
        new Promise<'timeout'>((resolve) => {
          collectionTimer = setTimeout(() => {
            // Log diagnostic info when start() times out
            const modules = vitest.state.getTestModules()
            const unhandled = vitest.state?.getUnhandledErrors?.() ?? []
            console.error(pc.red('\nHistoire browser collection: vitest.start() timed out'))
            console.error(pc.red(`  Test modules found: ${modules.length}`))
            console.error(pc.red(`  Unhandled errors: ${unhandled.length}`))
            for (const mod of modules) {
              const errs = mod.errors()
              console.error(pc.red(`  Module ${mod.moduleId}: errors=${errs.length}`))
              for (const err of errs) {
                console.error(pc.red(`    ${formatVitestError(err)}`))
              }
            }
            for (const err of unhandled) {
              console.error(pc.red(`  Unhandled: ${formatVitestError(err)}`))
            }
            resolve('timeout')
          }, COLLECTION_TIMEOUT)
        }),
      ])
      clearTimeout(collectionTimer)

      if (startResult === 'timeout') {
        throw new Error(
          'Histoire browser collection timed out during vitest.start(). '
          + 'The Vitest browser runner never completed. This usually means the browser '
          + 'failed to load or execute the test files. Check if Playwright browsers are installed.',
        )
      }

      debugVitestBrowserLifecycle('collect:vitest.start() resolved')
      debugVitestBrowserLifecycle('collect:start:done', vitest.state.getTestModules().length)
      const payload = channel.read(runToken)
      assertCollectionRunOk(storyFiles, vitest, vitest.state.getTestModules(), payload)
      debugVitestBrowserLifecycle('collect:assert:done', payload.results.size)
      applyCollectedStories(ctx, payload.results)
      debugVitestBrowserLifecycle('collect:apply:done')
      await cleanupVitestBrowserRun(vitest, {
        label: 'Browser story collection',
        timeoutMs: CLEANUP_TIMEOUT,
      })
      console.log(pc.blue(`Browser story collection finished in ${Math.round(performance.now() - startTime)}ms`))
      return
    }
    catch (error) {
      if (vitest) {
        await cleanupVitestBrowserRun(vitest, {
          label: 'Browser story collection',
          timeoutMs: CLEANUP_TIMEOUT,
        })
      }

      if (retryCount < 1 && shouldRetryBrowserCollection(error, vitest)) {
        retryCount++
        console.warn(pc.yellow('Retrying browser story collection after Vitest browser optimizer reload'))
        continue
      }

      throw error
    }
  }
}

async function getCollectionVitestConfig(ctx: Context, specFiles: string[], channelPlugin: any) {
  const { viteConfig } = await getViteConfigWithPlugins(false, ctx, {
    browserRuntime: true,
    collecting: true,
  })
  viteConfig.plugins = [...((viteConfig.plugins as any[] | undefined) ?? []), channelPlugin]
  viteConfig.optimizeDeps = {
    ...viteConfig.optimizeDeps,
    include: [],
    entries: specFiles,
    noDiscovery: true,
    force: true,
  }
  viteConfig.cacheDir = resolve(ctx.root, '.histoire', 'tmp', 'collect', 'vite-cache')
  return createVitestBrowserRuntimeConfig(ctx, viteConfig, {
    define: {
      'process.env.HST_COLLECT': 'true',
      '__HST_COLLECT__': 'true',
    },
    optimizeDeps: {
      entries: specFiles,
      force: true,
    },
    test: {
      fileParallelism: false,
      maxWorkers: 1,
      minWorkers: 1,
      browser: {
        enabled: true,
        headless: true,
        instances: [{ browser: 'chromium' }],
      },
    },
  })
}

export async function generateCollectionSpecFiles(
  ctx: Context,
  runToken: string,
  storyFiles = ctx.storyFiles,
) {
  const root = resolve(ctx.root, '.histoire', 'tmp', 'collect')
  await fs.emptyDir(root)
  const browserStoryFiles = await generateBrowserStoryModuleFiles(ctx, root, storyFiles)
  const collectorModulePath = join(root, 'browser-collector.histoire.mjs')
  await fs.writeFile(collectorModulePath, generateCollectorModuleCode(ctx, browserStoryFiles), 'utf8')
  const files: string[] = []

  for (const storyFile of storyFiles) {
    const tempStoryPath = getTempStoryPath(storyFile.relativePath)
    const specPath = join(root, tempStoryPath.replace(/\.[^.]+$/, ''), 'collect.histoire.spec.ts')
    await fs.ensureDir(join(specPath, '..'))
    // Use relative path from spec file to collector module so vitest browser mode can resolve it
    const specDir = join(specPath, '..')
    const relativeCollectorPath = relative(specDir, collectorModulePath)
    const normalizedRelativePath = relativeCollectorPath.startsWith('.') ? relativeCollectorPath : `./${relativeCollectorPath}`
    await fs.writeFile(specPath, generateCollectionSpecCode(storyFile.relativePath, normalizedRelativePath, runToken), 'utf8')
    files.push(specPath)
  }

  return files
}

async function generateBrowserStoryModuleFiles(
  ctx: Context,
  root: string,
  storyFiles = ctx.storyFiles,
) {
  return await Promise.all(storyFiles.map(async (storyFile) => {
    if (!storyFile.virtual || !storyFile.moduleCode) {
      return {
        id: storyFile.id,
        path: storyFile.path,
        relativePath: storyFile.relativePath,
        fileName: storyFile.fileName,
        supportPluginId: storyFile.supportPluginId,
        moduleId: storyFile.moduleId,
        virtual: storyFile.virtual,
      }
    }

    const modulePath = join(root, 'story-modules', getTempStoryPath(storyFile.relativePath).replace(/\.[^.]+$/, '.histoire.mjs'))
    await fs.ensureDir(join(modulePath, '..'))
    await fs.writeFile(modulePath, storyFile.moduleCode, 'utf8')

    return {
      id: storyFile.id,
      path: storyFile.path,
      relativePath: storyFile.relativePath,
      fileName: storyFile.fileName,
      supportPluginId: storyFile.supportPluginId,
      moduleId: modulePath,
      virtual: false,
    }
  }))
}

function generateCollectionSpecCode(relativePath: string, collectorModulePath: string, runToken: string) {
  return `import { test } from 'vitest'
import { collectStoryFile } from ${JSON.stringify(collectorModulePath)}

async function postResult(payload) {
  const response = await fetch(${JSON.stringify(BROWSER_COLLECTION_ENDPOINT)}, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!response.ok) {
    throw new Error(\`Failed to persist histoire browser collection result for ${relativePath}: \${response.status}\`)
  }
}

test('collect histoire story', async () => {
  try {
    const result = await collectStoryFile(${JSON.stringify(relativePath)})
    await postResult({
      token: ${JSON.stringify(runToken)},
      file: ${JSON.stringify(relativePath)},
      result,
    })
  }
  catch (error) {
    await postResult({
      token: ${JSON.stringify(runToken)},
      file: ${JSON.stringify(relativePath)},
      failure: {
        file: ${JSON.stringify(relativePath)},
        error: error instanceof Error ? (error.stack ?? error.message) : String(error),
      },
    })
    throw error
  }
})
`
}

function generateCollectorModuleCode(ctx: Context, storyFiles: Array<{
  id: string
  path: string
  relativePath: string
  fileName: string
  supportPluginId: string
  moduleId: string
  virtual: boolean
}>) {
  return `${resolvedSupportPluginsCollect(ctx)}

${browserCollector(ctx, storyFiles).replace('import { collectSupportPlugins } from \'virtual:$histoire-support-plugins-collect\'\n\n', '')}
`
}

function createCollectionChannel() {
  const runs = new Map<string, {
    results: Map<string, BrowserCollectedStoryResult>
    failures: Map<string, { error: string }>
  }>()

  return {
    plugin: {
      name: 'histoire-browser-collection-channel',
      configureServer(server: any) {
        server.middlewares.use(BROWSER_COLLECTION_ENDPOINT, async (req: any, res: any, next: any) => {
          if (req.method !== 'POST') {
            next()
            return
          }

          const payload = JSON.parse(await readRequestBody(req)) as {
            token: string
            file: string
            result?: BrowserCollectedStoryResult
            failure?: { error: string }
          }
          const run = runs.get(payload.token) ?? {
            results: new Map<string, BrowserCollectedStoryResult>(),
            failures: new Map<string, { error: string }>(),
          }
          runs.set(payload.token, run)

          if (payload.result) {
            run.results.set(payload.file, payload.result)
            run.failures.delete(payload.file)
          }
          if (payload.failure) {
            run.failures.set(payload.file, payload.failure)
          }

          res.statusCode = 204
          res.end()
        })
      },
    },
    read(token: string) {
      return runs.get(token) ?? {
        results: new Map<string, BrowserCollectedStoryResult>(),
        failures: new Map<string, { error: string }>(),
      }
    },
  }
}

function readRequestBody(req: NodeJS.ReadableStream) {
  return new Promise<string>((resolve, reject) => {
    let body = ''
    req.setEncoding?.('utf8')
    req.on('data', (chunk) => {
      body += chunk
    })
    req.on('end', () => resolve(body))
    req.on('error', reject)
  })
}

/**
 * Validates that the browser collection vitest run completed successfully.
 * Checks explicit channel failures, module-level errors (when test() never
 * registers), vitest unhandled errors, and missing collection results.
 */
function assertCollectionRunOk(storyFiles: Context['storyFiles'], vitest: Vitest, testModules: TestModule[], collectionPayload: {
  results: Map<string, { file: string }>
  failures: Map<string, { error: string }>
}) {
  const failures: string[] = []

  // Check explicit failures reported via the HTTP collection channel
  failures.push(...Array.from(collectionPayload.failures.values()).map(item => item.error))

  // Check vitest unhandled errors (e.g. uncaught exceptions in browser)
  const unhandledErrors = vitest.state?.getUnhandledErrors?.() ?? []
  if (unhandledErrors.length) {
    failures.push(...unhandledErrors.map((entry: unknown) => formatVitestError(entry)))
  }

  for (const module of testModules) {
    // Check module-level errors (e.g. syntax errors, import resolution failures
    // that prevent test() from registering)
    const moduleErrors = module.errors()
    if (moduleErrors.length) {
      failures.push(...moduleErrors.map(formatVitestError))
    }

    // Check individual test failures
    for (const task of module.children.allTests()) {
      const result = task.result()
      if (result.state === 'failed') {
        failures.push(...(result.errors ?? []).map(formatVitestError))
      }
    }
  }

  // Check for missing results — report all missing files at once instead of failing on the first
  const missing = storyFiles.filter(f => !collectionPayload.results.has(f.relativePath))
  if (missing.length && failures.length === 0) {
    // No explicit errors found but results are missing — likely a browser execution issue
    failures.push(
      `Missing browser collection results for ${missing.length} of ${storyFiles.length} story files.\n`
      + `This usually means the spec files failed to execute in the browser (e.g. import resolution error).\n`
      + `Run with HST_DEBUG_BROWSER=1 for more details.\n`
      + `Missing files:\n${missing.map(f => `  - ${f.relativePath}`).join('\n')}`,
    )
  }
  else if (missing.length) {
    failures.push(
      `Missing browser collection results for ${missing.length} file(s):\n${
        missing.map(f => `  - ${f.relativePath}`).join('\n')}`,
    )
  }

  if (failures.length) {
    throw new Error(`Histoire browser collection failed:\n\n${failures.join('\n\n')}`)
  }
}

function applyCollectedStories(ctx: Context, results: Map<string, BrowserCollectedStoryResult>) {
  for (const storyFile of ctx.storyFiles) {
    const collected = results.get(storyFile.relativePath)
    if (!collected) continue

    const draft: ServerStoryFile = {
      ...storyFile,
      story: collected.storyData[0],
    }

    finalizeCollectedStoryFile(draft, ctx)
    Object.assign(storyFile, draft)
  }
}

function getTempStoryPath(relativePath: string) {
  return relativePath.replace(/[\\/:]/g, '__')
}

function shouldRetryBrowserCollection(error: unknown, vitest?: Awaited<ReturnType<typeof createVitest>>) {
  const messages = [
    error instanceof Error ? (error.stack ?? error.message) : String(error),
    ...(vitest?.state?.getUnhandledErrors?.() ?? []).map((entry: unknown) => entry instanceof Error ? (entry.stack ?? entry.message) : String(entry)),
  ].join('\n')

  return (
    messages.includes('Failed to run the test')
    || messages.includes('Browser connection was closed while running tests')
    || messages.includes('rpc is closed, cannot call "createTesters"')
  )
}
