import type { HistoireProjectTestCollectionResult, HistoireTestRunSummary } from '@histoire/protocol'
import type { WorkbenchTestsOptions } from './types.js'
import { HistoireSdkError } from '@histoire/protocol'
import { STORY_CHANGED_EVENT } from '../../../util/hot.js'

/** Adapt existing correlated plugin channel; server retains shared execution-lane ownership. */
export function createDevWorkbenchTestsOptions(window: Window): WorkbenchTestsOptions {
  let storage: Storage | undefined
  try {
    storage = window.localStorage
  }
  catch { /* Blocked preferences cannot prevent explicit server execution. */ }
  /** One request owns one runner; aborting retires publication until server teardown. */
  function request<T>(event: 'runStoryTests' | 'collectStoryTests', target: { storyId?: string, variantId?: string | null }, signal: AbortSignal) {
    const api = window.__HST_PLUGIN_API__
    if (!api) return Promise.reject(new HistoireSdkError('CAPABILITY_UNAVAILABLE', 'Server test execution is unavailable'))
    signal.throwIfAborted()
    return new Promise<T>((resolve, reject) => {
      const cancel = () => reject(new HistoireSdkError('CANCELLED', 'Project tests cancelled'))
      signal.addEventListener('abort', cancel, { once: true })
      // A project request collects once, then Vitest owns test-file parallelism.
      // Server requests still share the same UI/MCP execution/teardown lane.
      void api.sendEvent(event, target, signal).then((summary: T) => {
        if (!signal.aborted) resolve(summary)
      }, reject).finally(() => signal.removeEventListener('abort', cancel))
    })
  }
  /** Assertion results stay distinct from definition-only discovery. */
  const run = (target: { storyId?: string, variantId?: string | null }, signal: AbortSignal) => request<HistoireTestRunSummary>('runStoryTests', target, signal)
  return { storage, run, collectProject: signal => request<HistoireProjectTestCollectionResult>('collectStoryTests', {}, signal), collectStory: (storyId, signal) => request<HistoireProjectTestCollectionResult>('collectStoryTests', { storyId }, signal),
    /** Project execution avoids starting an isolated Vitest worker per variant. */
    runProject: signal => run({}, signal),
    /** Watch executes all variants in one changed story with one worker. */
    runStory: (storyId, signal) => run({ storyId }, signal),
    /** HMR already identifies affected story; no polling or duplicate source watcher. */
    onStoryChanged(listener) {
      if (!import.meta.hot) return () => {}
      const changed = (payload: { storyId?: string }) => {
        if (payload.storyId) listener(payload.storyId)
      }
      import.meta.hot.on(STORY_CHANGED_EVENT, changed)
      return () => import.meta.hot?.off(STORY_CHANGED_EVENT, changed)
    } }
}
