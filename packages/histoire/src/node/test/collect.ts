import type { HistoireProjectTestCollectionResult, HistoireTestCollectionResult } from '@histoire/protocol'
import type { Context } from '../context.js'
import type { RunHistoireTestsOptions } from './types.js'
import { basename } from 'node:path'
import { HistoireSdkError, validateProjectTestCollection } from '@histoire/protocol'
import { serializeTestErrors } from '@histoire/shared'
import fs from 'fs-extra'
import { normalize } from 'pathe'
import { validId } from '../runtime/catalog/lookup.js'
import { getRunTempDir } from '../util/temp-paths.js'
import { throwIfTestAborted } from '../util/test-abort.js'
import { getCollectTimeout } from '../util/test-timeouts.js'
import { assertVitestRunHasNoUnhandledErrors } from '../util/vitest-errors.js'
import { runVitestAttempts } from '../util/vitest-run.js'
import { ensureBrowserTestDepsInstalled, ensureProjectVitest } from './preflight.js'
import { generateSpecFiles } from './spec-files.js'
import { getTestVitestConfig } from './vitest-config.js'

/** Collect mounted variant definitions from captured dev metadata, without executing tests. */
export async function collectHistoireProjectTests(ctx: Context, options: RunHistoireTestsOptions = {}): Promise<HistoireProjectTestCollectionResult> {
  if (options.isolate) {
    const { collectIsolatedHistoireTests } = await import('./isolated.js')
    return collectIsolatedHistoireTests(ctx, options)
  }
  throwIfTestAborted(options.signal)
  if (options.storyId !== undefined && !validId(options.storyId)) throw new HistoireSdkError('INVALID_ARGUMENT', 'Test target IDs must be non-empty strings')
  const stories = ctx.storyFiles.filter(file => file.story && !file.story.docsOnly && (options.storyId === undefined || file.story.id === options.storyId))
  if (options.storyId !== undefined && !stories.length) throw new HistoireSdkError('STORY_NOT_FOUND', 'Requested story could not be resolved')
  if (options.storyId !== undefined && stories.length > 1) throw new HistoireSdkError('STORY_AMBIGUOUS', 'Requested story ID is ambiguous')
  const root = getRunTempDir(ctx.root, 'test-collection')
  const execution = { runId: basename(root), mode: 'server' as const }
  try {
    if (!stories.some(file => file.story!.variants.length)) return { execution, variants: [] }
    ensureProjectVitest(ctx)
    await ensureBrowserTestDepsInstalled(ctx.root)
    throwIfTestAborted(options.signal)
    const specs = await generateSpecFiles(stories, root, 'collect')
    const include = specs.map(spec => spec.path)
    const result = await runVitestAttempts<undefined, HistoireProjectTestCollectionResult>({
      root: ctx.root,
      mode: 'collect',
      signal: options.signal,
      strictCleanup: options.strictCleanup,
      maxRetries: options.maxRetries,
      label: 'Histoire test collection',
      retryMessage: 'Retrying Histoire test collection after Vitest browser optimizer reload',
      async setup() {
        const config = await getTestVitestConfig(ctx, include)
        return {
          vitestOptions: { ...config.vitestOptions, config: false, run: true, watch: false, passWithNoTests: true, include },
          viteConfig: config.viteConfig,
          browserProjectOptions: config.vitestOptions,
          timeoutMs: getCollectTimeout(ctx),
          timeoutMessage: 'Histoire test collection timed out.',
          context: undefined,
        }
      },
      read(vitest) {
        assertVitestRunHasNoUnhandledErrors(vitest)
        const modules = new Map(vitest.state.getTestModules().map(module => [normalize(module.moduleId), module]))
        return { execution, variants: specs.map((spec) => {
          const module = modules.get(normalize(spec.path))
          const failures = module?.errors() ?? []
          const tasks = module ? [...module.children.allTests()] : []
          const collection = (tasks[0]?.meta() as { histoireCollection?: HistoireTestCollectionResult } | undefined)?.histoireCollection
          const error = failures.length ? serializeTestErrors(failures)[0] : 'Test collection metadata unavailable'
          return { target: { storyId: spec.storyId, variantId: spec.variantId }, collection: !failures.length && collection ? collection : { definitions: [], error } }
        }) }
      },
    })
    validateProjectTestCollection(result)
    return result
  }
  finally { await fs.remove(root) }
}
