import type { HistoireTestRunSummary, ServerStoryFile } from '@histoire/shared'
import type { StoryCollectionFailure } from '../story-collection/index.js'
import type { RunHistoireTestsOptions } from './types.js'
import pc from 'picocolors'
// Imported from the concrete module rather than the package barrel: the run
// specs mock that barrel to stub the browser collection, which would otherwise
// take this pure formatter down with it.
import { formatStoryCollectionFailure } from '../story-collection/assert.js'

/**
 * Fails the run when a story the caller explicitly asked for could not be
 * collected.
 *
 * Tolerating an unrelated broken story is a convenience; tolerating the very
 * story the user targeted would answer "no tests matched" to a request we
 * simply failed to honour.
 * @param failures Stories that failed to collect.
 * @param targetStoryFiles The story files this run was narrowed down to.
 * @param options The run options carrying the explicit filters.
 */
export function assertTargetedStoriesCollected(
  failures: StoryCollectionFailure[],
  targetStoryFiles: ServerStoryFile[],
  options: RunHistoireTestsOptions,
) {
  if (!options.storyId || !failures.length) {
    return
  }

  const targeted = new Set(targetStoryFiles.map(storyFile => storyFile.relativePath))
  const blocking = failures.filter(failure => targeted.has(failure.relativePath))
  if (!blocking.length) {
    return
  }

  throw new Error(
    `Histoire could not collect the story targeted by this test run (storyId="${options.storyId}"):\n\n${
      blocking.map(formatStoryCollectionFailure).join('\n\n')}`,
  )
}

/**
 * Warns about every story that could not be collected, naming it and its error.
 * @param failures Stories that failed to collect.
 */
export function warnAboutUncollectedStories(failures: StoryCollectionFailure[]) {
  if (!failures.length) {
    return
  }

  for (const failure of failures) {
    console.warn(pc.yellow(`⚠️  Could not collect story ${failure.relativePath} — its tests (if any) did not run.\n${failure.error}`))
  }

  console.warn(pc.yellow(`⚠️  ${failures.length} ${failures.length === 1 ? 'story' : 'stories'} could not be collected. Whether they define tests is unknown, so this run is reported as failed.`))
}

/**
 * Records the uncollected stories in the run summary and marks the run failed.
 *
 * A story that never executed may well have registered tests, so a run that
 * skipped it cannot honestly report success — that is exactly the silent
 * false-green the browser-based eligibility check exists to prevent.
 * @param summary The summary of the tests that did run.
 * @param failures Stories that failed to collect.
 */
export function withUncollectedStories(
  summary: HistoireTestRunSummary,
  failures: StoryCollectionFailure[],
): HistoireTestRunSummary {
  if (!failures.length) {
    return summary
  }

  return {
    ...summary,
    ok: false,
    errors: [...summary.errors, ...failures.map(failure => ({
      name: 'HistoireStoryCollectionError',
      message: formatStoryCollectionFailure(failure),
    }))],
    uncollectedStories: failures.map(failure => ({
      relativePath: failure.relativePath,
      error: failure.error,
    })),
  }
}
