import type { TerminalHandlerContext } from '../registry.js'
import type { WatchScheduler } from './scheduler.js'
import { getAffectedSelector } from '../affected/index.js'
import { getTestsService } from '../tests/index.js'
import { createWatchScheduler } from './scheduler.js'

/** One scheduler per runtime generation; it dies with the handle. */
const schedulers = new WeakMap<object, WatchScheduler>()

/**
 * Returns the watch scheduler of the context's generation, creating it on first
 * use. Nothing observes files and no dependency graph is built before the first
 * `watch.set` enables watching.
 * @param context Handler context of the current generation.
 */
export function getWatchScheduler(context: TerminalHandlerContext): WatchScheduler {
  let scheduler = schedulers.get(context.handle)
  if (!scheduler) {
    scheduler = createWatchScheduler({
      selector: getAffectedSelector(context),
      tests: getTestsService(context),
      catalog: context.catalog,
      onCollection: handler => context.handle.onCollection(handler),
      emit: state => context.emit('watch.state', state),
      signal: context.signal,
    })
    schedulers.set(context.handle, scheduler)
  }
  return scheduler
}

/**
 * Whether watching was ever enabled for this generation; disabling a never-enabled
 * watch must not create the selector (and its dependency graph).
 * @param context Handler context of the current generation.
 */
export function hasWatchScheduler(context: TerminalHandlerContext): boolean {
  return schedulers.has(context.handle)
}

export { createWatchScheduler } from './scheduler.js'
export type { WatchScheduler, WatchSchedulerOptions } from './scheduler.js'
