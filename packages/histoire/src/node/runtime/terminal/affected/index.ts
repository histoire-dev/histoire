import type { TerminalHandlerContext } from '../registry.js'
import type { AffectedSelector } from './selector.js'
import { createAffectedSelector } from './selector.js'

/** One selector per runtime generation; it dies with the handle. */
const selectors = new WeakMap<object, AffectedSelector>()

/**
 * Returns the affected-story selector of the context's generation, creating,
 * attaching and seeding it on first use. Slice 10 calls this from its watch
 * handler; nothing observes files before that.
 * @param context Handler context of the current generation.
 */
export function getAffectedSelector(context: TerminalHandlerContext): AffectedSelector {
  let selector = selectors.get(context.handle)
  if (!selector) {
    selector = createAffectedSelector({ handle: context.handle, catalog: context.catalog, signal: context.signal })
    selectors.set(context.handle, selector)
    // A catalog completed before first use has no later collection event to wait for.
    if (context.catalog?.current && !context.catalog.updating) void selector.refresh()
  }
  return selector
}

export { createAffectedSelector } from './selector.js'
export type { AffectedListener, AffectedSelector, AffectedSelectorOptions } from './selector.js'
export { AFFECTED_REASON_ORDER } from './types.js'
export type { AffectedChange, AffectedReason, AffectedSelection } from './types.js'
