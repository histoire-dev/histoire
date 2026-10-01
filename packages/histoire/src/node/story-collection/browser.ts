import type { Vitest } from 'vitest/node'
import type { Context } from '../context.js'
import type { BrowserCollectionResult, CollectionSpecFile, CollectStoriesBrowserOptions } from './types.js'
import { performance } from 'node:perf_hooks'
import fs from 'fs-extra'
import pc from 'picocolors'
import { getCollectionVitestCliOptions } from '../collect/reporter.js'
import { getRunTempDir } from '../util/temp-paths.js'
import { getCollectTimeout } from '../util/test-timeouts.js'
import { runVitestAttempts } from '../util/vitest-run.js'
import { reportStuckVitestRun } from '../util/vitest-stuck-run.js'
import { debugVitestBrowserLifecycle } from '../vitest-browser-config/index.js'
import { applyCollectedStories } from './apply.js'
import { analyzeCollectionRun, createCollectionFailedError, formatStoryCollectionFailure } from './assert.js'
import { createCollectionChannel } from './channel.js'
import { generateCollectionSpecFiles } from './spec-files.js'
import { getCollectionVitestConfig } from './vitest-config.js'

/** Label used in the cleanup diagnostics of a collection run. */
const CLEANUP_LABEL = 'Browser story collection'

/** Attempt-scoped state a finished collection run is read with. */
interface CollectionAttemptContext {
  channel: ReturnType<typeof createCollectionChannel>
  runToken: string
  specFiles: CollectionSpecFile[]
}

/**
 * Prints what Vitest knows about a collection run that never finished starting.
 * @param vitest The Vitest instance of the stuck run.
 */
function reportStuckCollection(vitest: Vitest) {
  reportStuckVitestRun(vitest, 'Histoire browser collection: vitest.start() timed out')
}

/**
 * Collects the stories by executing them in a real browser through Vitest.
 *
 * Each story file gets its own generated spec; the results come back through an
 * HTTP channel and are then finalized onto (or beside) the context story files.
 * @param ctx The histoire context.
 * @param options Collection options (see {@link CollectStoriesBrowserOptions}).
 * @returns The finalized story files and the stories that failed to collect.
 */
export async function collectStoriesBrowser(ctx: Context, options: CollectStoriesBrowserOptions = {}): Promise<BrowserCollectionResult> {
  // Each collection owns its spec directory: a shared one emptied when the run
  // starts would delete the specs of any concurrent run in the same project
  // (a dev-server test run while `histoire build` collects, two CLI runs…).
  const specRoot = getRunTempDir(ctx.root, 'collect')

  try {
    return await collect(ctx, options, specRoot)
  }
  finally {
    // Remove the generated specs on every path, including failures.
    await fs.remove(specRoot).catch(() => {})
  }
}

/**
 * Generates the collection specs and runs them in the browser.
 * @param ctx The histoire context.
 * @param options Collection options (see {@link CollectStoriesBrowserOptions}).
 * @param specRoot Directory owned by this run, where the specs are generated.
 */
async function collect(ctx: Context, options: CollectStoriesBrowserOptions, specRoot: string): Promise<BrowserCollectionResult> {
  const startTime = performance.now()
  const collectionVitestCliOptions = getCollectionVitestCliOptions()
  const storyFiles = options.storyFiles ?? ctx.storyFiles
  const collectionTimeout = getCollectTimeout(ctx)

  const result = await runVitestAttempts<CollectionAttemptContext, BrowserCollectionResult>({
    label: CLEANUP_LABEL,
    retryMessage: 'Retrying browser story collection after Vitest browser optimizer reload',
    setup: async () => {
      const channel = createCollectionChannel()
      const runToken = `${Date.now().toString(36)}:${Math.random().toString(36).slice(2)}`
      const specFiles = await generateCollectionSpecFiles(ctx, runToken, specRoot, storyFiles)
      const specPaths = specFiles.map(spec => spec.path)
      const { vitestOptions, viteConfig } = await getCollectionVitestConfig(ctx, specPaths, channel.plugin)

      return {
        vitestOptions: {
          config: false,
          run: true,
          watch: false,
          passWithNoTests: true,
          include: specPaths,
          ...collectionVitestCliOptions,
          ...vitestOptions,
        },
        viteConfig,
        browserProjectOptions: vitestOptions,
        timeoutMs: collectionTimeout,
        timeoutMessage: 'Histoire browser collection timed out during vitest.start(). '
          + 'The Vitest browser runner never completed. This usually means the browser '
          + 'failed to load or execute the test files. Check if Playwright browsers are installed.',
        onTimeout: reportStuckCollection,
        context: { channel, runToken, specFiles },
      }
    },
    read: (vitest, { channel, runToken, specFiles }) => {
      debugVitestBrowserLifecycle('collect:start:done', vitest.state.getTestModules().length)
      const payload = channel.read(runToken)
      const diagnostics = analyzeCollectionRun(storyFiles, vitest, vitest.state.getTestModules(), payload, specFiles)
      // Story failures are reported alongside a fatal one: dropping them would
      // hide the story that broke behind a page-level symptom of it.
      if (diagnostics.fatalErrors.length) {
        throw createCollectionFailedError([
          ...diagnostics.fatalErrors,
          ...diagnostics.storyFailures.map(formatStoryCollectionFailure),
        ])
      }
      // Callers that need every story (the static build) still fail hard here.
      if (diagnostics.storyFailures.length && !options.tolerateStoryFailures) {
        throw createCollectionFailedError(diagnostics.storyFailures.map(formatStoryCollectionFailure))
      }
      debugVitestBrowserLifecycle('collect:assert:done', payload.results.size)
      const collected = applyCollectedStories(ctx, payload.results, {
        storyFiles,
        applyToContext: options.applyToContext,
      })
      debugVitestBrowserLifecycle('collect:apply:done')

      return {
        files: collected,
        failures: diagnostics.storyFailures,
      }
    },
  })

  console.log(pc.blue(`Browser story collection finished in ${Math.round(performance.now() - startTime)}ms`))
  return result
}
