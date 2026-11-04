import type { ViteDevServer } from 'vite'
import type { StartupProgress } from '../runtime/terminal/progress.js'
import type { createStoryCollector } from './collect.js'
import { prepareDevClient, waitForDevClientOptimizer } from './client-ready.js'

/** Inputs of {@link runInitialCollection}. */
export interface InitialCollectionOptions {
  /** Collector owned by the generation. */
  collector: Pick<ReturnType<typeof createStoryCollector>, 'collect' | 'restore' | 'revalidate'>
  /** Client-facing Vite server. */
  server: ViteDevServer
  /** Observer of real startup work. */
  progress: StartupProgress
  /** Skips catalog restoration (fresh generation). */
  fresh?: boolean
  /** Throws when the generation was cancelled or superseded. */
  checkActive: () => void
}

/**
 * Brings the catalog to a usable state: the previous run's catalog when still
 * valid (revalidated in the background), otherwise a full collection followed by
 * the client warmup. Resolves when the generation may be published as ready.
 */
export async function runInitialCollection({ collector, server, progress, fresh, checkActive }: InitialCollectionOptions): Promise<void> {
  let restored = false
  if (fresh) {
    progress.skip('restore', 'fresh restart')
  }
  else {
    progress.begin('restore')
    try {
      restored = await collector.restore()
    }
    catch (error) {
      progress.fail('restore', error)
      throw error
    }
    if (restored) progress.complete('restore')
    else progress.skip('restore', 'no usable cache')
  }
  if (!restored) {
    await progress.track('collect', () => collector.collect())
    await progress.track('warmup', () => prepareDevClient(server), 'client modules')
    checkActive()
    return
  }
  await progress.track('warmup', () => waitForDevClientOptimizer(server), 'dependency optimizer')
  checkActive()
  // The restored catalog is already published: warmup and revalidation continue
  // in the background, one after the other, and never gate readiness.
  progress.begin('revalidate', 'client modules', { background: true })
  void prepareDevClient(server)
    .then(() => {
      progress.update('revalidate', { label: 'story collection' })
      return collector.revalidate()
    })
    .then(() => progress.complete('revalidate'))
    .catch((error) => {
      progress.fail('revalidate', error)
      console.error(error)
    })
}
