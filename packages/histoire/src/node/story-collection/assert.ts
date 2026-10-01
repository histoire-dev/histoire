import type { TestModule, Vitest } from 'vitest/node'
import type { Context } from '../context.js'
import type { CollectionSpecFile, StoryCollectionFailure } from './types.js'
import { normalize } from 'pathe'
import { formatVitestError, getUnhandledVitestErrors } from '../util/vitest-errors.js'

/**
 * What the collection channel received for one run.
 */
interface CollectionPayload {
  results: Map<string, { file: string }>
  failures: Map<string, { error: string }>
}

/**
 * Everything that went wrong during a browser collection run, split by whether
 * it can be blamed on a single story.
 */
export interface CollectionRunDiagnostics {
  /**
   * Errors that cannot be attributed to one story: unhandled browser errors, or
   * a module error in the shared collector module. They break every story of
   * the run, so they always abort it.
   */
  fatalErrors: string[]
  /** Errors attributed to a single story file each. */
  storyFailures: StoryCollectionFailure[]
}

/**
 * Message used when a story produced neither a result nor an explicit failure.
 */
const MISSING_RESULT_MESSAGE = 'The browser collection spec never reported a result for this story.\n'
  + 'This usually means the spec failed to execute in the browser (e.g. import resolution error).\n'
  + 'Run with HST_DEBUG_BROWSER=1 for more details.'

/**
 * Inspects a finished browser collection run and reports what failed.
 *
 * Attribution matters: `histoire test` collects every story only to discover
 * which ones register tests, so a single broken story must be reportable on its
 * own instead of aborting the whole run. Only errors that cannot be traced back
 * to one story stay fatal.
 * @param storyFiles The story files the run was supposed to collect.
 * @param vitest The Vitest instance that ran the collection.
 * @param testModules The test modules Vitest executed.
 * @param collectionPayload What the collection channel received for this run.
 * @param specFiles The generated specs, used to map a module back to its story.
 */
export function analyzeCollectionRun(
  storyFiles: Context['storyFiles'],
  vitest: Vitest,
  testModules: TestModule[],
  collectionPayload: CollectionPayload,
  specFiles: CollectionSpecFile[],
): CollectionRunDiagnostics {
  const fatalErrors: string[] = []
  // Deduplicated per story: a broken story reports the same error twice (once
  // through the HTTP channel, once as its rethrown spec test failure).
  const errorsByStory = new Map<string, Set<string>>()
  const addStoryError = (relativePath: string, error: string) => {
    const errors = errorsByStory.get(relativePath) ?? new Set<string>()
    errors.add(error)
    errorsByStory.set(relativePath, errors)
  }

  for (const [relativePath, failure] of collectionPayload.failures) {
    addStoryError(relativePath, failure.error)
  }

  // Unhandled errors are page-level: Vitest cannot tell which spec caused them.
  fatalErrors.push(...getUnhandledVitestErrors(vitest))

  const storyBySpecPath = new Map(specFiles.map(spec => [normalize(spec.path), spec.relativePath]))
  for (const module of testModules) {
    const moduleErrors = [
      // Module-level errors (syntax errors, import resolution failures that
      // prevent test() from registering).
      ...module.errors().map(formatVitestError),
      ...Array.from(module.children.allTests())
        .filter(task => task.result().state === 'failed')
        .flatMap(task => (task.result().errors ?? []).map(formatVitestError)),
    ]
    if (!moduleErrors.length) {
      continue
    }

    const relativePath = storyBySpecPath.get(normalize(module.moduleId))
    if (relativePath) {
      moduleErrors.forEach(error => addStoryError(relativePath, error))
    }
    else {
      // An unknown module means the shared collector module itself broke, which
      // takes every story down with it.
      fatalErrors.push(...moduleErrors)
    }
  }

  for (const storyFile of storyFiles) {
    if (collectionPayload.results.has(storyFile.relativePath) || errorsByStory.has(storyFile.relativePath)) {
      continue
    }
    addStoryError(storyFile.relativePath, MISSING_RESULT_MESSAGE)
  }

  const storyFailures = Array.from(errorsByStory, ([relativePath, errors]) => ({
    relativePath,
    error: Array.from(errors).join('\n\n'),
  }))

  // Nothing at all came back *and* nothing could be blamed on a story: the
  // browser run itself is broken (provider crash, dev server unreachable…).
  // Reporting that as N independent story failures would bury an infrastructure
  // problem under per-story warnings.
  //
  // Stories that did report their own error are excluded from this: a run
  // narrowed down to a single story (`histoire test --story`) otherwise always
  // lands here, turning that story's own failure into a fatal error and
  // defeating `tolerateStoryFailures`.
  const nothingAttributable = storyFailures.every(failure => failure.error === MISSING_RESULT_MESSAGE)
  if (storyFiles.length && !collectionPayload.results.size && nothingAttributable) {
    return {
      fatalErrors: [...fatalErrors, ...storyFailures.map(formatStoryCollectionFailure)],
      storyFailures: [],
    }
  }

  return { fatalErrors, storyFailures }
}

/**
 * Formats one story failure as a printable block.
 * @param failure The failure to format.
 */
export function formatStoryCollectionFailure(failure: StoryCollectionFailure) {
  return `${failure.relativePath}:\n${failure.error}`
}

/**
 * Builds the error thrown when a browser collection run cannot be recovered.
 * @param errors The formatted error blocks to report.
 */
export function createCollectionFailedError(errors: string[]) {
  return new Error(`Histoire browser collection failed:\n\n${errors.join('\n\n')}`)
}
