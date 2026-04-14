import type { HistoireTestCaseResultInput, HistoireTestRunSummary } from '@histoire/shared'
import type { TestModule } from 'vitest/node'
import type { Context } from './context.js'
import { createRequire } from 'node:module'
import { performance } from 'node:perf_hooks'
import { createHistoireTestSummary, serializeTestErrors } from '@histoire/shared'
import fs from 'fs-extra'
import { join, normalize, resolve } from 'pathe'
import pc from 'picocolors'
import { createVitest, parseCLI } from 'vitest/node'
import { createMarkdownFilesWatcher } from './markdown.js'
import { findAllStories } from './stories.js'
import { collectStoriesBrowser } from './story-collection.js'
import { hasProjectVitest } from './util/has-vitest.js'
import { fileHasOnTestCall } from './util/story-vitest.js'
import { assertVitestRunHasNoUnhandledErrors } from './util/vitest-errors.js'
import { RESOLVED_TEST_HARNESS_ID, TEST_HARNESS_ID } from './virtual/index.js'
import { getViteConfigWithPlugins } from './vite.js'
import { cleanupVitestBrowserRun } from './vitest-browser-cleanup.js'
import { assignVitestBrowserProjectOptions, createVitestBrowserRuntimeConfig, debugVitestBrowserLifecycle } from './vitest-browser-config.js'

/** Maximum time (ms) to wait for Vitest cleanup before failing the run. */
const CLEANUP_TIMEOUT = 10_000

const require = createRequire(import.meta.url)

export interface RunHistoireTestsOptions {
  rawVitestArgs?: string[]
  storyId?: string
  variantId?: string
  watch?: boolean
}

interface GeneratedSpecFile {
  path: string
  storyId: string
  variantId: string
}

export async function runHistoireTests(ctx: Context, options: RunHistoireTestsOptions = {}): Promise<HistoireTestRunSummary> {
  const startTime = performance.now()
  const hasExplicitSelection = Boolean(options.storyId || options.variantId)
  ensureProjectVitest(ctx)
  await findAllStories(ctx)
  {
    const { stop } = await createMarkdownFilesWatcher(ctx)
    await stop()
  }
  const eligibleStoryFiles = ctx.storyFiles.filter(fileHasOnTestCall)
  if (eligibleStoryFiles.length) {
    await collectStoriesBrowser(ctx, {
      storyFiles: eligibleStoryFiles,
    })
  }

  const specFiles = await generateSpecFiles(ctx, eligibleStoryFiles)
  const selectedSpecFiles = specFiles.filter((item) => {
    if (options.storyId && item.storyId !== options.storyId) return false
    if (options.variantId && item.variantId !== options.variantId) return false
    return true
  })
  if (hasExplicitSelection && selectedSpecFiles.length === 0) {
    console.warn(pc.yellow(formatNoMatchingTestsWarning(options)))
    return createEmptyTestSummary()
  }

  const { filter, options: vitestOptions } = parseCLI(['vitest', ...(options.rawVitestArgs ?? [])], {
    allowUnknownOptions: true,
  })
  const include = (hasExplicitSelection ? selectedSpecFiles : specFiles).map(item => item.path)
  if (include.length === 0) {
    return createEmptyTestSummary()
  }
  const runtimeConfig = await getTestVitestConfig(ctx, include)
  let retryCount = 0

  while (true) {
    let vitest: Awaited<ReturnType<typeof createVitest>> | undefined

    try {
      vitest = await createVitest('test', {
        config: false,
        run: !options.watch,
        watch: options.watch ?? false,
        passWithNoTests: true,
        include,
        ...runtimeConfig.vitestOptions,
        ...vitestOptions,
      }, runtimeConfig.viteConfig)
      assignVitestBrowserProjectOptions(vitest, runtimeConfig.vitestOptions)
      debugVitestBrowserLifecycle('test:starting vitest...')

      // Add a safety timeout around `start()` itself to prevent indefinite
      // hangs when the Vitest browser runner never finishes the run.
      const TEST_TIMEOUT = 300_000
      let testTimer: ReturnType<typeof setTimeout> | undefined
      await Promise.race([
        (async () => {
          await vitest.start(filter)
          debugVitestBrowserLifecycle('test:vitest.start() resolved')
        })(),
        new Promise<void>((_, reject) => {
          testTimer = setTimeout(() => {
            const modules = vitest!.state.getTestModules()
            const unhandled = vitest!.state?.getUnhandledErrors?.() ?? []
            console.error(pc.red('\nHistoire test run timed out'))
            console.error(pc.red(`  Test modules found: ${modules.length}`))
            console.error(pc.red(`  Unhandled errors: ${unhandled.length}`))
            for (const err of unhandled) {
              if (err instanceof Error) {
                console.error(pc.red(`  Unhandled: ${err.stack ?? err.message}`))
              }
              else if (typeof err === 'object' && err !== null) {
                console.error(pc.red(`  Unhandled: ${JSON.stringify(err, null, 2)}`))
              }
              else {
                console.error(pc.red(`  Unhandled: ${String(err)}`))
              }
            }
            reject(new Error('Histoire test run timed out. The Vitest browser runner never completed.'))
          }, TEST_TIMEOUT)
        }),
      ])
      clearTimeout(testTimer)
      assertVitestRunHasNoUnhandledErrors(vitest)

      const summary = summarizeResults(vitest.state.getTestModules(), specFiles)
      await cleanupVitestBrowserRun(vitest, {
        label: 'Histoire tests',
        timeoutMs: CLEANUP_TIMEOUT,
      })
      console.log(pc.blue(`Histoire tests finished in ${Math.round(performance.now() - startTime)}ms`))
      return summary
    }
    catch (error) {
      if (vitest) {
        await cleanupVitestBrowserRun(vitest, {
          label: 'Histoire tests',
          timeoutMs: CLEANUP_TIMEOUT,
        })
      }

      if (retryCount < 1 && shouldRetryBrowserRun(error, vitest)) {
        retryCount++
        console.warn(pc.yellow('Retrying Histoire tests after Vitest browser optimizer reload'))
        continue
      }

      throw error
    }
  }
}

async function getTestVitestConfig(ctx: Context, entries: string[]) {
  const { viteConfig } = await getViteConfigWithPlugins(false, ctx, {
    browserRuntime: true,
  })
  return createVitestBrowserRuntimeConfig(ctx, viteConfig, {
    define: {
      'process.env.HST_COLLECT': 'false',
      '__HST_COLLECT__': 'false',
    },
    optimizeDeps: {
      entries,
      force: true,
    },
    resolveAlias: {
      [TEST_HARNESS_ID]: RESOLVED_TEST_HARNESS_ID,
    },
  })
}

async function generateSpecFiles(ctx: Context, storyFiles = ctx.storyFiles): Promise<GeneratedSpecFile[]> {
  const root = resolve(ctx.root, '.histoire', 'tmp', 'tests')
  await fs.emptyDir(root)
  const results: GeneratedSpecFile[] = []

  for (const storyFile of storyFiles) {
    if (!storyFile.story) continue

    for (const variant of storyFile.story.variants) {
      const specPath = join(
        root,
        storyFile.relativePath.replace(/\.[^.]+$/, ''),
        `${sanitizeFileSegment(variant.id)}.histoire.spec.ts`,
      )
      await fs.ensureDir(join(specPath, '..'))
      await fs.writeFile(specPath, generateSpecCode(storyFile.story.id, variant.id, storyFile.story.title, variant.title), 'utf8')
      results.push({
        path: specPath,
        storyId: storyFile.story.id,
        variantId: variant.id,
      })
    }
  }

  return results
}

function generateSpecCode(storyId: string, variantId: string, storyTitle: string, variantTitle: string) {
  return `import { describe, test } from 'vitest'
import { collectVariantTests, runCollectedTest } from ${JSON.stringify(TEST_HARNESS_ID)}

const definitions = await collectVariantTests(${JSON.stringify(storyId)}, ${JSON.stringify(variantId)})

describe(${JSON.stringify(`${storyTitle} > ${variantTitle}`)}, () => {
  for (const definition of definitions) {
    test(definition.fullName, async () => {
      await runCollectedTest(${JSON.stringify(storyId)}, ${JSON.stringify(variantId)}, definition)
    })
  }
})
`
}

function summarizeResults(testModules: TestModule[], specFiles: GeneratedSpecFile[]): HistoireTestRunSummary {
  const fileMap = new Map(specFiles.map(item => [normalize(item.path), item]))
  const groupedTests = new Map<string, {
    storyId: string
    variantId: string
    tests: HistoireTestCaseResultInput[]
  }>()

  for (const module of testModules) {
    const meta = fileMap.get(normalize(module.moduleId))
    const key = `${meta?.storyId ?? 'unknown'}:${meta?.variantId ?? 'unknown'}`
    for (const task of module.children.allTests()) {
      const result = task.result()
      const state = result.state === 'passed' ? 'passed' : result.state === 'skipped' ? 'skipped' : 'failed'
      const serializedErrors = serializeTestErrors((result.errors ?? []) as unknown[])
      const bucket = groupedTests.get(key)

      if (bucket) {
        bucket.tests.push({ name: task.name, state, errors: serializedErrors })
      }
      else {
        groupedTests.set(key, {
          storyId: meta?.storyId ?? 'unknown',
          variantId: meta?.variantId ?? 'unknown',
          tests: [{ name: task.name, state, errors: serializedErrors }],
        })
      }
    }
  }

  const summary: HistoireTestRunSummary = {
    ok: true,
    total: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    errors: [],
    tests: [],
  }

  for (const bucket of groupedTests.values()) {
    const partial = createHistoireTestSummary(bucket.storyId, bucket.variantId, bucket.tests)
    summary.ok = summary.ok && partial.ok
    summary.total += partial.total
    summary.passed += partial.passed
    summary.failed += partial.failed
    summary.skipped += partial.skipped
    summary.errors.push(...partial.errors)
    summary.tests.push(...partial.tests)
  }

  return summary
}

function sanitizeFileSegment(value: string) {
  return value.replace(/[^\w.-]/gi, '_')
}

/**
 * Creates empty summary for zero-match histoire test runs.
 */
function createEmptyTestSummary(): HistoireTestRunSummary {
  return {
    ok: true,
    total: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    errors: [],
    tests: [],
  }
}

/**
 * Formats warning when explicit filters produce no runnable story tests.
 */
function formatNoMatchingTestsWarning(options: RunHistoireTestsOptions) {
  const filters = [
    options.storyId ? `storyId="${options.storyId}"` : null,
    options.variantId ? `variantId="${options.variantId}"` : null,
  ].filter(Boolean).join(', ')

  return `No histoire tests matched ${filters}. Skipping test run.`
}

function shouldRetryBrowserRun(error: unknown, vitest?: Awaited<ReturnType<typeof createVitest>>) {
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

export async function ensureBrowserTestDepsInstalled() {
  require.resolve('@vitest/browser-playwright')
  require.resolve('playwright')
}

function ensureProjectVitest(ctx: Context) {
  if (!hasProjectVitest(ctx.root)) {
    throw new Error('Vitest must be installed in the target project to run Histoire browser-mode tests.')
  }
}
