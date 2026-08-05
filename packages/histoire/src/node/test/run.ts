import type { HistoireTestRunSummary } from '@histoire/shared'
import type { Context } from '../context.js'
import type { RunHistoireTestsOptions } from './types.js'
import { performance } from 'node:perf_hooks'
import fs from 'fs-extra'
import pc from 'picocolors'
import { parseCLI } from 'vitest/node'
import { scanMarkdownFiles } from '../markdown.js'
import { findAllStories } from '../stories.js'
import { collectStoriesBrowser } from '../story-collection/index.js'
import { getRunTempDir } from '../util/temp-paths.js'
import { getRunTimeout } from '../util/test-timeouts.js'
import { assertVitestRunHasNoUnhandledErrors } from '../util/vitest-errors.js'
import { runVitestAttempts } from '../util/vitest-run.js'
import { debugVitestBrowserLifecycle } from '../vitest-browser-config/index.js'
import { assertVitestModulesHaveNoErrors, reportStuckTestRun, warnAboutMissingTestModules } from './diagnostics.js'
import { ensureBrowserTestDepsInstalled, ensureProjectVitest } from './preflight.js'
import { generateSpecFiles } from './spec-files.js'
import { createEmptyTestSummary, summarizeResults } from './summary.js'
import { formatNoMatchingTestsWarning, getTargetStoryFiles, selectSpecFiles } from './targeting.js'
import { assertTargetedStoriesCollected, warnAboutUncollectedStories, withUncollectedStories } from './uncollected.js'
import { getTestVitestConfig } from './vitest-config.js'

/** Label used in the cleanup diagnostics of a test run. */
const CLEANUP_LABEL = 'Histoire tests'

/**
 * Runs the Histoire tests of a project (or of a single story/variant) in a real
 * browser through the project's own Vitest.
 * @param ctx The histoire context.
 * @param options Run options (see {@link RunHistoireTestsOptions}).
 */
export async function runHistoireTests(ctx: Context, options: RunHistoireTestsOptions = {}): Promise<HistoireTestRunSummary> {
  // Each run owns its spec directory: a shared one emptied at the start of the
  // run would delete the specs of any concurrent run in the same project.
  const specRoot = getRunTempDir(ctx.root, 'tests')

  try {
    return await runTests(ctx, options, specRoot)
  }
  finally {
    // Remove the generated specs on every path, including failures.
    await fs.remove(specRoot).catch(() => {})
  }
}

/**
 * Collects the targeted stories, generates their specs and runs them.
 * @param ctx The histoire context.
 * @param options Run options (see {@link RunHistoireTestsOptions}).
 * @param specRoot Directory owned by this run, where the specs are generated.
 */
async function runTests(ctx: Context, options: RunHistoireTestsOptions, specRoot: string): Promise<HistoireTestRunSummary> {
  const startTime = performance.now()
  const hasExplicitSelection = Boolean(options.storyId || options.variantId)
  ensureProjectVitest(ctx)
  // Checked here rather than in the CLI command: a run triggered from the dev
  // UI needs the same actionable message, and both resolve from the context
  // root instead of whatever directory the process happens to run in.
  await ensureBrowserTestDepsInstalled(ctx.root)
  if (!options.skipStoryScan) {
    await findAllStories(ctx)
    await scanMarkdownFiles(ctx)
  }

  const targetStoryFiles = getTargetStoryFiles(ctx, options)
  // `onTest` is registered at runtime at any call depth (shared helpers,
  // renamed imports…), so only executing the story reveals whether it defines
  // tests: the browser collection is the sole source of eligibility.
  const collection = targetStoryFiles.length
    ? await collectStoriesBrowser(ctx, {
      storyFiles: targetStoryFiles,
      // The dev server keeps collecting into its own story file objects
      // while this run is in flight — never write back into them.
      applyToContext: !options.skipStoryScan,
      // Discovering eligibility means collecting stories the user never asked
      // about: one broken unrelated story must not abort their test run.
      tolerateStoryFailures: true,
    })
    : { files: [], failures: [] }

  assertTargetedStoriesCollected(collection.failures, targetStoryFiles, options)
  warnAboutUncollectedStories(collection.failures)

  const specFiles = await generateSpecFiles(
    collection.files.filter(collected => collected.hasTests).map(collected => collected.storyFile),
    specRoot,
  )
  const selectedSpecFiles = selectSpecFiles(specFiles, options)
  if (hasExplicitSelection && selectedSpecFiles.length === 0) {
    console.warn(pc.yellow(formatNoMatchingTestsWarning(options)))
    return withUncollectedStories(createEmptyTestSummary(), collection.failures)
  }

  const { filter, options: vitestOptions } = parseCLI(['vitest', ...(options.rawVitestArgs ?? [])], {
    allowUnknownOptions: true,
  })
  const include = selectedSpecFiles.map(item => item.path)
  if (include.length === 0) {
    return withUncollectedStories(createEmptyTestSummary(), collection.failures)
  }
  if (vitestOptions.watch) {
    console.warn(pc.yellow('`histoire test` does not support watch mode yet — running once.'))
  }

  const summary = await runVitestAttempts<undefined, HistoireTestRunSummary>({
    label: CLEANUP_LABEL,
    retryMessage: 'Retrying Histoire tests after Vitest browser optimizer reload',
    // Rebuilt per attempt: the config carries live plugin instances bound to
    // the Vite server of the attempt that created them.
    setup: async () => {
      const runtimeConfig = await getTestVitestConfig(ctx, include)
      debugVitestBrowserLifecycle('test:starting vitest...')

      return {
        vitestOptions: {
          passWithNoTests: true,
          include,
          ...runtimeConfig.vitestOptions,
          ...vitestOptions,
          // Invariants last so raw vitest args cannot override them: the run
          // must use Histoire's generated config (a user `--config` module
          // would replace it), and watch mode is unsupported — the runner is
          // torn down right after the first pass either way.
          config: false,
          run: true,
          watch: false,
        },
        viteConfig: runtimeConfig.viteConfig,
        browserProjectOptions: runtimeConfig.vitestOptions,
        filter,
        timeoutMs: getRunTimeout(ctx),
        timeoutMessage: 'Histoire test run timed out. The Vitest browser runner never completed.',
        onTimeout: reportStuckTestRun,
        context: undefined,
      }
    },
    read: (vitest) => {
      debugVitestBrowserLifecycle('test:vitest.start() resolved')
      assertVitestRunHasNoUnhandledErrors(vitest)

      const testModules = vitest.state.getTestModules()
      assertVitestModulesHaveNoErrors(testModules)
      warnAboutMissingTestModules(testModules, include)
      return withUncollectedStories(summarizeResults(testModules, specFiles), collection.failures)
    },
  })

  console.log(pc.blue(`Histoire tests finished in ${Math.round(performance.now() - startTime)}ms`))
  return summary
}
