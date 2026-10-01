import type { Context } from '../context.js'
import type { GeneratedSpecFile, RunHistoireTestsOptions } from './types.js'

/**
 * Restricts the stories handed to the browser collection when the run targets
 * a single story. Collecting the whole project for a one-variant dev run is
 * both slow and fragile: any unrelated broken story would fail the collection.
 * @param ctx The histoire context.
 * @param options The run options carrying the optional story filter.
 */
export function getTargetStoryFiles(ctx: Context, options: RunHistoireTestsOptions) {
  if (!options.storyId) {
    return ctx.storyFiles
  }

  return ctx.storyFiles.filter(file => file.story?.id === options.storyId || file.id === options.storyId)
}

/**
 * Keeps only the generated specs matching the run's explicit story/variant
 * filter.
 * @param specFiles Every generated spec of the run.
 * @param options The run options carrying the filters.
 */
export function selectSpecFiles(specFiles: GeneratedSpecFile[], options: RunHistoireTestsOptions) {
  return specFiles.filter((item) => {
    if (options.storyId && item.storyId !== options.storyId) return false
    if (options.variantId && item.variantId !== options.variantId) return false
    return true
  })
}

/**
 * Formats warning when explicit filters produce no runnable story tests.
 * @param options The run options carrying the filters.
 */
export function formatNoMatchingTestsWarning(options: RunHistoireTestsOptions) {
  const filters = [
    options.storyId ? `storyId="${options.storyId}"` : null,
    options.variantId ? `variantId="${options.variantId}"` : null,
  ].filter(Boolean).join(', ')

  return `No histoire tests matched ${filters}. Skipping test run.`
}
